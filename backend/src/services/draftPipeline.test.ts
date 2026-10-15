import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '@prisma/client';

// DB는 메모리 안의 글 목록으로 대신한다. draftPipeline이 쓰는 호출만 흉내 낸다.
const posts = new Map<number, Post>();
const logs: { event: string; message: string }[] = [];

function matches(post: Post, where: any): boolean {
  if (where.id !== undefined && post.id !== where.id) return false;
  if (where.OR) {
    // unlockedWhere(): 잠금이 없거나 이미 지난 글
    const now = Date.now();
    return post.lockedUntil === null || post.lockedUntil.getTime() < now;
  }
  return true;
}

vi.mock('../db', () => ({
  prisma: {
    post: {
      findUnique: async ({ where }: any) => posts.get(where.id) ?? null,
      update: async ({ where, data }: any) => {
        const next = { ...posts.get(where.id)!, ...data };
        posts.set(where.id, next);
        return next;
      },
      updateMany: async ({ where, data }: any) => {
        const post = posts.get(where.id);
        if (!post || !matches(post, where)) return { count: 0 };
        posts.set(where.id, { ...post, ...data });
        return { count: 1 };
      },
    },
    systemLog: {
      create: async ({ data }: any) => {
        logs.push(data);
        return data;
      },
    },
    blogProfile: {
      upsert: async () => ({ id: 1, audience: '', purpose: '', tone: '', structure: '', ctaText: '', ctaUrl: '', imageStyle: '', bannedPhrases: '' }),
    },
  },
}));

vi.mock('./imageProvider', () => ({
  imageProvider: () => ({ name: 'fake', render: async () => ({ url: 'https://img.test/a.png', provider: 'fake' }) }),
  randomSeed: () => 1,
}));

const { aiService } = await import('./aiService');
const { advancePost, isPublicUrl, resumePost } = await import('./draftPipeline');

const BODY = '도입 문단입니다.\n\n## 물은 언제 주나요?\n흙이 마르면 줍니다.\n\n## 겨울에는 어떻게 하나요?\n횟수를 줄입니다.';

function seedPost(overrides: Partial<Post> = {}): Post {
  const post = {
    id: 1,
    title: '[작성 중] 테스트',
    content: '',
    status: 'DRAFT',
    keyword: '테스트',
    publishedUrl: null,
    platform: 'NAVER_BLOG',
    inboxId: null,
    parentPostId: null,
    stage: 'SOURCES',
    stageError: null,
    brief: JSON.stringify({ keyword: '테스트', inboxContents: ['메모만 있는 수집 항목'], materialContents: [], ruleContents: [] }),
    outline: null,
    sources: null,
    imagePlan: null,
    polishNotes: null,
    lockedUntil: null,
    osmuAt: null,
    publishCheck: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Post;
  posts.set(post.id, post);
  return post;
}

beforeEach(() => {
  posts.clear();
  logs.length = 0;
  vi.restoreAllMocks();
  vi.spyOn(aiService, 'generateOutline').mockResolvedValue({
    keyword: '실내 식물',
    title: '실내 식물 물주기',
    sections: [{ h2: '물은 언제 주나요?', answer: '흙이 마르면' }],
  });
  vi.spyOn(aiService, 'generateBody').mockResolvedValue(BODY);
  vi.spyOn(aiService, 'polishBody').mockResolvedValue({ content: BODY, notes: '' });
  vi.spyOn(aiService, 'planImages').mockResolvedValue({
    style: 'flat illustration',
    cover: { point: '표지', scene: '', must: '', avoid: '', prompt: 'a plant on a desk' },
    sections: [
      { h2: '물은 언제 주나요?', point: '물주기', scene: '', must: '', avoid: '', prompt: 'watering can pouring water' },
      { h2: '겨울에는 어떻게 하나요?', point: '겨울', scene: '', must: '', avoid: '', prompt: 'snowy window with sunlight' },
    ],
  });
});

describe('advancePost', () => {
  it('시간 제한이 없으면 SOURCES부터 READY까지 진행하고 이미지를 넣는다', async () => {
    seedPost();
    const post = await advancePost(1, Infinity);

    expect(post.stage).toBe('READY');
    expect(post.stageError).toBeNull();
    expect(post.title).toBe('실내 식물 물주기');
    expect(post.content.match(/!\[/g)).toHaveLength(3); // 표지 + 소제목 2개
    expect(posts.get(1)!.lockedUntil).toBeNull(); // 끝나면 잠금 해제
    expect(logs).toHaveLength(1);
    expect(logs[0].event).toBe('POST_READY');
    expect(logs[0].message).toContain('SOURCES부터');
  });

  it('남은 시간이 단계 최소 시간보다 적으면 새 단계를 시작하지 않는다', async () => {
    seedPost();
    const post = await advancePost(1, Date.now() + 10_000);

    expect(post.stage).toBe('SOURCES');
    expect(aiService.generateOutline).not.toHaveBeenCalled();
    expect(logs).toHaveLength(0); // 아무 단계도 안 했으면 기록하지 않음
  });

  it('단계가 실패하면 오류를 남기고 멈추며, 이어하기는 그 단계부터 다시 한다', async () => {
    seedPost();
    vi.mocked(aiService.generateBody).mockRejectedValueOnce(new Error('일시 오류'));

    const failed = await advancePost(1, Infinity);
    expect(failed.stage).toBe('DRAFT');
    expect(failed.stageError).toBe('[DRAFT] 일시 오류');
    expect(aiService.polishBody).not.toHaveBeenCalled();
    expect(logs.map((l) => l.event)).toEqual(['POST_STAGE_ERROR']);
    expect(logs[0].message).toContain('[DRAFT] 일시 오류');

    // 오류가 남아 있으면 크론(advancePost)은 건너뛴다
    const skipped = await advancePost(1, Infinity);
    expect(skipped.stage).toBe('DRAFT');

    const resumed = await resumePost(1, Infinity);
    expect(resumed.stage).toBe('READY');
    expect(resumed.stageError).toBeNull();
    expect(logs.map((l) => l.event)).toEqual(['POST_STAGE_ERROR', 'POST_READY']);
    expect(logs[1].message).toContain('DRAFT부터');
    expect(aiService.generateOutline).toHaveBeenCalledTimes(1); // 앞 단계는 다시 하지 않음
  });

  it('다른 실행이 잠근 글은 건드리지 않는다', async () => {
    seedPost({ lockedUntil: new Date(Date.now() + 60_000) });
    const post = await advancePost(1, Infinity);

    expect(post.stage).toBe('SOURCES');
    expect(aiService.generateOutline).not.toHaveBeenCalled();
  });

  it('잠금 시간이 지난 글은 다시 진행한다', async () => {
    seedPost({ lockedUntil: new Date(Date.now() - 1_000) });
    const post = await advancePost(1, Infinity);

    expect(post.stage).toBe('READY');
  });
});

describe('isPublicUrl', () => {
  it.each([
    ['https://example.com/a', true],
    ['http://blog.naver.com/x', true],
    ['ftp://example.com', false],
    ['http://localhost:3001', false],
    ['http://127.0.0.1', false],
    ['http://10.0.0.5', false],
    ['http://192.168.0.1', false],
    ['http://172.16.0.1', false],
    ['http://172.32.0.1', true],
    ['http://169.254.169.254/latest/meta-data', false],
    ['http://[::1]/', false],
    ['http://printer.local', false],
    ['not a url', false],
  ])('%s → %s', (url, expected) => {
    expect(isPublicUrl(url)).toBe(expected);
  });
});
