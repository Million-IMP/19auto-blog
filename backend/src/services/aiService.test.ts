import { beforeEach, describe, expect, it, vi } from 'vitest';

// Anthropic SDK·DB·기록을 바꿔치기해 잘림·길이 경고 처리만 본다(실제 AI·DB 호출 없음).
const create = vi.hoisted(() => vi.fn());
const recordNearLimit = vi.hoisted(() => vi.fn());
// 요청 모델이 ANTHROPIC_MODEL을 따르는지 보려고 import 전에 정한다 (.env보다 먼저라 dotenv가 덮어쓰지 않음).
const MODEL = vi.hoisted(() => (process.env.ANTHROPIC_MODEL = 'test-model'));

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

// Design Ref: ai-call-cleanup §8.2 — askText로 합친 3곳의 요청 내용과 결과 해석이 바뀌지 않았는지 고정한다.
function userText(request: any) {
  const content = request.messages[0].content;
  return typeof content === 'string' ? content : content.map((block: any) => block.text).join('\n');
}

const INBOX_XML =
  '<category>MATERIAL</category><title>제목</title><refinedContent>정리한 내용</refinedContent><keyword>키워드</keyword>';
const SUMMARY_XML = '<bullets>\n- 하나\n- 둘\n- 셋\n</bullets><takeaway>착안점</takeaway><keywords>가, 나</keywords>';

describe('askText로 합친 3곳', () => {
  it.each([
    ['processInboxItem', () => aiService.processInboxItem('수집 내용'), INBOX_XML, 4000, 'You are a helpful assistant that only outputs strictly formatted XML.', '[입력 데이터]\n수집 내용'],
    ['generateOSMUContent', () => aiService.generateOSMUContent('원본 본문', 'INSTA'), '인스타 글', 1500, undefined, '[원본 글]\n원본 본문'],
    ['quickSummarizeArticle', () => aiService.quickSummarizeArticle('기사 제목', '기사 본문'), SUMMARY_XML, 1000, 'You are an expert editorial consultant. Output strictly formatted XML tags as instructed.', '[기사 제목]\n기사 제목'],
  ])('%s: 모델·토큰 제한·system·프롬프트가 그대로다', async (_name, call, text, max, system, promptPart) => {
    create.mockResolvedValue(reply(text, 'end_turn', 100));
    await call();
    expect(create).toHaveBeenCalledTimes(1);
    const [request, requestOptions] = create.mock.calls[0];
    expect(request.model).toBe(MODEL);
    expect(request.max_tokens).toBe(max);
    expect(request.system).toBe(system);
    expect('system' in request).toBe(system !== undefined);
    expect(userText(request)).toContain(promptPart);
    // 마감 시간 밖에서 부르므로 시간 제한·재시도 옵션을 주지 않는다(SDK 기본값).
    expect(requestOptions).toBeUndefined();
  });

  it.each([
    ['processInboxItem', () => aiService.processInboxItem('수집 내용')],
    ['generateOSMUContent', () => aiService.generateOSMUContent('본문', 'INSTA')],
    ['quickSummarizeArticle', () => aiService.quickSummarizeArticle('제목', '본문')],
  ])('%s: 글 없이 끝나면 같은 오류를 낸다', async (_name, call) => {
    create.mockResolvedValue({ content: [{ type: 'thinking', thinking: '...' }], stop_reason: 'end_turn', usage: { output_tokens: 300 } });
    await expect(call()).rejects.toThrow('AI 응답이 비어 있습니다.');
  });

  it('system을 주지 않는 askText 호출은 요청에 system이 없다', async () => {
    create.mockResolvedValue(reply('<topic>{"keyword": "k"}</topic>', 'end_turn', 100));
    await aiService.evaluateTopic({ content: '글감', existingPosts: [], profile: '' });
    expect('system' in create.mock.calls[0][0]).toBe(false);
  });

  it('수집 분류는 XML을 그대로 해석한다', async () => {
    create.mockResolvedValue(reply(INBOX_XML, 'end_turn', 100));
    await expect(aiService.processInboxItem('수집 내용')).resolves.toEqual({
      category: 'MATERIAL',
      title: '제목',
      refinedContent: '정리한 내용',
      keyword: '키워드',
    });
  });

  it('즉석 요약은 태그가 없는 글이면 기본 문구를 돌려준다', async () => {
    create.mockResolvedValue(reply('태그 없는 답', 'end_turn', 100));
    await expect(aiService.quickSummarizeArticle('제목', '본문')).resolves.toEqual({
      bullets: ['원문 핵심 내용을 정리 중입니다.'],
      takeaway: '트렌드 분석에 유용한 글감입니다.',
      keywords: [],
    });
  });
});
