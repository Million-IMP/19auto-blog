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
      findUniqueOrThrow: async ({ where }: any) => posts.get(where.id)!,
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
      // 테스트 안의 기록은 모두 24시간 이내로 본다.
      count: async ({ where }: any) =>
        logs.filter((l) => l.event === where.event && l.message.startsWith(where.message.startsWith)).length,
    },
    blogProfile: {
      upsert: async () => ({ id: 1, audience: '', purpose: '', tone: '', structure: '', ctaText: '', ctaUrl: '', imageStyle: '', bannedPhrases: '' }),
    },
  },
}));

// 호출마다 다른 주소를 돌려줘서 재생성 여부를 본문에서 구분할 수 있게 한다.
const render = vi.hoisted(() => vi.fn());

vi.mock('./imageProvider', () => ({
  imageProvider: () => ({ name: 'fake', render }),
  randomSeed: () => 1,
}));

const { aiService } = await import('./aiService');
const { advancePost, isPublicUrl, rebuildImageSet, regenerateImage, resumePost } = await import('./draftPipeline');

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
  let count = 0;
  render.mockReset();
  render.mockImplementation(async () => ({ url: `https://img.test/${++count}.png`, provider: 'fake', data: Buffer.from('img'), mediaType: 'image/png' }));
  vi.spyOn(aiService, 'scoreImage').mockResolvedValue({ score: 5, reason: '대상이 보임' });
  vi.spyOn(aiService, 'generateOutline').mockResolvedValue({
    keyword: '실내 식물',
    title: '실내 식물 물주기',
    sections: [{ h2: '물은 언제 주나요?', answer: '흙이 마르면' }],
  });
  vi.spyOn(aiService, 'generateBody').mockResolvedValue(BODY);
  vi.spyOn(aiService, 'polishBody').mockResolvedValue({ content: BODY, notes: '' });
  // 파이프라인이 장면 객체에 url을 써 넣으므로, 계획할 때마다 새 객체를 돌려준다.
  vi.spyOn(aiService, 'planImages').mockImplementation(async () => ({
    style: 'flat illustration',
    cover: { point: '표지', scene: '', must: '', avoid: '', prompt: 'a plant on a desk' },
    sections: [
      { h2: '물은 언제 주나요?', anchor: '물뿌리개 / a watering can', point: '물주기', scene: '', must: 'watering can', avoid: '', prompt: 'watering can pouring water' },
      { h2: '겨울에는 어떻게 하나요?', point: '겨울', scene: '', must: '', avoid: '', prompt: 'snowy window with sunlight' },
    ],
  }));
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

function readyPlan(id = 1) {
  return JSON.parse(posts.get(id)!.imagePlan!);
}

