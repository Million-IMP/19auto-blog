import type { Post } from '@prisma/client';
import { prisma } from '../db';
import { aiService, extractUrlText, remainingTime, withDeadline, type DraftContext, type ImagePlan, type ImageScene, type Outline } from './aiService';
import { imageMode, imageProvider, randomSeed, storeImage } from './imageProvider';
import { applyUpload, isJob, jobItems, sceneAt } from './imageJobs';
import { hasListedAnchor, hasTypingAnchor, isActionHeading, maxRebuilds, needsRetry, paperWord, retryPrompt, scoreScene, stripAiImages, stripStyleWords, textObjectWord } from './imageQuality';
import { relinkUrls, type RelinkPair } from './imageRelink';

// 상태 코드가 있는 오류. 라우트가 그대로 응답 코드로 쓴다.
export class PipelineError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
import { scrapeArticle } from './scraperService';

// 단계형 초안 파이프라인: 단계마다 결과를 저장하고, 실패하면 그 단계부터 다시 시작한다.
export const STAGES = ['SOURCES', 'OUTLINE', 'DRAFT', 'POLISH', 'IMAGES', 'READY'] as const;
export type Stage = (typeof STAGES)[number];

type Excerpt = { url: string; title: string; site: string; text: string };

export type Brief = {
  keyword: string;
  inboxContents: string[];
  materialContents: string[];
  ruleContents: string[];
  excerpts?: Excerpt[];
};

const PROFILE_FIELDS = {
  audience: '읽을 사람',
  purpose: '글의 목적',
  tone: '말투',
  structure: '구성',
  ctaText: '독자의 다음 행동',
  ctaUrl: '행동 연결 URL',
  imageStyle: '이미지 스타일',
  bannedPhrases: '쓰지 않을 표현',
} as const;

type ProfileInput = Partial<Record<keyof typeof PROFILE_FIELDS, string>>;

