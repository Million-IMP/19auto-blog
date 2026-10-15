import type { Post } from '@prisma/client';
import { prisma } from '../db';
import { aiService, extractUrlText, remainingTime, withDeadline, type DraftContext, type ImagePlan, type ImageScene, type Outline } from './aiService';
import { imageProvider, randomSeed } from './imageProvider';
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
    .filter((s, i, all) => heads.includes(s.h2) && all.findIndex((o) => o.h2 === s.h2) === i);

  // 앞 장면과 겹치는 장면만 한 번 다시 계획한다.
  for (let i = 0; i < plan.sections.length; i += 1) {
    const earlier = [plan.cover, ...plan.sections.slice(0, i)].map((s) => s.prompt);
    if (earlier.some((p) => similarity(p, plan.sections[i].prompt) > 0.6)) {
      const h2 = plan.sections[i].h2 as string;
      const replanned = await aiService.replanScene({ h2, section: sectionText(post.content, h2), style: plan.style, avoidPrompts: earlier });
      plan.sections[i] = { ...replanned, h2 };
    }
  }
  return plan;
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

// 장면 하나만 새 seed로 다시 만든다. 본문의 이전 이미지 주소를 새 주소로 바꾼다.
export async function regenerateImage(postId: number, index: number) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post?.imagePlan) throw new Error('이미지 계획이 없는 글입니다.');
  const plan = JSON.parse(post.imagePlan) as ImagePlan;
  const scene = index === 0 ? plan.cover : plan.sections[index - 1];
  if (!scene) throw new Error('해당 장면을 찾을 수 없습니다.');
  const seed = randomSeed();
  const image = await imageProvider().render({
    prompt: scene.prompt,
    must: scene.must,
    avoid: scene.avoid,
    style: plan.style,
    width: 800,
    height: index === 0 ? 400 : 450,
    seed,
  });
  const content = scene.url ? post.content.split(scene.url).join(image.url) : post.content;
  scene.url = image.url;
  scene.seed = seed;
  plan.provider = image.provider;
  return prisma.post.update({ where: { id: postId }, data: { content, imagePlan: JSON.stringify(plan) } });
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
      const provider = imageProvider();
      for (const scene of [plan.cover, ...plan.sections]) {
        if (scene.url) continue;
        // 장면마다 저장하므로, 시간이 부족하면 여기서 멈추고 다음 실행이 남은 장면부터 이어간다.
        if (remainingTime() < MIN_STAGE_MS) return post;
        const seed = randomSeed();
        const isCover = scene === plan.cover;
        const image = await provider.render({ prompt: scene.prompt, must: scene.must, avoid: scene.avoid, style: plan.style, width: 800, height: isCover ? 400 : 450, seed });
        scene.url = image.url;
        scene.seed = seed;
        plan.provider = image.provider;
        post = await prisma.post.update({ where, data: { imagePlan: JSON.stringify(plan) } });
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

// 요청 시작 시각 기준 마감. Vercel 함수 제한(vercel.json maxDuration 300초) 안에서 끝내고, 남은 단계는 다음 실행이 이어간다.
// 60초 제한일 때는 DRAFT가 20초 남짓한 시간에 시작해 Request timed out이 났다.
export function requestDeadline() {
  return process.env.VERCEL ? Date.now() + 280_000 : Infinity;
}

// 남은 시간이 이보다 적으면 새 단계를 시작하지 않는다.
const MIN_STAGE_MS = 20_000;
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

export async function advancePost(postId: number, deadline = requestDeadline(), options: { clearError?: boolean } = {}): Promise<Post> {
  let post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new Error('글을 찾을 수 없습니다.');
  if (post.stage === 'READY' || !(await claimPost(postId))) return post;
  const startPost = post;
  const startedAt = Date.now();
  try {
    if (options.clearError && post.stageError) {
      post = await prisma.post.update({ where: { id: postId }, data: { stageError: null } });
    }
    while (post.stage !== 'READY' && !post.stageError && deadline - Date.now() >= MIN_STAGE_MS) {
      const current: Post = post;
      try {
        await prisma.post.update({ where: { id: postId }, data: { lockedUntil: new Date(Date.now() + LOCK_MS) } });
        post = await withDeadline(deadline, () => runStage(current));
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
