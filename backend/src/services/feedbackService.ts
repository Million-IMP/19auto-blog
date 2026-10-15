import { prisma } from '../db';

export const FEEDBACK_LIMITS = { name: 20, content: 500 };

export type FeedbackInput = { name?: unknown; rating?: unknown; content?: unknown };

// 입력을 다듬고 검사한다. 문제가 있으면 화면에 그대로 보여줄 한국어 문구를 돌려준다.
export function parseFeedback(body: FeedbackInput): { ok: true; data: { name: string; rating: number; content: string } } | { ok: false; error: string } {
  const name = String(body.name ?? '').trim();
  const content = String(body.content ?? '').trim();
  const rating = Number(body.rating ?? 5);

  if (!name) return { ok: false, error: '이름(닉네임)을 적어주세요.' };
  if (name.length > FEEDBACK_LIMITS.name) return { ok: false, error: `이름은 ${FEEDBACK_LIMITS.name}자까지 쓸 수 있습니다.` };
  if (!content) return { ok: false, error: '후기 내용을 적어주세요.' };
  if (content.length > FEEDBACK_LIMITS.content) return { ok: false, error: `후기는 ${FEEDBACK_LIMITS.content}자까지 쓸 수 있습니다.` };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: '별점은 1~5 사이로 골라주세요.' };

  return { ok: true, data: { name, rating, content } };
}

export async function listFeedback(limit = 50) {
  const [items, stats] = await Promise.all([
    prisma.feedback.findMany({ orderBy: { id: 'desc' }, take: limit }),
    prisma.feedback.aggregate({ _count: true, _avg: { rating: true } }),
  ]);
  return {
    items,
    count: stats._count,
    average: stats._avg.rating ? Math.round(stats._avg.rating * 10) / 10 : null,
  };
}

export async function createFeedback(data: { name: string; rating: number; content: string }) {
  return prisma.feedback.create({ data });
}
