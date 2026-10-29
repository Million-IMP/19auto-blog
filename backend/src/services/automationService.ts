import { aiService } from './aiService';
import { prisma } from '../db';
import type { Post } from '@prisma/client';
import { resolveDraftInputs } from './writingPlan';
import { advancePost, createPipelinePost, requestDeadline, unlockedWhere, waitingForImagesWhere } from './draftPipeline';
import { draftFromTopic, evaluateInbox } from './topicService';

const DRAFT_SOURCES = ['ALL_RSS', 'SELECTED_TOPICS'];

const OSMU_PLATFORMS = ['INSTA', 'SHORTS', 'THREADS'] as const;

export type CycleResult = {
  skipped: boolean;
  drafted: number;
  classified: number;
  osmu: number;
  failed: number;
  messages: string[];
};

let running = false;

async function presentConfig(row: {
  enabled: boolean;
  batchSize: number;
  autoOsmu: boolean;
  templateMaterialId: number | null;
  draftSource: string;
}) {
  const [inboxFailed, stageFailed] = await Promise.all([
    prisma.inbox.count({ where: { processed: false, autoError: { not: null } } }),
    prisma.post.count({ where: { stageError: { not: null } } }),
  ]);
  const failedCount = inboxFailed + stageFailed;
  return {
    enabled: row.enabled,
    batchSize: row.batchSize,
    autoOsmu: row.autoOsmu,
    templateMaterialId: row.templateMaterialId,
    draftSource: row.draftSource,
    failedCount,
  };
}

export async function getAutomationConfig() {
  const row = await prisma.automationConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  return presentConfig(row);
}

export async function updateAutomationConfig(input: {
  enabled?: boolean;
  batchSize?: number;
  autoOsmu?: boolean;
  templateMaterialId?: number | null;
  draftSource?: string;
}) {
  const draftSource = DRAFT_SOURCES.includes(String(input.draftSource)) ? String(input.draftSource) : 'ALL_RSS';
  const batchSize = Math.min(3, Math.max(1, Number(input.batchSize) || 1));
  let templateMaterialId: number | null = input.templateMaterialId ? Number(input.templateMaterialId) : null;
  if (templateMaterialId) {
    const material = await prisma.material.findFirst({
      where: { id: templateMaterialId, isArchived: false },
    });
    if (!material) {
      throw new Error('선택한 재료 템플릿을 찾을 수 없습니다.');
    }
  }
  const row = await prisma.automationConfig.upsert({
    where: { id: 1 },
    update: {
      enabled: Boolean(input.enabled),
      batchSize,
      autoOsmu: Boolean(input.autoOsmu),
      templateMaterialId,
      draftSource,
    },
    create: {
      id: 1,
      enabled: Boolean(input.enabled),
      batchSize,
      autoOsmu: Boolean(input.autoOsmu),
      templateMaterialId,
      draftSource,
    },
  });
  return presentConfig(row);
}

function isRssItem(content: string) {
  return content.startsWith('[RSS -');
}

// 채널별 변환은 따로 실패 처리해서 한 채널의 실패가 다른 채널을 막지 않게 한다.
async function createOsmuDrafts(post: Post, messages: string[]) {
  let created = 0;
  for (const platform of OSMU_PLATFORMS) {
    try {
      const osmuContent = await aiService.generateOSMUContent(post.content, platform);
      await prisma.post.create({
        data: {
          title: `[${platform}] ${post.title}`,
          content: osmuContent,
          status: 'DRAFT',
          keyword: post.keyword,
          platform,
          parentPostId: post.id,
          inboxId: post.inboxId,
        },
      });
      created += 1;
    } catch (osmuErr: any) {
      messages.push(`${platform} 변환 실패: ${osmuErr.message}`);
    }
  }
  return created;
}

function describeProgress(post: Post) {
  if (post.stage === 'READY') return `초안 "${post.title}"`;
  if (post.stageError) return `#${post.id} ${post.stageError}`;
  return `#${post.id} ${post.stage} 단계에서 다음 실행으로 이어감`;
}