export async function getBlogProfile() {
  return prisma.blogProfile.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export async function updateBlogProfile(input: ProfileInput) {
  const data: ProfileInput = {};
  for (const key of Object.keys(PROFILE_FIELDS) as (keyof typeof PROFILE_FIELDS)[]) {
    if (input[key] !== undefined) data[key] = String(input[key] || '').trim().slice(0, 500);
  }
  return prisma.blogProfile.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
}

export async function profileText() {
  const profile = await getBlogProfile();
  return (Object.keys(PROFILE_FIELDS) as (keyof typeof PROFILE_FIELDS)[])
    .filter((key) => profile[key])
    .map((key) => `- ${PROFILE_FIELDS[key]}: ${profile[key]}`)
    .join('\n');
}

function headings(content: string) {
  return content
    .split('\n')
    .map((line) => line.match(/^##\s+(.+?)\s*$/)?.[1])
    .filter((h): h is string => Boolean(h));
}

function sectionText(content: string, h2: string) {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${h2}`);
  if (start < 0) return '';
  const end = lines.findIndex((line, i) => i > start && /^##\s/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

function words(text: string) {
  return new Set(text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3));
}

// 두 장면 prompt의 단어 겹침 비율 (0~1). 높으면 같은 그림이 나올 가능성이 크다.
function similarity(a: string, b: string) {
  const wa = words(a);
  const wb = words(b);
  const shared = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : shared / union;
}

async function planImageSet(post: Post): Promise<ImagePlan> {
  const profile = await getBlogProfile();
  const heads = headings(post.content);
  const plan = await aiService.planImages({
    title: post.title,
    keyword: post.keyword || post.title,
    content: post.content,
    headings: heads,
    profileStyle: profile.imageStyle,
  });
  plan.sections = plan.sections
    .map((s) => ({ ...s, h2: (s.h2 || '').trim() }))
    .filter((s, i, all) => heads.includes(s.h2) && all.findIndex((o) => o.h2 === s.h2) === i && hasPrompt(s));

  // 앞 장면과 겹치거나 anchor에 문제가 있는 소제목 장면만 한 번 다시 계획한다. 결과가 또 걸려도 그대로 쓴다.
  // Design Ref: v2 §6 — 표지는 글 전체를 대표하므로 감지하지 않는다(키보드 글의 표지는 키보드다).
  let paperUsed = false;
  for (let i = 0; i < plan.sections.length; i += 1) {
    const scene = plan.sections[i];
    const earlier = [plan.cover, ...plan.sections.slice(0, i)].map((s) => s.prompt);
    const reasons: string[] = [];
    if (earlier.some((p) => similarity(p, scene.prompt) > 0.6)) reasons.push('앞 장면과 구도·소재가 겹쳤습니다.');
    if (hasListedAnchor(scene)) {
      reasons.push(`이전 anchor "${(scene.anchor || '').split(' / ')[0].trim()}"에 개념이 여러 개였습니다. 본문에서 가장 먼저 설명하는 하나만 고르세요.`);
    }
    // Design Ref: image-abstract-scenes §5.3 — 숫자가 그려지는 사물, 뜻이 안 보이는 키보드 장면도 같은 흐름으로 한 번 다시 계획한다.
    const textObject = textObjectWord(scene);
    if (textObject) {
      reasons.push(`"${textObject}"처럼 숫자·글자가 원래 있는 사물은 없애라고 써도 숫자가 그려집니다. 그 사물 없이 같은 뜻을 보여주는 다른 대상을 고르세요.`);
    }
    if (hasTypingAnchor(scene)) {
      reasons.push('키보드 치는 손은 소제목 뜻을 보여주지 못합니다. 소제목 아래 첫 문단의 답이 가리키는 구체 대상을 anchor로 고르세요.');
    }
    // Design Ref: image-scene-followup §5.4 — 할 일 소제목의 빈 종이, 한 글의 두 번째 빈 종이 장면.
    const paper = paperWord(scene);
    if (paper && isActionHeading(scene.h2 || '')) {
      reasons.push(`할 일 소제목은 "${paper}" 같은 빈 종이 대신, 첫 번째 할 일을 그 실제 대상에 하는 장면을 anchor로 고르세요.`);
    } else if (paper && paperUsed) {
      reasons.push('이 글에는 이미 종이 장면이 있습니다. 종이·노트·폴더가 아닌, 소제목 아래 첫 문단의 답이 가리키는 대상을 고르세요.');
    }
    // 다시 계획은 더 나은 장면을 위한 것이라, 시간이 모자라거나 실패하면 원래 장면을 쓴다. 실패로 계획 전체를 버리지 않는다.
    if (reasons.length > 0 && remainingTime() >= REPLAN_MIN_MS) {
      const h2 = scene.h2 as string;
      try {
        const replanned = await aiService.replanScene({ h2, section: sectionText(post.content, h2), style: plan.style, avoidPrompts: earlier, reason: reasons.join(' ') });
        if (hasPrompt(replanned)) plan.sections[i] = { ...replanned, h2 };
      } catch (err: any) {
        console.warn(`[장면 다시 계획] 실패, 원래 장면 유지: ${String(err?.message || err).slice(0, 120)}`);
      }
    }
    if (paperWord(plan.sections[i])) paperUsed = true;
  }
  for (const scene of [plan.cover, ...plan.sections]) scene.prompt = stripStyleWords(scene.prompt);
  return plan;
}

function hasPrompt(scene: Partial<ImageScene> | null | undefined) {
  return typeof scene?.prompt === 'string' && scene.prompt.trim().length > 0;
}

function imageMarkdown(scene: ImageScene) {
  const alt = `${scene.point.slice(0, 80)} (AI 생성)`.replace(/[[\]]/g, '');
  // 이미지 바로 아래 설명글. 이전 계획에는 caption이 없으므로 전달할 뜻(point)으로 대신한다.
  const caption = (scene.caption || scene.point).replace(/[*_]/g, '').trim();
  return `![${alt}](${scene.url})\n*▲ ${caption} (AI 생성 이미지)*`;
}

// 표지는 맨 위, 소제목 이미지는 소제목 아래 첫 문단(먼저 답하는 문장) 다음에 넣는다.
function insertImages(content: string, plan: ImagePlan) {
  const lines = content.split('\n');
  const output: string[] = [];
  if (plan.cover.url) output.push(imageMarkdown(plan.cover), '');
  for (let i = 0; i < lines.length; i += 1) {
    output.push(lines[i]);
    const h2 = lines[i].match(/^##\s+(.+?)\s*$/)?.[1];
    const scene = h2 && plan.sections.find((s) => s.h2 === h2 && s.url);
    if (!scene) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') output.push(lines[j++]);
    while (j < lines.length && lines[j].trim() !== '' && !/^#/.test(lines[j])) output.push(lines[j++]);
    output.push('', imageMarkdown(scene));
    i = j - 1;
  }
  return output.join('\n');
}

// render 모드에서만 부른다. jobs 모드는 PC 작업자가 그림을 올린다(attachImage).
async function renderScene(plan: ImagePlan, scene: ImageScene, options: { prompt?: string } = {}) {
  const seed = randomSeed();
  const image = await imageProvider().render({
    prompt: options.prompt ?? scene.prompt,
    must: scene.must,
    avoid: scene.avoid,
    style: plan.style,
    width: 800,
    height: scene === plan.cover ? 400 : 450,
    seed,
  });
  plan.provider = image.provider;
  return { image, seed };
}

// Design Ref: §2.2 — 점수가 낮은 장면을 대상을 못박은 prompt로 한 번 다시 만든다. 새 이미지 점수가 더 낮으면 원래 이미지를 둔다.
async function retryScene(plan: ImagePlan, scene: ImageScene) {
  try {
    const { image, seed } = await renderScene(plan, scene, { prompt: retryPrompt(scene) });
    // 렌더에 성공했을 때만 재시도 횟수를 쓴다(실패한 요청은 비용이 들지 않는다).
    plan.retries = (plan.retries ?? 0) + 1;
    scene.retried = true;
    const candidate: ImageScene = { ...scene };
    await scoreScene(candidate, image);
    if (candidate.score === undefined || scene.score === undefined || candidate.score >= scene.score) {
      Object.assign(scene, { url: image.url, seed, score: candidate.score, scoreReason: candidate.scoreReason });
    }
  } catch (err: any) {
    console.warn(`[이미지 재생성] 실패, 기존 이미지 유지: ${String(err?.message || err).slice(0, 120)}`);
  }
}

// 장면 하나만 새 seed로 다시 만든다. 본문의 이전 이미지 주소를 새 주소로 바꾼다.
// 파이프라인과 같은 잠금을 잡아, 세트 다시 만들기·크론이 저장하는 계획을 덮어쓰지 않게 한다.
export async function regenerateImage(postId: number, index: number) {
  const found = await prisma.post.findUnique({ where: { id: postId } });
  if (!found) throw new PipelineError('글을 찾을 수 없습니다.', 404);
  if (!(await claimPost(postId))) throw new PipelineError(BUSY_MESSAGE, 409);
  try {
    // 잠금을 잡은 뒤 다시 읽어야 그 사이에 바뀐 계획을 덮어쓰지 않는다.
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    if (!post.imagePlan) throw new PipelineError('이미지 계획이 없는 글입니다.', 409);
    const plan = JSON.parse(post.imagePlan) as ImagePlan;
    const scene = sceneAt(plan, index);
    if (!scene) throw new PipelineError('해당 장면을 찾을 수 없습니다.', 404);
    if (imageMode() === 'jobs') {
      // Plan FR-07 — 그림을 만들지 않고 작업 대기로 둔다. 새 그림이 올라올 때까지 이전 그림과 본문은 그대로다.
      scene.pending = true;
      return await prisma.post.update({ where: { id: postId }, data: { imagePlan: JSON.stringify(plan) } });
    }
    const { image, seed } = await renderScene(plan, scene);
    await scoreScene(scene, image);
    const content = scene.url ? post.content.split(scene.url).join(image.url) : post.content;
    scene.url = image.url;
    scene.seed = seed;
    return await prisma.post.update({ where: { id: postId }, data: { content, imagePlan: JSON.stringify(plan) } });
  } finally {
    await prisma.post.updateMany({ where: { id: postId }, data: { lockedUntil: null } });
  }
}

// Design Ref: prod-ui-check §4.2 — 로컬에만 저장된 이미지 주소를 이미 올린 같은 이름의 Blob 주소로 바꾼다 (이미지 생성 없음).
// Blob에 파일이 있는지 먼저 확인하고, regenerateImage와 같은 잠금 안에서 본문·계획을 함께 저장한다.
export async function relinkPostImages(postId: number, pairs: RelinkPair[]) {
  const found = await prisma.post.findUnique({ where: { id: postId } });
  if (!found) throw new PipelineError('글을 찾을 수 없습니다.', 404);
  const absent = await Promise.all(
    pairs.map(async ({ to }) => {
      const res = await fetch(to, { method: 'HEAD', signal: AbortSignal.timeout(5_000) }).catch(() => null);
      return res?.status === 200 ? null : to.split('/').pop();
    })
  );
  const notUploaded = absent.filter(Boolean);
  if (notUploaded.length) throw new PipelineError(`Blob에 이미지가 없습니다: ${notUploaded.join(', ')}`, 409);
  if (!(await claimPost(postId))) throw new PipelineError(BUSY_MESSAGE, 409);
  try {
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    if (!post.imagePlan) throw new PipelineError('이미지 계획이 없는 글입니다.', 409);
    const result = relinkUrls(post.content, JSON.parse(post.imagePlan) as ImagePlan, pairs);
    if (result.missing.length) throw new PipelineError(`본문/계획에서 주소를 찾지 못했습니다: ${result.missing.join(', ')}`, 409);
    await prisma.post.update({ where: { id: postId }, data: { content: result.content, imagePlan: JSON.stringify(result.plan) } });
    return { id: postId, replaced: result.replaced };
  } finally {
    await prisma.post.updateMany({ where: { id: postId }, data: { lockedUntil: null } });
  }
}

const BUSY_MESSAGE = '다른 실행이 이 글을 처리하고 있습니다. 잠시 후 다시 시도해주세요.';

function averageScore(plan: ImagePlan | null) {
  const scores = plan ? [plan.cover, ...plan.sections].map((s) => s.score).filter((n): n is number => n !== undefined) : [];
  return scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-';
}

// Plan S6 — 본문의 AI 이미지를 지우고 새 계획으로 이미지 세트를 처음부터 다시 만든다.
export async function rebuildImageSet(postId: number, deadline = requestDeadline()) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new PipelineError('글을 찾을 수 없습니다.', 404);
  if (post.status === 'PUBLISHED') throw new PipelineError('이미 발행한 글은 이미지 세트를 다시 만들 수 없습니다.', 409);
  if (post.stage !== 'READY' && post.stage !== 'IMAGES') {
    throw new PipelineError('본문이 완성된 글(이미지 단계 이후)만 이미지 세트를 다시 만들 수 있습니다.', 409);
  }
  // Plan SC-4 — 한 번에 계획 AI 호출과 약 7장의 그림이 든다. 계획(imagePlan)은 지워지므로 횟수는 활동 기록으로 센다.
  const recent = await prisma.systemLog.count({
    where: { event: 'IMAGE_REBUILD', message: { startsWith: `#${postId} ` }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
  });
  if (recent >= maxRebuilds()) {
    throw new PipelineError(`이미지 세트는 24시간에 ${maxRebuilds()}번까지 다시 만들 수 있습니다. 장면별 다시 생성을 써주세요.`, 429);
  }
  // 초기화와 잠금을 한 번에 해서, 그 사이 크론이 이 글을 가져가지 못하게 한다.
  const reset = await prisma.post.updateMany({
    where: { id: postId, ...unlockedWhere() },
    data: { content: stripAiImages(post.content), imagePlan: null, stage: 'IMAGES', stageError: null, lockedUntil: new Date(Date.now() + LOCK_MS) },
  });
  if (reset.count !== 1) throw new PipelineError(BUSY_MESSAGE, 409);
  const previous = post.imagePlan ? (JSON.parse(post.imagePlan) as ImagePlan) : null;
  await prisma.systemLog
    .create({ data: { event: 'IMAGE_REBUILD', message: `#${postId} "${post.title}" 이미지 세트 다시 만들기 (이전 관련성 평균 ${averageScore(previous)})` } })
    .catch(() => {});
  return advancePost(postId, deadline, { claimed: true });
}

// Design Ref: image-jobs §4.2 — 그림을 기다리는 IMAGES 글과 다시 생성 대기 장면이 있는 글. 멈춘 글(stageError)은 이어하기 전까지 뺀다.
// render 모드에서는 크론이 직접 그리는 중인 장면이므로 PC 작업으로 내놓지 않는다(구독 사용량 중복·대시보드 오안내 방지).
export async function listImageJobs() {
  if (imageMode() !== 'jobs') return { scenes: 0, posts: 0, jobs: [] };
  const found = await prisma.post.findMany({
    where: { imagePlan: { not: null }, stageError: null, OR: [{ stage: 'IMAGES' }, { imagePlan: { contains: '"pending":true' } }] },
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, imagePlan: true },
  });
  const jobs = found.flatMap(jobItems);
  return { scenes: jobs.length, posts: new Set(jobs.map((job) => job.postId)).size, jobs };
}

