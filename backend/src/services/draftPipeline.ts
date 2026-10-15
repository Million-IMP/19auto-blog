import type { Post } from '@prisma/client';
import { prisma } from '../db';
import { aiService, extractUrlText, type DraftContext, type Outline } from './aiService';
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

export function coverMarkdown(keyword: string) {
  const imagePrompt = encodeURIComponent(`high quality, blog cover, ${keyword}`);
  const imageUrl = `https://image.pollinations.ai/prompt/${imagePrompt}?width=800&height=400&nologo=true`;
  return `![${keyword} 표지 (AI 생성)](${imageUrl})\n\n`;
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

async function runStage(post: Post): Promise<Post> {
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
      const content = post.content.startsWith('![') ? post.content : coverMarkdown(post.keyword || post.title) + post.content;
      return prisma.post.update({ where, data: { content, stage: 'READY' } });
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
