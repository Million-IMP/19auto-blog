import type { TopicCard } from '@prisma/client';
import { prisma } from '../db';
import { aiService } from './aiService';
import { advancePost, createPipelinePost, profileText, requestDeadline } from './draftPipeline';
import { resolveDraftInputs } from './writingPlan';

// 글감 보드: 수집 항목을 "누구의 어떤 질문인지, 왜 쓸 만한지, 다음에 뭘 할지"로 평가한다.
// 근거는 종류를 나눠 기록한다. 측정 도구를 연결하지 않았으므로 검색량·경쟁도는 항상 '확인 필요'.
export type EvidenceKind = 'MEASURED' | 'OBSERVED' | 'HYPOTHESIS' | 'UNVERIFIED';
export type Evidence = { label: string; source: string; checkedAt: string; basis: string; kind: EvidenceKind };

const NEXT_STEPS = ['NEW_POST', 'IMPROVE', 'RESEARCH'];
export const TOPIC_STATUSES = ['CANDIDATE', 'SELECTED', 'DISMISSED'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function text(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function evaluateOne(inboxId: number): Promise<TopicCard> {
  const existing = await prisma.topicCard.findFirst({ where: { inboxId } });
  if (existing) return existing;
  const inbox = await prisma.inbox.findUnique({ where: { id: inboxId } });
  if (!inbox) throw new Error(`수집 항목 #${inboxId}을 찾을 수 없습니다.`);

  const posts = await prisma.post.findMany({
    where: { parentPostId: null, platform: 'NAVER_BLOG', stage: 'READY' },
    select: { id: true, title: true, keyword: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const result = await aiService.evaluateTopic({ content: inbox.content, existingPosts: posts, profile: await profileText() });

  const link = inbox.content.match(/https?:\/\/[^\s)]+/)?.[0];
  const isRss = inbox.content.startsWith('[RSS -');
  const evidence: Evidence[] = [
    {
      label: '수집 원문',
      source: link || '직접 입력한 수집 메모',
      checkedAt: inbox.createdAt.toISOString().slice(0, 10),
      basis: isRss ? 'RSS 제목과 요약만 확인 (본문은 초안 단계에서 확인)' : '수집 메모 내용',
      kind: 'OBSERVED',
    },
    ...(Array.isArray(result.hypotheses) ? result.hypotheses : [])
      .map((h) => text(h, 300))
      .filter(Boolean)
      .slice(0, 5)
      .map((basis): Evidence => ({ label: '분석 가설', source: `AI 분석 (${process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5'})`, checkedAt: today(), basis, kind: 'HYPOTHESIS' })),
    {
      label: '검색 수요·경쟁도',
      source: '측정 도구 미연결',
      checkedAt: today(),
      basis: '네이버 데이터랩·검색광고 키워드 도구로 직접 확인 필요. 점수를 매기지 않음',
      kind: 'UNVERIFIED',
    },
  ];

  const relatedPostId = posts.some((p) => p.id === Number(result.relatedPostId)) ? Number(result.relatedPostId) : null;
  const nextStep = NEXT_STEPS.includes(String(result.nextStep)) ? String(result.nextStep) : relatedPostId ? 'IMPROVE' : 'NEW_POST';

  return prisma.topicCard.create({
    data: {
      inboxId,
      keyword: text(result.keyword, 100) || '키워드 확인 필요',
      topic: text(result.topic, 100),
      question: text(result.question),
      intent: text(result.intent, 50),
      journey: text(result.journey, 50),
      why: text(result.why),
      gap: text(result.gap),
      myValue: text(result.myValue) || '확인 필요',
      nextStep,
      relatedPostId,
      evidence: JSON.stringify(evidence),
    },
  });
}

export async function evaluateInbox(inboxIds: number[]) {
  const ids = Array.from(new Set(inboxIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))).slice(0, 5);
  const cards: TopicCard[] = [];
  const errors: string[] = [];
  for (const id of ids) {
    try {
      cards.push(await evaluateOne(id));
    } catch (err: any) {
      errors.push(`#${id}: ${String(err?.message || err).slice(0, 200)}`);
    }
  }
  return { cards, errors };
}

export async function updateTopic(id: number, input: { status?: string; keyword?: string; question?: string; myValue?: string; nextStep?: string }) {
  const data: Partial<TopicCard> = {};
  if (input.status !== undefined) {
    if (!TOPIC_STATUSES.includes(input.status)) throw new Error('알 수 없는 상태입니다.');
    data.status = input.status;
  }
  if (input.nextStep !== undefined) {
    if (!NEXT_STEPS.includes(input.nextStep)) throw new Error('알 수 없는 다음 행동입니다.');
    data.nextStep = input.nextStep;
  }
  if (input.keyword !== undefined) data.keyword = text(input.keyword, 100) || '키워드 확인 필요';
  if (input.question !== undefined) data.question = text(input.question);
  if (input.myValue !== undefined) data.myValue = text(input.myValue);
  return prisma.topicCard.update({ where: { id }, data });
}

// 카드의 독자 질문·빈틈·차별점을 입력으로 초안 파이프라인을 시작한다. 카드 하나에 초안 하나.
export async function draftFromTopic(id: number, deadline = requestDeadline()) {
  const card = await prisma.topicCard.findUnique({ where: { id } });
  if (!card) throw new Error('글감 카드를 찾을 수 없습니다.');
  if (card.postId) {
    const post = await prisma.post.findUnique({ where: { id: card.postId } });
    if (post) return post;
  }
  const inbox = card.inboxId ? await prisma.inbox.findUnique({ where: { id: card.inboxId } }) : null;
  const plan = await resolveDraftInputs({ inboxIds: inbox ? [inbox.id] : [], keyword: card.keyword });
  const brief = [
    '[글감 보드에서 고른 방향]',
    `독자 질문: ${card.question || '확인 필요'}`,
    `검색 의도: ${card.intent || '확인 필요'} · 여정: ${card.journey || '확인 필요'}`,
    `기존 답의 빈틈: ${card.gap || '확인 필요'}`,
    `내가 더할 것: ${card.myValue || '확인 필요'}`,
  ].join('\n');

  const created = await createPipelinePost({
    brief: {
      keyword: card.keyword,
      inboxContents: inbox ? [inbox.content, brief] : [brief],
      materialContents: plan.materialContents,
      ruleContents: plan.ruleContents,
    },
    inboxId: inbox?.id ?? null,
  });
  // 동시에 두 번 눌러도 카드에는 초안 하나만 연결한다.
  const claimed = await prisma.topicCard.updateMany({ where: { id, postId: null }, data: { postId: created.id, status: 'SELECTED' } });
  if (claimed.count !== 1) {
    await prisma.post.delete({ where: { id: created.id } });
    const latest = await prisma.topicCard.findUnique({ where: { id } });
    const post = latest?.postId ? await prisma.post.findUnique({ where: { id: latest.postId } }) : null;
    if (!post) throw new Error('다른 요청이 이미 이 글감으로 초안을 만들고 있습니다.');
    return post;
  }
  if (inbox) await prisma.inbox.update({ where: { id: inbox.id }, data: { processed: true, autoError: null } });
  return advancePost(created.id, deadline);
}
