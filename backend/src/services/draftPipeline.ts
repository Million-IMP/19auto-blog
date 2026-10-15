import type { Post } from '@prisma/client';
import { prisma } from '../db';
import { aiService, extractUrlText, type DraftContext, type ImagePlan, type ImageScene, type Outline } from './aiService';
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
    if (input[key] !== undefined) data[key] = String(input[key] || '').trim();
  }
  return prisma.blogProfile.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
}

async function profileText() {
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
  return `![${alt}](${scene.url})`;
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
    style: plan.style,
    width: 800,
    height: index === 0 ? 400 : 450,
    seed,
  });
  const content = scene.url ? post.content.split(scene.url).join(image.url) : post.content;
  scene.url = image.url;
  scene.seed = seed;
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

async function collectSources(brief: Brief) {
  const urls = Array.from(new Set(brief.inboxContents.join('\n').match(/https?:\/\/[^\s]+/g) || [])).slice(0, 5);
  const excerpts: Excerpt[] = [];
  const lines: string[] = [];
  for (const url of urls) {
    try {
      const article = await scrapeArticle(url);
      if (!article.fullText.trim()) throw new Error('본문 없음');
      excerpts.push({ url, title: article.title, site: article.siteName, text: article.fullText.slice(0, 3000) });
      lines.push(`- [${article.title || url}](${url}) · ${article.siteName} · 확인일 ${today()} · 관찰(원문 읽음)`);
    } catch {
      const text = await extractUrlText(url);
      if (text.startsWith('(URL 내용을 가져오는 데 실패')) {
        lines.push(`- ${url} · 확인일 ${today()} · 확인 필요(원문을 읽지 못함)`);
      } else {
        excerpts.push({ url, title: url, site: new URL(url).hostname, text });
        lines.push(`- ${url} · 확인일 ${today()} · 관찰(본문 일부만 읽음)`);
      }
    }
  }
  if (urls.length === 0) lines.push(`- 외부 출처 없음 · 수집 메모만 사용 · 확인 필요`);
  return { excerpts, markdown: lines.join('\n') };
}

function draftContext(brief: Brief, sources: string, profile: string): DraftContext {
  const excerpts = (brief.excerpts || []).map((e) => `[원문: ${e.title} (${e.site})]\n${e.text}`);
  return {
    materials: [...brief.inboxContents, ...excerpts].join('\n\n'),
    sources,
    materialTemplates: brief.materialContents,
    ruleTemplates: brief.ruleContents,
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
        const seed = randomSeed();
        const isCover = scene === plan.cover;
        const image = await provider.render({ prompt: scene.prompt, style: plan.style, width: 800, height: isCover ? 400 : 450, seed });
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

const advancing = new Set<number>();

// deadline(ms 타임스탬프)이 지나면 다음 단계를 시작하지 않는다. Vercel 함수 60초 제한 대응.
export function defaultDeadline() {
  return process.env.VERCEL ? Date.now() + 25_000 : Infinity;
}

export async function advancePost(postId: number, deadline = defaultDeadline()): Promise<Post> {
  let post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new Error('글을 찾을 수 없습니다.');
  if (advancing.has(postId)) return post;
  advancing.add(postId);
  try {
    while (post.stage !== 'READY' && !post.stageError && Date.now() < deadline) {
      try {
        post = await runStage(post);
      } catch (err: any) {
        const message = `[${post.stage}] ${String(err?.message || err)}`.slice(0, 300);
        post = await prisma.post.update({ where: { id: postId }, data: { stageError: message } });
      }
    }
    return post;
  } finally {
    advancing.delete(postId);
  }
}

export async function resumePost(postId: number) {
  await prisma.post.update({ where: { id: postId }, data: { stageError: null } });
  return advancePost(postId);
}