export async function runAutomationCycle(trigger: 'cron' | 'manual', deadline = requestDeadline()): Promise<CycleResult> {
  if (running) {
    return {
      skipped: true,
      drafted: 0,
      classified: 0,
      osmu: 0,
      failed: 0,
      messages: ['이미 자동 작성이 실행 중입니다.'],
    };
  }

  running = true;
  const messages: string[] = [];
  let drafted = 0;
  let classified = 0;
  let evaluated = 0;
  let osmu = 0;
  let failed = 0;

  try {
    const config = await getAutomationConfig();

    // 1) 이전 실행에서 멈춘 초안을 멈춘 단계부터 이어서 진행 (PC 작업자의 그림을 기다리는 글은 빼서 자리를 차지하지 않게 한다)
    const unfinished = await prisma.post.findMany({
      where: { stage: { not: 'READY' }, stageError: null, ...unlockedWhere(), ...waitingForImagesWhere() },
      orderBy: { createdAt: 'asc' },
      take: config.batchSize,
    });
    for (const pending of unfinished) {
      if (Date.now() >= deadline) break;
      try {
        const post = await advancePost(pending.id, deadline);
        if (post.stage === 'READY') drafted += 1;
        if (post.stageError) failed += 1;
        messages.push(describeProgress(post));
      } catch (err: any) {
        failed += 1;
        messages.push(`#${pending.id} 이어가기 실패: ${String(err?.message || err).slice(0, 200)}`);
      }
    }

    // 2) 새 수집 항목 처리
    const items = Date.now() < deadline
      ? await prisma.inbox.findMany({
          where: { processed: false, autoError: null },
          orderBy: { createdAt: 'desc' },
          take: config.batchSize,
        })
      : [];

    if (items.length === 0 && unfinished.length === 0) {
      messages.push('처리할 수집 항목이 없습니다.');
    }

    for (const item of items) {
      if (Date.now() >= deadline) break;
      try {
        if (isRssItem(item.content) && config.draftSource === 'SELECTED_TOPICS') {
          const { cards, errors } = await evaluateInbox([item.id]);
          if (errors.length > 0) throw new Error(errors[0]);
          await prisma.inbox.update({ where: { id: item.id }, data: { processed: true, autoError: null } });
          evaluated += 1;
          messages.push(`글감 평가 "${cards[0].keyword}"`);
          continue;
        } else if (isRssItem(item.content)) {
          const existing = await prisma.post.findFirst({
            where: { inboxId: item.id, parentPostId: null },
          });
          if (existing) {
            await prisma.inbox.update({
              where: { id: item.id },
              data: { processed: true, autoError: null },
            });
            messages.push(`이미 초안이 있어 건너뜀: ${existing.title}`);
            continue;
          }

          const plan = await resolveDraftInputs({ inboxIds: [item.id] });
          const created = await createPipelinePost({
            brief: {
              keyword: plan.keyword,
              inboxContents: [item.content],
              materialContents: plan.materialContents,
              ruleContents: plan.ruleContents,
            },
            inboxId: item.id,
          });
          // 초안 글이 생기면 이후 재시도는 글의 단계(stage)에서 이어간다.
          await prisma.inbox.update({
            where: { id: item.id },
            data: { processed: true, autoError: null },
          });
          const post = await advancePost(created.id, deadline);
          if (post.stage === 'READY') drafted += 1;
          if (post.stageError) failed += 1;
          messages.push(describeProgress(post));
          continue;
        } else {
          const aiResult = await aiService.processInboxItem(item.content);
          const category = String(aiResult.category || '').trim().toUpperCase();
          if (category !== 'MATERIAL' && category !== 'RULE') {
            throw new Error('AI 분류 결과를 해석하지 못했습니다.');
          }
          if (category === 'MATERIAL') {
            await prisma.material.create({
              data: {
                title: aiResult.title,
                content: aiResult.refinedContent,
                keyword: aiResult.keyword,
                inboxId: item.id,
              },
            });
          } else {
            await prisma.rule.create({
              data: {
                title: aiResult.title,
                content: aiResult.refinedContent,
                type: 'INSIGHT',
              },
            });
          }
          classified += 1;
          messages.push(`${category} "${aiResult.title}"`);
        }

        await prisma.inbox.update({
          where: { id: item.id },
          data: { processed: true, autoError: null },
        });
      } catch (err: any) {
        failed += 1;
        const message = String(err?.message || err).slice(0, 300);
        await prisma.inbox.update({
          where: { id: item.id },
          data: { autoError: message },
        });
        messages.push(`#${item.id} 실패: ${message}`);
      }
    }

    // 2-1) 글감 보드에서 선택했지만 아직 초안이 없는 카드
    if (config.draftSource === 'SELECTED_TOPICS' && Date.now() < deadline) {
      const selected = await prisma.topicCard.findMany({
        where: { status: 'SELECTED', postId: null },
        orderBy: { createdAt: 'asc' },
        take: config.batchSize,
      });
      for (const card of selected) {
        if (Date.now() >= deadline) break;
        try {
          const post = await draftFromTopic(card.id, deadline);
          if (post.stage === 'READY') drafted += 1;
          if (post.stageError) failed += 1;
          messages.push(describeProgress(post));
        } catch (err: any) {
          failed += 1;
          messages.push(`글감 #${card.id} 초안 실패: ${String(err?.message || err).slice(0, 200)}`);
        }
      }
    }

    // 3) 완성된 파이프라인 초안 중 아직 채널 변환이 없는 글에 OSMU 생성
    if (config.autoOsmu && Date.now() < deadline) {
      const readyWithoutOsmu = await prisma.post.findMany({
        where: { stage: 'READY', status: 'DRAFT', brief: { not: null }, parentPostId: null, osmuAt: null },
        orderBy: { createdAt: 'desc' },
        take: config.batchSize,
      });
      for (const post of readyWithoutOsmu) {
        if (Date.now() >= deadline) break;
        const claimed = await prisma.post.updateMany({ where: { id: post.id, osmuAt: null }, data: { osmuAt: new Date() } });
        if (claimed.count !== 1) continue;
        osmu += await createOsmuDrafts(post, messages);
      }
    }

    // 첫 줄은 요약, 이후 줄마다 처리한 항목 하나. 활동 기록 화면에서 줄바꿈 그대로 보여준다.
    const summary = [`자동 작성(${trigger}): 초안 ${drafted}, 분류 ${classified}, 글감 평가 ${evaluated}, OSMU ${osmu}, 실패 ${failed}`, ...messages.map((m) => `- ${m}`)].join('\n');
    await prisma.systemLog.create({
      data: {
        event: trigger === 'cron' ? 'CRON_AUTO_PIPELINE' : 'MANUAL_AUTO_PIPELINE',
        message: summary.slice(0, 2000),
      },
    });

    return { skipped: false, drafted, classified, osmu, failed, messages };
  } finally {
    running = false;
  }
}
