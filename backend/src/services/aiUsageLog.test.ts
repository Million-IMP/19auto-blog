import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 활동 기록은 메모리 목록으로 대신한다. count는 event·메시지 앞부분·createdAt(gte)을 실제처럼 따진다.
const logs: { event: string; message: string; createdAt: Date }[] = [];
const db = vi.hoisted(() => ({ fail: false, hang: false }));

vi.mock('../db', () => ({
  prisma: {
    systemLog: {
      count: async ({ where }: any) => {
        if (db.fail) throw new Error('DB 연결 실패');
        if (db.hang) return new Promise(() => {});
        return logs.filter(
          (l) => l.event === where.event && l.message.startsWith(where.message.startsWith) && l.createdAt >= where.createdAt.gte
        ).length;
      },
      create: async ({ data }: any) => {
        logs.push({ ...data, createdAt: new Date() });
        return data;
      },
    },
  },
}));

const { isNearLimit, recordNearLimit } = await import('./aiUsageLog');

beforeEach(() => {
  logs.length = 0;
  db.fail = false;
  db.hang = false;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.AI_TOKEN_WARN_RATIO;
});

describe('isNearLimit', () => {
  it('제한의 80%부터 경고한다', () => {
    expect(isNearLimit(7999, 10000)).toBe(false);
    expect(isNearLimit(8000, 10000)).toBe(true);
  });

  it('AI_TOKEN_WARN_RATIO로 기준을 바꿀 수 있고, 잘못된 값은 0.8로 본다', () => {
    process.env.AI_TOKEN_WARN_RATIO = '0.5';
    expect(isNearLimit(5000, 10000)).toBe(true);
    process.env.AI_TOKEN_WARN_RATIO = '3';
    expect(isNearLimit(5000, 10000)).toBe(false);
  });
});

describe('recordNearLimit', () => {
  it('처음 경고는 활동 기록에 남기고, 비율은 내림한다', async () => {
    await recordNearLimit('generateBody', 9996, 10000);
    expect(logs.map((l) => [l.event, l.message])).toEqual([['AI_TOKEN_NEAR_LIMIT', 'generateBody 응답 9996/10000 토큰 (99%)']]);
  });

  it('같은 호출은 24시간에 한 번만, 다른 호출은 따로 남긴다', async () => {
    await recordNearLimit('generateBody', 8000, 10000);
    await recordNearLimit('generateBody', 9500, 10000);
    await recordNearLimit('polishBody', 9000, 10000);
    expect(logs.map((l) => l.message)).toEqual(['generateBody 응답 8000/10000 토큰 (80%)', 'polishBody 응답 9000/10000 토큰 (90%)']);
    expect(console.warn).toHaveBeenCalledTimes(3);
  });

  it('24시간이 지난 경고는 다시 남긴다', async () => {
    logs.push({ event: 'AI_TOKEN_NEAR_LIMIT', message: 'generateBody 응답 8000/10000 토큰 (80%)', createdAt: new Date(Date.now() - 25 * 60 * 60_000) });
    await recordNearLimit('generateBody', 8100, 10000);
    expect(logs).toHaveLength(2);
  });

  it('실제로 잘렸으면 같은 날 앞선 경고가 있어도 남긴다', async () => {
    await recordNearLimit('generateBody', 8200, 10000);
    await recordNearLimit('generateBody', 10000, 10000, true);
    expect(logs.map((l) => l.message)).toEqual(['generateBody 응답 8200/10000 토큰 (82%)', 'generateBody 응답 10000/10000 토큰 (100%) — 잘림']);
  });

  it('기록이 실패해도 오류를 던지지 않는다', async () => {
    db.fail = true;
    await expect(recordNearLimit('planImages', 15000, 16000)).resolves.toBeUndefined();
    expect(logs).toHaveLength(0);
  });

  it('DB가 응답하지 않으면 2초 뒤 포기하고 넘어간다', async () => {
    vi.useFakeTimers();
    db.hang = true;
    const done = recordNearLimit('planImages', 15000, 16000);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(done).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenLastCalledWith(expect.stringContaining('기록 실패'));
  });
});