describe('IMAGES 단계 채점·재생성', () => {
  it('모든 장면을 채점해 점수를 남기고, 점수가 높으면 다시 만들지 않는다', async () => {
    seedPost();
    const post = await advancePost(1, Infinity);

    expect(post.stage).toBe('READY');
    expect(render).toHaveBeenCalledTimes(3);
    const plan = readyPlan();
    expect([plan.cover, ...plan.sections].map((s: any) => [s.score, s.checked])).toEqual([[5, true], [5, true], [5, true]]);
    expect(plan.retries ?? 0).toBe(0);
  });

  it('점수가 낮은 장면은 품질을 올려 한 번 다시 만들고 새 이미지로 바꾼다', async () => {
    seedPost();
    vi.mocked(aiService.scoreImage)
      .mockResolvedValueOnce({ score: 5, reason: '' }) // 표지
      .mockResolvedValueOnce({ score: 2, reason: '대상 없음' }) // 소제목 1
      .mockResolvedValueOnce({ score: 4, reason: '' }) // 소제목 1 재생성
      .mockResolvedValue({ score: 5, reason: '' });
    const post = await advancePost(1, Infinity);

    expect(render).toHaveBeenCalledTimes(4);
    expect(render.mock.calls[2][0].speed).toBe('default');
    expect(render.mock.calls[2][0].prompt).toContain('must be clearly visible');
    const plan = readyPlan();
    expect(plan.retries).toBe(1);
    expect(plan.sections[0]).toMatchObject({ retried: true, score: 4, url: 'https://img.test/3.png' });
    expect(post.content).toContain('https://img.test/3.png');
    expect(post.content).not.toContain('https://img.test/2.png');
  });

  it('다시 만든 이미지 점수가 더 낮으면 원래 이미지를 둔다', async () => {
    seedPost();
    vi.mocked(aiService.scoreImage)
      .mockResolvedValueOnce({ score: 2, reason: '' }) // 표지
      .mockResolvedValueOnce({ score: 1, reason: '' }) // 표지 재생성
      .mockResolvedValue({ score: 5, reason: '' });
    await advancePost(1, Infinity);

    expect(readyPlan().cover).toMatchObject({ retried: true, score: 2, url: 'https://img.test/1.png' });
  });

  it('재생성은 글당 최대 2장까지만 한다', async () => {
    seedPost();
    vi.mocked(aiService.scoreImage).mockResolvedValue({ score: 1, reason: '무관' });
    await advancePost(1, Infinity);

    const plan = readyPlan();
    expect(render).toHaveBeenCalledTimes(5); // 3장 + 재생성 2장
    expect(plan.retries).toBe(2);
    expect(plan.sections[1].retried).toBeUndefined();
  });

  it('채점이 실패해도 READY까지 가고 점수 없이 남긴다', async () => {
    seedPost();
    vi.mocked(aiService.scoreImage).mockRejectedValue(new Error('API 오류'));
    const post = await advancePost(1, Infinity);

    expect(post.stage).toBe('READY');
    expect(post.stageError).toBeNull();
    const plan = readyPlan();
    expect(plan.cover.checked).toBe(true);
    expect(plan.cover.score).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('재생성 렌더가 실패하면 재시도 횟수를 쓰지 않고 원래 이미지를 둔다', async () => {
    seedPost();
    vi.mocked(aiService.scoreImage).mockResolvedValueOnce({ score: 1, reason: '' }).mockResolvedValue({ score: 5, reason: '' });
    render
      .mockResolvedValueOnce({ url: 'https://img.test/a.png', provider: 'fake' })
      .mockRejectedValueOnce(new Error('Ideogram 429'));
    const post = await advancePost(1, Infinity);

    expect(post.stage).toBe('READY');
    expect(readyPlan().retries ?? 0).toBe(0);
    expect(readyPlan().cover).toMatchObject({ score: 1, url: 'https://img.test/a.png' });
  });

  it('이어하기: 이미지는 있지만 채점 전인 장면은 다시 만들지 않고 주소로 채점한다', async () => {
    const plan = {
      style: 'flat',
      cover: { point: '표지', scene: '', must: '', avoid: '', prompt: 'p', url: 'https://img.test/old.png' },
      sections: [],
    };
    seedPost({ stage: 'IMAGES', content: BODY, imagePlan: JSON.stringify(plan) });
    await advancePost(1, Infinity);

    expect(render).not.toHaveBeenCalled();
    expect(aiService.scoreImage).toHaveBeenCalledWith(expect.objectContaining({ image: { url: 'https://img.test/old.png' } }));
    expect(readyPlan().cover).toMatchObject({ checked: true, score: 5 });
  });

  it('장면 prompt에 들어간 색·재질 단어는 지운다', async () => {
    seedPost();
    vi.mocked(aiService.planImages).mockImplementation(async () => ({
      style: 'flat',
      cover: { point: '표지', scene: '', must: '', avoid: '', prompt: 'a desk lamp, amber light, matte surface' },
      sections: [],
    }));
    await advancePost(1, Infinity);

    expect(readyPlan().cover.prompt).toBe('a desk lamp, light, surface');
  });
});

describe('planImageSet 다시 계획', () => {
  const base = { point: '뜻', scene: '', must: '', avoid: '' };
  function planWith(sections: any[], coverAnchor?: string) {
    vi.mocked(aiService.planImages).mockImplementation(async () => ({
      style: 'flat',
      cover: { ...base, anchor: coverAnchor, prompt: 'a desk with a plant near the window' },
      sections: sections.map((s) => ({ ...base, ...s })),
    }));
  }
  const replanned = { ...base, anchor: '공유기 / a home router', prompt: 'a home router blinking on a shelf' };

  it('anchor에 개념을 나열한 소제목 장면은 사유와 함께 한 번 다시 계획한다', async () => {
    seedPost();
    planWith([{ h2: '물은 언제 주나요?', anchor: '블루투스·LAN·인터넷 / cables', prompt: 'many cables on a floor' }]);
    const replan = vi.spyOn(aiService, 'replanScene').mockResolvedValue(replanned);
    await advancePost(1, Infinity);

    expect(replan).toHaveBeenCalledTimes(1);
    expect(replan.mock.calls[0][0].reason).toContain('개념이 여러 개');
    expect(readyPlan().sections[0]).toMatchObject({ h2: '물은 언제 주나요?', anchor: '공유기 / a home router' });
  });

  it('다시 계획해도 나열이면 그대로 쓰고 더 부르지 않는다', async () => {
    seedPost();
    planWith([{ h2: '물은 언제 주나요?', anchor: '암호화 및 인증 / a lock', prompt: 'a padlock on a laptop' }]);
    const replan = vi.spyOn(aiService, 'replanScene').mockResolvedValue({ ...replanned, anchor: '암호화·인증 / a lock' });
    await advancePost(1, Infinity);

    expect(replan).toHaveBeenCalledTimes(1);
    expect(readyPlan().sections[0].anchor).toBe('암호화·인증 / a lock');
  });

  it('표지 anchor가 나열이어도 다시 계획하지 않는다', async () => {
    seedPost();
    planWith([{ h2: '물은 언제 주나요?', anchor: '물뿌리개 / a watering can', prompt: 'watering can pouring water' }], '노트북·휴대폰 / two devices');
    const replan = vi.spyOn(aiService, 'replanScene').mockResolvedValue(replanned);
    await advancePost(1, Infinity);

    expect(replan).not.toHaveBeenCalled();
  });

  it('앞 장면과 겹치고 나열이기도 하면 한 번만 다시 계획하고 사유를 둘 다 전한다', async () => {
    seedPost();
    planWith([{ h2: '물은 언제 주나요?', anchor: '물뿌리개·화분흙 / water and soil', prompt: 'a desk with a plant near the window' }]);
    const replan = vi.spyOn(aiService, 'replanScene').mockResolvedValue(replanned);
    await advancePost(1, Infinity);

    expect(replan).toHaveBeenCalledTimes(1);
    expect(replan.mock.calls[0][0].reason).toContain('겹쳤습니다');
    expect(replan.mock.calls[0][0].reason).toContain('개념이 여러 개');
  });

  // Design Ref: image-abstract-scenes §8.4
  it('글자 사물 anchor는 걸린 말을 사유에 담아 한 번 다시 계획한다', async () => {
    seedPost();
    planWith([{ h2: '물은 언제 주나요?', anchor: '물 주는 날 / a wall calendar with no visible numbers', prompt: 'a hand flipping a wall calendar' }]);
    const replan = vi.spyOn(aiService, 'replanScene').mockResolvedValue(replanned);
    await advancePost(1, Infinity);

    expect(replan).toHaveBeenCalledTimes(1);
    expect(replan.mock.calls[0][0].reason).toContain('"calendar"');
    expect(readyPlan().sections[0].anchor).toBe('공유기 / a home router');
  });

  it('키보드 치는 손 anchor는 첫 문단의 대상을 고르라는 사유로 다시 계획한다', async () => {
    seedPost();
    planWith([{ h2: '물은 언제 주나요?', anchor: '확인하기 / hands typing on a laptop keyboard', prompt: 'hands typing at a desk' }]);
    const replan = vi.spyOn(aiService, 'replanScene').mockResolvedValue(replanned);
    await advancePost(1, Infinity);

    expect(replan).toHaveBeenCalledTimes(1);
    expect(replan.mock.calls[0][0].reason).toContain('키보드');
  });

  it('표지 anchor가 키보드나 글자 사물이어도 다시 계획하지 않는다', async () => {
    seedPost();
    planWith([{ h2: '물은 언제 주나요?', anchor: '물뿌리개 / a watering can', prompt: 'watering can pouring water' }], '코딩 폰트 / a mechanical keyboard with a wall calendar');
    const replan = vi.spyOn(aiService, 'replanScene').mockResolvedValue(replanned);
    await advancePost(1, Infinity);

    expect(replan).not.toHaveBeenCalled();
  });

  it('나열이면서 글자 사물이면 한 번만 다시 계획하고 사유를 둘 다 전한다', async () => {
    seedPost();
    planWith([{ h2: '물은 언제 주나요?', anchor: '물뿌리개·달력 / a watering can and a calendar', prompt: 'a watering can beside a calendar' }]);
    const replan = vi.spyOn(aiService, 'replanScene').mockResolvedValue(replanned);
    await advancePost(1, Infinity);

    expect(replan).toHaveBeenCalledTimes(1);
    expect(replan.mock.calls[0][0].reason).toContain('개념이 여러 개');
    expect(replan.mock.calls[0][0].reason).toContain('"calendar"');
  });

  it('다시 계획이 실패하거나 prompt가 비면 원래 장면을 쓰고 READY까지 간다', async () => {
    seedPost();
    planWith([
      { h2: '물은 언제 주나요?', anchor: '물뿌리개·화분흙 / water and soil', prompt: 'a watering can on soil' },
      { h2: '겨울에는 어떻게 하나요?', anchor: '창문·햇빛 / a window', prompt: 'a frosty window with sunlight' },
    ]);
    vi.spyOn(aiService, 'replanScene')
      .mockRejectedValueOnce(new Error('AI 응답이 길이 제한(4000 토큰)에서 잘렸습니다.'))
      .mockResolvedValueOnce({ ...replanned, prompt: '' });
    const post = await advancePost(1, Infinity);

    expect(post.stage).toBe('READY');
    expect(post.stageError).toBeNull();
    expect(readyPlan().sections.map((s: any) => s.anchor)).toEqual(['물뿌리개·화분흙 / water and soil', '창문·햇빛 / a window']);
  });

  it('계획이 없는 IMAGES 단계는 남은 시간이 120초 미만이면 시작하지 않는다', async () => {
    seedPost({ stage: 'IMAGES', content: BODY });
    const post = await advancePost(1, Date.now() + 60_000);

    expect(post.stage).toBe('IMAGES');
    expect(post.stageError).toBeNull();
    expect(aiService.planImages).not.toHaveBeenCalled();
  });
});

describe('regenerateImage', () => {
  it('다른 실행이 잠근 글은 409로 거절하고, 끝나면 잠금을 푼다', async () => {
    seedPost();
    await advancePost(1, Infinity);
    posts.set(1, { ...posts.get(1)!, lockedUntil: new Date(Date.now() + 60_000) });
    await expect(regenerateImage(1, 1)).rejects.toMatchObject({ status: 409 });

    posts.set(1, { ...posts.get(1)!, lockedUntil: null });
    const post = await regenerateImage(1, 1);
    expect(post.content).toContain('https://img.test/4.png');
    expect(posts.get(1)!.lockedUntil).toBeNull();
  });
});

describe('rebuildImageSet', () => {
  it('본문의 AI 이미지를 지우고 새 이미지 세트로 다시 만든다', async () => {
    seedPost();
    await advancePost(1, Infinity);
    const before = posts.get(1)!.content;
    expect(before.match(/!\[/g)).toHaveLength(3);

    const post = await rebuildImageSet(1, Infinity);
    expect(post.stage).toBe('READY');
    expect(post.content.match(/!\[/g)).toHaveLength(3); // 중복 없이 다시 3장
    expect(post.content).toContain('https://img.test/4.png');
    expect(post.content).not.toContain('https://img.test/1.png');
    expect(aiService.planImages).toHaveBeenCalledTimes(2);
    expect(logs.filter((l) => l.event === 'IMAGE_REBUILD')).toHaveLength(1);
    expect(posts.get(1)!.lockedUntil).toBeNull();
  });

  it('24시간에 3번까지만 다시 만들고, 그 뒤에는 429', async () => {
    seedPost();
    await advancePost(1, Infinity);
    for (let i = 0; i < 3; i += 1) await rebuildImageSet(1, Infinity);
    await expect(rebuildImageSet(1, Infinity)).rejects.toMatchObject({ status: 429 });
    expect(aiService.planImages).toHaveBeenCalledTimes(4);
  });

  it('없는 글은 404, 발행한 글·작성 중인 글·잠긴 글은 409', async () => {
    await expect(rebuildImageSet(99, Infinity)).rejects.toMatchObject({ status: 404 });
    seedPost({ id: 2, stage: 'READY', status: 'PUBLISHED' });
    await expect(rebuildImageSet(2, Infinity)).rejects.toMatchObject({ status: 409 });
    seedPost({ id: 3, stage: 'DRAFT' });
    await expect(rebuildImageSet(3, Infinity)).rejects.toMatchObject({ status: 409 });
    seedPost({ id: 4, stage: 'READY', lockedUntil: new Date(Date.now() + 60_000) });
    await expect(rebuildImageSet(4, Infinity)).rejects.toMatchObject({ status: 409 });
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
