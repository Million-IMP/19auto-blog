import { beforeEach, describe, expect, it, vi } from 'vitest';

// Anthropic SDK·DB·기록을 바꿔치기해 잘림·길이 경고 처리만 본다(실제 AI·DB 호출 없음).
const create = vi.hoisted(() => vi.fn());
const recordNearLimit = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
  },
}));

vi.mock('../db', () => ({ prisma: {} }));

vi.mock('./aiUsageLog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./aiUsageLog')>()),
  recordNearLimit,
}));

const { aiService } = await import('./aiService');

function reply(text: string, stop_reason: string, output_tokens: number) {
  return { content: [{ type: 'text', text }], stop_reason, usage: { input_tokens: 100, output_tokens } };
}

beforeEach(() => {
  create.mockReset();
  recordNearLimit.mockReset();
});

describe('확인하지 않던 3곳의 잘림', () => {
  it.each([
    ['generateOSMUContent', () => aiService.generateOSMUContent('본문', 'INSTA'), 1500],
    ['quickSummarizeArticle', () => aiService.quickSummarizeArticle('제목', '본문'), 1000],
    ['processInboxItem', () => aiService.processInboxItem('수집 내용'), 4000],
  ])('%s: 잘리면 잘림을 기록하고 오류를 던진다', async (name, call, max) => {
    create.mockResolvedValue(reply('반쯤 쓴 글', 'max_tokens', max));
    await expect(call()).rejects.toThrow(`AI 응답이 길이 제한(${max} 토큰)에서 잘렸습니다.`);
    expect(recordNearLimit).toHaveBeenCalledWith(name, max, max, true);
  });

  it('OSMU가 글 없이 끝나면 빈 초안 대신 오류를 던진다', async () => {
    create.mockResolvedValue({ content: [{ type: 'thinking', thinking: '...' }], stop_reason: 'end_turn', usage: { output_tokens: 300 } });
    await expect(aiService.generateOSMUContent('본문', 'INSTA')).rejects.toThrow('AI 응답이 비어 있습니다.');
  });
});

describe('길이 경고', () => {
  it('제한의 80% 이상이면 호출 이름과 사용량을 기록하고 결과는 그대로 돌려준다', async () => {
    create.mockResolvedValue(reply('인스타 글', 'end_turn', 1300));
    await expect(aiService.generateOSMUContent('본문', 'INSTA')).resolves.toBe('인스타 글');
    expect(recordNearLimit).toHaveBeenCalledWith('generateOSMUContent', 1300, 1500, false);
  });

  it('80% 미만이면 기록하지 않는다', async () => {
    create.mockResolvedValue(reply('인스타 글', 'end_turn', 500));
    await aiService.generateOSMUContent('본문', 'INSTA');
    expect(recordNearLimit).not.toHaveBeenCalled();
  });

  it('askText를 거치는 호출도 이름이 붙고, 생각만 하다 잘리면 잘림 오류가 먼저 난다', async () => {
    create.mockResolvedValue({ content: [{ type: 'thinking', thinking: '...' }], stop_reason: 'max_tokens', usage: { output_tokens: 2000 } });
    await expect(aiService.evaluateTopic({ content: '글감', existingPosts: [], profile: '' })).rejects.toThrow('AI 응답이 길이 제한(2000 토큰)에서 잘렸습니다.');
    expect(recordNearLimit).toHaveBeenCalledWith('evaluateTopic', 2000, 2000, true);
  });

  it('이미지 채점은 잘리면 경고를 남기고 채점 전용 문구로 오류를 낸다', async () => {
    create.mockResolvedValue(reply('<score>{"score": 4, "rea', 'max_tokens', 1024));
    await expect(
      aiService.scoreImage({ image: { data: 'aW1n', mediaType: 'image/png' }, h2: '소제목', point: '뜻', anchor: '대상 / a thing' })
    ).rejects.toThrow('이미지 채점 응답이 길이 제한에서 잘렸습니다.');
    expect(recordNearLimit).toHaveBeenCalledWith('scoreImage', 1024, 1024, true);
  });
});