// Plan FR-02 — jobs 모드에서 그림을 기다리는 글은 크론 이어하기 목록(batchSize개, 오래된 순)에서 뺀다. 자리를 차지하면 본문 단계 글이 멈춘다.
export function waitingForImagesWhere() {
  return imageMode() === 'jobs' ? { NOT: { stage: 'IMAGES', imagePlan: { not: null } } } : {};
}

// Design Ref: image-jobs §4.2 — PC에서 올린 그림 1장을 작업 대기 장면에 넣고 채점한다. regenerateImage와 같은 잠금 안에서 저장하고,
// IMAGES 글의 마지막 작업이면 본문에 넣어 READY로 만든다.
export async function attachImage(postId: number, index: number, upload: { data: Buffer; mediaType: string; source: string }) {
  const found = await prisma.post.findUnique({ where: { id: postId } });
  if (!found) throw new PipelineError('글을 찾을 수 없습니다.', 404);
  if (!(await claimPost(postId))) throw new PipelineError(BUSY_MESSAGE, 409);
  const startedAt = Date.now();
  try {
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    if (!post.imagePlan) throw new PipelineError('이미지 계획이 없는 글입니다.', 409);
    const plan = JSON.parse(post.imagePlan) as ImagePlan;
    const scene = sceneAt(plan, index);
    if (!scene) throw new PipelineError('해당 장면을 찾을 수 없습니다.', 404);
    if (!isJob(scene)) throw new PipelineError('이 장면은 작업 대기가 아닙니다.', 409);

    const url = await storeImage(upload.data, upload.mediaType);
    let content = applyUpload(post.content, plan, scene, { url, source: upload.source });
    await scoreScene(scene, { url, data: upload.data, mediaType: upload.mediaType });
    const remaining = [plan.cover, ...plan.sections].filter(isJob).length;
    const ready = post.stage === 'IMAGES' && remaining === 0;
    if (ready) content = insertImages(content, plan);
    const saved = await prisma.post.update({
      where: { id: postId },
      data: { content, imagePlan: JSON.stringify(plan), ...(ready ? { stage: 'READY', stageError: null } : {}) },
    });
    await prisma.systemLog
      .create({ data: { event: 'IMAGE_UPLOAD', message: `#${postId} 장면 ${index} 그림 올림 (${upload.source}, 관련성 ${scene.score ?? '-'}, 남은 ${remaining}장)` } })
      .catch(() => {});
    if (ready) await logPostResult(post, saved, startedAt);
    // completed: 이번 업로드로 글이 READY가 됐다 (이미 READY인 글의 장면 교체는 false)
    return { id: postId, index, url, score: scene.score ?? null, remaining, stage: saved.stage, completed: ready };
  } finally {
    await prisma.post.updateMany({ where: { id: postId }, data: { lockedUntil: null } });
  }
}

