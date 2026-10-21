import { describe, expect, it } from 'vitest';
import type { ImagePlan, ImageScene } from './aiService';
import { parseRelinkPairs, relinkUrls } from './imageRelink';

const NAME = '1792116745241-52082a3b.png';
const FROM = `/api/images/${NAME}`;
const TO = `https://l4ceevd8gf1mgv0u.public.blob.vercel-storage.com/post-images/${NAME}`;
const OTHER = 'https://l4ceevd8gf1mgv0u.public.blob.vercel-storage.com/post-images/1792000000000-aaaaaaaa.png';

function scene(overrides: Partial<ImageScene> = {}): ImageScene {
  return { point: '뜻', scene: '', must: 'ssh terminal', avoid: '', prompt: 'a terminal window', seed: 7, score: 4, ...overrides };
}

function plan(overrides: Partial<ImagePlan> = {}): ImagePlan {
  return { style: 'photo', cover: scene({ url: FROM }), sections: [scene({ url: OTHER })], ...overrides };
}

describe('parseRelinkPairs', () => {
  it('같은 파일 이름의 로컬 주소 → Blob 주소 쌍을 받는다', () => {
    expect(parseRelinkPairs([{ from: FROM, to: TO }])).toEqual({ pairs: [{ from: FROM, to: TO }] });
  });

  it.each([
    ['다른 호스트', [{ from: FROM, to: `https://example.com/post-images/${NAME}` }]],
    ['Blob 다른 폴더', [{ from: FROM, to: TO.replace('post-images', 'other') }]],
    ['파일 이름 불일치', [{ from: FROM, to: OTHER }]],
    ['로컬 주소가 아님', [{ from: OTHER, to: OTHER }]],
    ['같은 from 두 번', [{ from: FROM, to: TO }, { from: FROM, to: TO }]],
    ['빈 배열', []],
    ['배열 아님', { from: FROM, to: TO }],
  ])('%s → 오류', (_label, raw) => {
    expect(parseRelinkPairs(raw)).toHaveProperty('error');
  });
});

describe('relinkUrls', () => {
  it('본문과 계획의 주소를 함께 바꾸고 개수를 돌려준다', () => {
    const before = plan();
    const result = relinkUrls(`![표지](${FROM})\n본문`, before, [{ from: FROM, to: TO }]);
    expect(result.missing).toEqual([]);
    expect(result.content).toBe(`![표지](${TO})\n본문`);
    expect(result.plan.cover.url).toBe(TO);
    expect(result.replaced).toEqual({ content: 1, imagePlan: 1 });
    // 입력 계획은 그대로
    expect(before.cover.url).toBe(FROM);
  });

  it('본문에 주소가 없으면 missing으로 알리고 아무것도 바꾸지 않는다', () => {
    const result = relinkUrls('그림 없는 본문', plan(), [{ from: FROM, to: TO }]);
    expect(result.missing).toHaveLength(1);
    expect(result.content).toBe('그림 없는 본문');
    expect(result.plan.cover.url).toBe(FROM);
    expect(result.replaced).toEqual({ content: 0, imagePlan: 0 });
  });

  it('계획에 주소가 없으면 missing으로 알린다', () => {
    const result = relinkUrls(`![표지](${FROM})`, plan({ cover: scene({ url: OTHER }) }), [{ from: FROM, to: TO }]);
    expect(result.missing).toHaveLength(1);
    expect(result.content).toBe(`![표지](${FROM})`);
  });

  it('다른 이미지 주소·글자·장면 필드는 그대로 둔다', () => {
    const content = `# 제목\n\n![표지](${FROM})\n\n문단 /api/images 설명\n\n![소제목](${OTHER})`;
    const result = relinkUrls(content, plan(), [{ from: FROM, to: TO }]);
    expect(result.content).toBe(`# 제목\n\n![표지](${TO})\n\n문단 /api/images 설명\n\n![소제목](${OTHER})`);
    expect(result.plan.sections[0]).toEqual(plan().sections[0]);
    expect(result.plan.cover).toEqual({ ...plan().cover, url: TO });
  });
});
