import { aiService } from './aiService';
import { prisma } from '../db';
import { resolveDraftInputs } from './writingPlan';

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
}) {
  const failedCount = await prisma.inbox.count({
    where: { processed: false, autoError: { not: null } },
  });
  return {
    enabled: row.enabled,
    batchSize: row.batchSize,
    autoOsmu: row.autoOsmu,
    templateMaterialId: row.templateMaterialId,
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
}) {
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
    },
    create: {
      id: 1,
      enabled: Boolean(input.enabled),
      batchSize,
      autoOsmu: Boolean(input.autoOsmu),
      templateMaterialId,
    },
  });
  return presentConfig(row);
}

function isRssItem(content: string) {
  return content.startsWith('[RSS -');
}

function coverMarkdown(keyword: string) {
  const imagePrompt = encodeURIComponent(`high quality, blog cover, ${keyword}`);
  const imageUrl = `https://image.pollinations.ai/prompt/${imagePrompt}?width=800&height=400&nologo=true`;
  return `![${keyword}](${imageUrl})\n\n`;
}

export async function runAutomationCycle(trigger: 'cron' | 'manual'): Promise<CycleResult> {
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
  let osmu = 0;
  let failed = 0;

  try {
    const config = await getAutomationConfig();
    const items = await prisma.inbox.findMany({
      where: { processed: false, autoError: null },
      orderBy: { createdAt: 'desc' },
      take: config.batchSize,
    });

    if (items.length === 0) {
      messages.push('처리할 수집 항목이 없습니다.');
    }

    for (const item of items) {
      try {
        if (isRssItem(item.content)) {
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
          const draftResult = await aiService.generateDirectDraft(
            plan.keyword,
            [item.content],
            plan.materialContents,
            plan.ruleContents
          );
          const post = await prisma.post.create({
            data: {
              title: draftResult.title,
              content: coverMarkdown(draftResult.keyword) + draftResult.content,
              status: 'DRAFT',
              keyword: draftResult.keyword,
              platform: 'NAVER_BLOG',
              inboxId: item.id,
            },
          });
          drafted += 1;
          messages.push(`초안 "${post.title}"`);

          if (config.autoOsmu) {
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
                    inboxId: item.id,
                  },
                });
                osmu += 1;
              } catch (osmuErr: any) {
                messages.push(`${platform} 변환 실패: ${osmuErr.message}`);
              }
            }
          }
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

    const summary = `자동 작성(${trigger}): 초안 ${drafted}, 분류 ${classified}, OSMU ${osmu}, 실패 ${failed}. ${messages.join(' ')}`;
    await prisma.systemLog.create({
      data: {
        event: trigger === 'cron' ? 'CRON_AUTO_PIPELINE' : 'MANUAL_AUTO_PIPELINE',
        message: summary.slice(0, 500),
      },
    });

    return { skipped: false, drafted, classified, osmu, failed, messages };
  } finally {
    running = false;
  }
}
