import { describe, expect, it } from 'vitest';
import type { ImagePlan, ImageScene } from './aiService';
import { applyUpload, detectImageType, isJob, jobItems, jobPrompt, sceneAt } from './imageJobs';

// Design Ref: image-jobs §8.2 시나리오 1~4

function scene(overrides: Partial<ImageScene> = {}): ImageScene {
  return { point: '뜻', scene: '', must: '', avoid: '', prompt: 'a watering can', ...overrides };
}

function plan(overrides: Partial<ImagePlan> = {}): ImagePlan {
  return {
    style: 'flat illustration',
    cover: scene({ prompt: 'a plant on a desk' }),
    sections: [
      scene({ h2: '물은 언제 주나요?', url: 'https://img.test/1.png', checked: true }),
      scene({ h2: '겨울에는 어떻게 하나요?', url: 'https://img.test/2.png', pending: true }),
    ],
    ...overrides,
  };
}

describe('isJob · sceneAt', () => {
  it('url이 없거나 다시 생성 대기인 장면만 작업이다', () => {
    const p = plan();
    expect([p.cover, ...p.sections].map(isJob)).toEqual([true, false, true]);
  });

  it('0은 표지, 1부터는 소제목 순서다', () => {
    const p = plan();
    expect(sceneAt(p, 0)).toBe(p.cover);
    expect(sceneAt(p, 2)).toBe(p.sections[1]);
    expect(sceneAt(p, 3)).toBeUndefined();
  });
});

describe('jobItems', () => {
  it('작업 장면만 번호·크기·교체 여부와 함께 내놓는다', () => {
    const jobs = jobItems({ id: 7, title: '실내 식물', imagePlan: JSON.stringify(plan()) });

    expect(jobs.map((j) => [j.index, j.label, j.width, j.height, j.aspect, j.replace])).toEqual([
      [0, '표지', 800, 400, '2:1', false],
      [2, '겨울에는 어떻게 하나요?', 800, 450, '16:9', true],
    ]);
    expect(jobs[0]).toMatchObject({ postId: 7, title: '실내 식물' });
  });

  it('계획이 없으면 작업도 없다', () => {
    expect(jobItems({ id: 1, title: 't', imagePlan: null })).toEqual([]);
  });
});

describe('jobPrompt', () => {
  it('스타일·장면·must·avoid와 글자 금지를 한 문장에 넣고 한국어 anchor는 넣지 않는다', () => {
    const prompt = jobPrompt(plan(), scene({ anchor: '물뿌리개 / a watering can', must: 'watering can', avoid: 'people' }));

    expect(prompt).toMatch(/^flat illustration\. a watering can\. must include: watering can\. Avoid: people, text, letters/);
    expect(prompt).toContain('No text, no letters, no numbers, no logos, no watermarks.');
    expect(prompt).not.toMatch(/[가-힣]/);
  });

  it('avoid가 비면 기본 금지 목록만 쓴다', () => {
    expect(jobPrompt(plan(), scene())).toContain('Avoid: text, letters');
  });
});

describe('applyUpload', () => {
  it('교체 장면은 본문의 이전 주소를 새 주소로 바꾸고 대기 표시를 지운다', () => {
    const p = plan();
    const target = p.sections[1];
    const content = '## 겨울에는 어떻게 하나요?\n\n![겨울 (AI 생성)](https://img.test/2.png)';
    const next = applyUpload(content, p, target, { url: 'https://blob.test/new.jpg', source: 'agy' });

    expect(next).toContain('https://blob.test/new.jpg');
    expect(next).not.toContain('https://img.test/2.png');
    expect(target).toMatchObject({ url: 'https://blob.test/new.jpg', source: 'agy' });
    expect(target.pending).toBeUndefined();
    expect(p.provider).toBe('jobs');
  });

  it('처음 채우는 장면은 본문을 바꾸지 않는다', () => {
    const p = plan();
    expect(applyUpload('본문', p, p.cover, { url: 'https://blob.test/c.png', source: 'manual' })).toBe('본문');
    expect(isJob(p.cover)).toBe(false);
  });
});

describe('detectImageType', () => {
  it.each([
    ['PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), 'image/png'],
    ['JPEG', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]), 'image/jpeg'],
    ['WebP', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]), 'image/webp'],
    ['텍스트', Buffer.from('hello world, not an image'), null],
    ['빈 본문', Buffer.alloc(0), null],
  ])('%s → %s', (_name, bytes, expected) => {
    expect(detectImageType(bytes)).toBe(expected);
  });
});
