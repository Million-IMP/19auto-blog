import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiService, type ImagePlan, type ImageScene } from './aiService';
import { anchorEnglish, hasListedAnchor, needsRetry, retryPrompt, scoreScene, stripAiImages, stripStyleWords } from './imageQuality';

function scene(overrides: Partial<ImageScene> = {}): ImageScene {
  return { point: '뜻', scene: '', must: 'smart home hub', avoid: '', prompt: 'a hub on a shelf', ...overrides };
}

function plan(overrides: Partial<ImagePlan> = {}): ImagePlan {
  return { style: 'photo', cover: scene(), sections: [], ...overrides };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.IMAGE_SCORE_MIN;
  delete process.env.IMAGE_MAX_RETRIES;
});

describe('needsRetry', () => {
  it('점수가 기준(3)보다 낮고 아직 다시 만들지 않았으면 true', () => {
    expect(needsRetry(scene({ score: 2 }), plan())).toBe(true);
  });

  it.each([
    ['점수 3 이상', scene({ score: 3 }), plan()],
    ['채점 실패(점수 없음)', scene(), plan()],
    ['이미 다시 만든 장면', scene({ score: 1, retried: true }), plan()],
    ['글당 상한(2장) 도달', scene({ score: 1 }), plan({ retries: 2 })],
  ])('%s → false', (_label, s, p) => {
    expect(needsRetry(s, p)).toBe(false);
  });

  it('환경변수로 기준과 상한을 바꿀 수 있다', () => {
    process.env.IMAGE_SCORE_MIN = '4';
    process.env.IMAGE_MAX_RETRIES = '3';
    expect(needsRetry(scene({ score: 3 }), plan({ retries: 2 }))).toBe(true);
  });
});

describe('anchorEnglish · retryPrompt', () => {
  it('anchor에서 영어 묘사만 꺼낸다', () => {
    expect(anchorEnglish(scene({ anchor: '홈 어시스턴트 설정 화면 / a laptop showing a blurred smart home dashboard' }))).toBe(
      'a laptop showing a blurred smart home dashboard'
    );
    expect(anchorEnglish(scene({ anchor: '설정 화면' }))).toBe('');
    expect(anchorEnglish(scene({ anchor: '설정 / 화면' }))).toBe(''); // 한국어는 이미지 모델에 보내지 않는다
  });

  it('다시 만들 prompt에 대상을 못박고, anchor가 없으면 must를 쓴다', () => {
    expect(retryPrompt(scene({ anchor: '허브 / a white smart home hub' }))).toBe(
      'a hub on a shelf. The main subject must be clearly visible and recognizable: a white smart home hub'
    );
    expect(retryPrompt(scene())).toContain('smart home hub');
    expect(retryPrompt(scene({ must: '' }))).toBe('a hub on a shelf');
  });
});

describe('stripAiImages', () => {
  const BODY = '도입 문단입니다.\n\n## 물은 언제 주나요?\n흙이 마르면 줍니다.\n\n## 겨울에는?\n횟수를 줄입니다.';
  const WITH_IMAGES = [
    '![표지 뜻 (AI 생성)](https://img.test/1.png)',
    '*▲ 표지 설명 (AI 생성 이미지)*',
    '',
    '도입 문단입니다.',
    '',
    '## 물은 언제 주나요?',
    '흙이 마르면 줍니다.',
    '',
    '![물주기 (AI 생성)](https://img.test/2.png)',
    '*▲ 물주기 설명 (AI 생성 이미지)*',
    '',
    '## 겨울에는?',
    '횟수를 줄입니다.',
    '',
    '![겨울 (AI 생성)](/api/images/3.png)',
    '*▲ 겨울 설명 (AI 생성 이미지)*',
  ].join('\n');

  it('표지·소제목 AI 이미지와 설명 줄을 지워 원래 본문으로 되돌린다', () => {
    expect(stripAiImages(WITH_IMAGES)).toBe(BODY);
  });

  it('직접 넣은 일반 이미지와 본문은 건드리지 않는다', () => {
    const manual = '본문\n\n![내 사진](https://example.com/me.png)\n*▲ 직접 찍은 사진*';
    expect(stripAiImages(manual)).toBe(manual);
  });

  it('설명 줄이 없는 예전 형식도 지운다', () => {
    expect(stripAiImages('본문\n\n![장면 (AI 생성)](https://img.test/9.png)')).toBe('본문');
  });
});

describe('stripStyleWords', () => {
  it('색·재질 단어만 지우고 문장 부호를 정리한다', () => {
    expect(stripStyleWords('a laptop on a desk, amber light, matte finish, teal and orange tones')).toBe('a laptop on a desk, light, finish, and tones');
  });

  it('단어 일부가 겹치는 말(message, clayton)은 지우지 않는다', () => {
    expect(stripStyleWords('a message on a phone near clayton street')).toBe('a message on a phone near clayton street');
  });
});

describe('stripAiImages · 괄호가 든 주소', () => {
  it('주소 안에 괄호가 있어도 AI 이미지 줄을 지운다', () => {
    const content = '## 제목\n본문\n\n![뜻 (AI 생성)](https://image.pollinations.ai/prompt/a%20desk%20(wood)?seed=1)\n*▲ 설명 (AI 생성 이미지)*';
    expect(stripAiImages(content)).toBe('## 제목\n본문');
  });
});

describe('scoreScene · 이미지 형식', () => {
  it('지원하지 않는 형식은 원본 대신 주소로 채점한다', async () => {
    const spy = vi.spyOn(aiService, 'scoreImage').mockResolvedValue({ score: 4, reason: '' });
    const s = scene();
    await scoreScene(s, { url: 'https://img.test/1.png', data: Buffer.from('x'), mediaType: 'application/octet-stream' });
    expect(spy.mock.calls[0][0].image).toEqual({ url: 'https://img.test/1.png' });
    expect(s.score).toBe(4);
  });

  it('형식 뒤의 charset 같은 꼬리는 떼고 원본으로 보낸다', async () => {
    const spy = vi.spyOn(aiService, 'scoreImage').mockResolvedValue({ score: 4, reason: '' });
    await scoreScene(scene(), { url: '/api/images/1.png', data: Buffer.from('x'), mediaType: 'image/JPEG; charset=binary' });
    expect(spy.mock.calls[0][0].image).toEqual({ data: Buffer.from('x').toString('base64'), mediaType: 'image/jpeg' });
  });
});

describe('hasListedAnchor', () => {
  it.each([
    ['블루투스·LAN·인터넷 연결 / a router and cables', true],
    ['암호화, 기기 인증 / a lock icon', true],
    ['암호화 및 기기 인증 / a lock icon', true],
    ['노트북에 꽂힌 LAN 케이블 / a laptop, a cable', false],
    ['신호와 간섭의 비율 / two overlapping waves', false],
    [undefined, false],
    ['송·수신 안테나 / an antenna', false],
    ['입·출력 단자 / ports on a device', false],
    ['암호화 · 기기 인증 / a lock', true],
    ['블루투스ㆍ와이파이 / a router', true],
    ['블루투스，와이파이 / a router', true],
    ['a router, cables / 공유기', false],
    ['TCP/IP 설정 화면 / a, b', false],
  ])('%s → %s', (anchor, expected) => {
    expect(hasListedAnchor(scene({ anchor }))).toBe(expected);
  });
});