export async function createPipelinePost(input: { brief: Brief; inboxId?: number | null }) {
  const keyword = input.brief.keyword.trim();
  return prisma.post.create({
    data: {
      title: `[작성 중] ${keyword || '새 초안'}`,
      content: '',
      status: 'DRAFT',
      keyword: keyword || null,
      platform: 'NAVER_BLOG',
      inboxId: input.inboxId ?? null,
      stage: 'SOURCES',
      brief: JSON.stringify(input.brief),
    },
  });
}

function readBrief(post: Post): Brief {
  if (!post.brief) throw new Error('파이프라인 입력(brief)이 없는 글입니다.');
  return JSON.parse(post.brief);
}

function readOutline(post: Post): Outline {
  if (!post.outline) throw new Error('목차가 없습니다. OUTLINE 단계부터 다시 실행해야 합니다.');
  return JSON.parse(post.outline);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// 수집 원문에서 뽑은 URL만 서버가 가져온다. 내부망 주소는 가져오지 않는다.
export function isPublicUrl(raw: string) {
  try {
    const { protocol, hostname } = new URL(raw);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.startsWith('[')) return false;
    if (/^(0|10|127)\./.test(hostname) || /^169\.254\./.test(hostname) || /^192\.168\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function readSource(url: string): Promise<{ excerpt: Excerpt | null; line: string }> {
  if (!isPublicUrl(url)) {
    return { excerpt: null, line: `- ${url} · 확인 필요(내부망·지원하지 않는 주소라 읽지 않음)` };
  }
  const article = await scrapeArticle(url).catch(() => null);
  if (article?.fullText.trim()) {
    return {
      excerpt: { url, title: article.title, site: article.siteName, text: article.fullText.slice(0, 3000) },
      line: `- [${article.title || url}](${url}) · ${article.siteName} · 확인일 ${today()} · 관찰(원문 읽음)`,
    };
  }
  // 스크래퍼가 막힌 사이트도 단순 요청은 열리는 경우가 있어 한 번 더 시도한다.
  const text = await extractUrlText(url);
  if (text.startsWith('(URL 내용을 가져오는 데 실패')) {
    return { excerpt: null, line: `- ${url} · 확인일 ${today()} · 확인 필요(원문을 읽지 못함)` };
  }
  return {
    excerpt: { url, title: url, site: new URL(url).hostname, text },
    line: `- ${url} · 확인일 ${today()} · 관찰(본문 일부만 읽음)`,
  };
}

async function collectSources(brief: Brief) {
  const urls = Array.from(new Set(brief.inboxContents.join('\n').match(/https?:\/\/[^\s)]+/g) || [])).slice(0, 5);
  const results = await Promise.all(urls.map(readSource));
  const excerpts = results.map((r) => r.excerpt).filter((e): e is Excerpt => e !== null);
  const lines = results.map((r) => r.line);
  if (urls.length === 0) lines.push(`- 외부 출처 없음 · 수집 메모만 사용 · 확인 필요`);
  return { excerpts, markdown: lines.join('\n') };
}

// 프롬프트 입력 상한. 단계마다 같은 자료를 다시 보내므로 길이를 묶어 둔다.
function cap(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}\n…(이하 생략)` : text;
}

function draftContext(brief: Brief, sources: string, profile: string): DraftContext {
  const excerpts = (brief.excerpts || []).map((e) => `[원문: ${e.title} (${e.site})]\n${e.text}`);
  return {
    materials: cap([...brief.inboxContents, ...excerpts].join('\n\n'), 12_000),
    sources,
    materialTemplates: brief.materialContents.map((m) => cap(m, 2_000)),
    ruleTemplates: brief.ruleContents.map((r) => cap(r, 1_000)),
    profile,
  };
}

async function runStage(current: Post): Promise<Post> {
  let post = current;
  const where = { id: post.id };
  switch (post.stage as Stage) {
    case 'SOURCES': {
      const brief = readBrief(post);
      const { excerpts, markdown } = await collectSources(brief);
      return prisma.post.update({
        where,
        data: { sources: markdown, brief: JSON.stringify({ ...brief, excerpts }), stage: 'OUTLINE' },
      });
    }
    case 'OUTLINE': {
      const brief = readBrief(post);
      const outline = await aiService.generateOutline({
        ...draftContext(brief, post.sources || '', await profileText()),
        keyword: brief.keyword,
      });
      return prisma.post.update({
        where,
        data: { outline: JSON.stringify(outline), title: outline.title, keyword: outline.keyword, stage: 'DRAFT' },
      });
    }
    case 'DRAFT': {
      const content = await aiService.generateBody({
        ...draftContext(readBrief(post), post.sources || '', await profileText()),
        outline: readOutline(post),
      });
      return prisma.post.update({ where, data: { content, stage: 'POLISH' } });
    }
    case 'POLISH': {
      const polished = await aiService.polishBody(post.content, await profileText());
      return prisma.post.update({
        where,
        data: { content: polished.content, polishNotes: polished.notes, stage: 'IMAGES' },
      });
    }
    case 'IMAGES': {
      // 계획을 먼저 저장해 두면, 렌더링이 실패해도 이어하기 때 계획을 다시 만들지 않는다.
      let plan = post.imagePlan ? (JSON.parse(post.imagePlan) as ImagePlan) : null;
      if (!plan) {
        plan = await planImageSet(post);
        post = await prisma.post.update({ where, data: { imagePlan: JSON.stringify(plan) } });
      }
      if (imageMode() === 'jobs') return waitForImages(post, plan);
      for (const scene of [plan.cover, ...plan.sections]) {
        if (scene.url && scene.checked) continue;
        // 장면마다 저장하므로, 시간이 부족하면 여기서 멈추고 다음 실행이 남은 장면부터 이어간다.
        if (remainingTime() < MIN_STAGE_MS) return post;
        if (scene.url) {
          // 이어하기: 이미지는 만들었지만 채점 전에 멈춘 장면
          await scoreScene(scene, { url: scene.url });
        } else {
          const { image, seed } = await renderScene(plan, scene);
          scene.url = image.url;
          scene.seed = seed;
          await scoreScene(scene, image);
        }
        post = await prisma.post.update({ where, data: { imagePlan: JSON.stringify(plan) } });
        // Plan SC: 관련성 점수가 낮은 장면만, 렌더와 채점을 마칠 시간이 남을 때 한 번 다시 만든다.
        if (needsRetry(scene, plan) && remainingTime() >= RETRY_MIN_MS) {
          await retryScene(plan, scene);
          post = await prisma.post.update({ where, data: { imagePlan: JSON.stringify(plan) } });
        }
      }
      return prisma.post.update({
        where,
        data: { content: insertImages(post.content, plan), imagePlan: JSON.stringify(plan), stage: 'READY' },
      });
    }
    default:
      throw new Error(`알 수 없는 단계: ${post.stage}`);
  }
}

// Plan FR-01 — jobs 모드의 IMAGES 단계는 렌더하지 않는다. 그림은 있지만 채점 전에 멈춘 장면(이전 렌더)만 채점하고,
// 작업이 남으면 그대로 돌려줘 advancePost가 멈추게 한다. 작업이 없으면 본문에 넣고 READY.
async function waitForImages(current: Post, plan: ImagePlan) {
  let post = current;
  const where = { id: post.id };
  for (const scene of [plan.cover, ...plan.sections]) {
    if (!scene.url || scene.checked) continue;
    if (remainingTime() < MIN_STAGE_MS) return post;
    await scoreScene(scene, { url: scene.url });
    post = await prisma.post.update({ where, data: { imagePlan: JSON.stringify(plan) } });
  }
  if ([plan.cover, ...plan.sections].some(isJob)) return post;
  return prisma.post.update({
    where,
    data: { content: insertImages(post.content, plan), imagePlan: JSON.stringify(plan), stage: 'READY' },
  });
}

// 요청 시작 시각 기준 마감. Vercel 함수 제한(vercel.json maxDuration 300초) 안에서 끝내고, 남은 단계는 다음 실행이 이어간다.
// 60초 제한일 때는 DRAFT가 20초 남짓한 시간에 시작해 Request timed out이 났다.
export function requestDeadline() {
  return process.env.VERCEL ? Date.now() + 280_000 : Infinity;
}

// 남은 시간이 이보다 적으면 새 단계를 시작하지 않는다.
const MIN_STAGE_MS = 20_000;
// 재시도는 렌더(최대 40초)와 채점(최대 30초)을 둘 다 끝낼 시간이 있을 때만 한다.
const RETRY_MIN_MS = 60_000;
// 장면 다시 계획 1번(생각 토큰 포함 최대 약 18초)을 마칠 시간
const REPLAN_MIN_MS = 30_000;
// 계획이 없는 IMAGES 단계는 계획(23~34초, 최악 약 66초)과 다시 계획을 마칠 시간이 있을 때만 시작한다.
// POLISH 직후 20초만 남았을 때 시작하면 시간 초과로 stageError가 되고, 크론은 그 글을 건너뛴다.
const IMAGE_PLAN_MIN_MS = 120_000;

function stageMinMs(post: Post) {
  return post.stage === 'IMAGES' && !post.imagePlan ? IMAGE_PLAN_MIN_MS : MIN_STAGE_MS;
}
// 단계 실행 중 잠금. 크론과 이어하기가 다른 인스턴스에서 같은 글을 동시에 처리하지 않게 한다.
const LOCK_MS = 5 * 60_000;

export function unlockedWhere() {
  return { OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] };
}

async function claimPost(postId: number) {
  const claimed = await prisma.post.updateMany({
    where: { id: postId, ...unlockedWhere() },
    data: { lockedUntil: new Date(Date.now() + LOCK_MS) },
  });
  return claimed.count === 1;
}

// 글 하나의 결과(완성·단계 실패)를 활동 기록에 남긴다. 기록 실패가 작성을 막지 않게 한다.
async function logPostResult(before: Post, after: Post, startedAt: number) {
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  const name = `#${after.id} "${after.title}"`;
  let entry: { event: string; message: string } | null = null;
  if (after.stage === 'READY' && before.stage !== 'READY') {
    entry = { event: 'POST_READY', message: `${name} 초안 완성 (${before.stage}부터, ${seconds}초)` };
  } else if (after.stageError && after.stageError !== before.stageError) {
    entry = { event: 'POST_STAGE_ERROR', message: `${name} ${after.stageError} (${seconds}초)` };
  }
  if (entry) await prisma.systemLog.create({ data: entry }).catch(() => {});
}

// claimed: 호출한 쪽이 이미 잠금을 잡았다(세트 다시 만들기).
export async function advancePost(
  postId: number,
  deadline = requestDeadline(),
  options: { clearError?: boolean; claimed?: boolean } = {},
): Promise<Post> {
  let post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new Error('글을 찾을 수 없습니다.');
  if (post.stage === 'READY' || (!options.claimed && !(await claimPost(postId)))) return post;
  const startPost = post;
  const startedAt = Date.now();
  try {
    if (options.clearError && post.stageError) {
      post = await prisma.post.update({ where: { id: postId }, data: { stageError: null } });
    }
    while (post.stage !== 'READY' && !post.stageError && deadline - Date.now() >= stageMinMs(post)) {
      const current: Post = post;
      try {
        await prisma.post.update({ where: { id: postId }, data: { lockedUntil: new Date(Date.now() + LOCK_MS) } });
        post = await withDeadline(deadline, () => runStage(current));
        // Plan FR-02 — 진행이 없으면(이미지 작업 대기) 같은 단계를 다시 돌리지 않는다. 로컬은 마감이 없어 끝나지 않는다.
        if (post.stage === current.stage && post.imagePlan === current.imagePlan) break;
      } catch (err: any) {
        const message = `[${current.stage}] ${String(err?.message || err)}`.slice(0, 300);
        await prisma.post.updateMany({ where: { id: postId }, data: { stageError: message } });
        const latest = await prisma.post.findUnique({ where: { id: postId } });
        if (!latest) throw new Error('작성 중에 글이 삭제되었습니다.');
        post = latest;
      }
    }
    await logPostResult(startPost, post, startedAt);
    return post;
  } finally {
    await prisma.post.updateMany({ where: { id: postId }, data: { lockedUntil: null } });
  }
}

export async function resumePost(postId: number, deadline = requestDeadline()) {
  return advancePost(postId, deadline, { clearError: true });
}
