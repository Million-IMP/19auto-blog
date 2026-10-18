import { prisma } from '../db';

// Design Ref: §2.1 — AI 응답이 길이 제한(max_tokens)에 가까우면 남긴다. 모델의 생각(thinking) 토큰도 제한에 들어가
// 응답이 예고 없이 잘리기 때문이다(이미지 계획이 8000에서 4번 중 1번 잘림). 제한을 올릴지는 이 기록을 보고 정한다.

const EVENT = 'AI_TOKEN_NEAR_LIMIT';
const DAY_MS = 24 * 60 * 60_000;
// 기록은 AI 단계 안에서 기다리므로, DB가 느려도 단계 마감을 넘기지 않게 묶어 둔다.
const RECORD_TIMEOUT_MS = 2_000;

// 이 비율 이상이면 경고 (기본 0.8)
export function warnRatio() {
  const value = Number(process.env.AI_TOKEN_WARN_RATIO);
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : 0.8;
}

export function isNearLimit(used: number, max: number) {
  return max > 0 && used >= max * warnRatio();
}

async function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${ms}ms 안에 끝나지 않음`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// 서버 로그는 매번 남긴다. 활동 기록은 근접 경고면 같은 호출마다 24시간에 1번, 실제로 잘렸으면 매번 남긴다
// (잘림이 제한을 올릴지 정하는 가장 중요한 기록이라 같은 날 앞선 경고에 묻히면 안 된다). 기록이 실패해도 AI 결과는 막지 않는다.
export async function recordNearLimit(name: string, used: number, max: number, cut = false) {
  // 반올림하면 9996/10000이 잘리지 않았는데도 100%로 보여 내림한다.
  const message = `${name} 응답 ${used}/${max} 토큰 (${Math.floor((used / max) * 100)}%)${cut ? ' — 잘림' : ''}`;
  console.warn(`[AI 길이 경고] ${message}`);
  try {
    await withTimeout(
      (async () => {
        if (!cut) {
          const recent = await prisma.systemLog.count({
            where: { event: EVENT, message: { startsWith: `${name} 응답 ` }, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
          });
          if (recent > 0) return;
        }
        await prisma.systemLog.create({ data: { event: EVENT, message } });
      })(),
      RECORD_TIMEOUT_MS
    );
  } catch (err: any) {
    console.warn(`[AI 길이 경고] 기록 실패: ${String(err?.message || err).slice(0, 120)}`);
  }
}
