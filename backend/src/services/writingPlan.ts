import { prisma } from '../db';

type InboxRef = { rssFeedId: number | null; content: string };

async function feedForInbox(inbox: InboxRef) {
  const include = {
    rules: { select: { id: true, content: true } },
    materials: { select: { id: true, content: true, isArchived: true } },
  } as const;
  if (inbox.rssFeedId) {
    return prisma.rssFeed.findUnique({ where: { id: inbox.rssFeedId }, include });
  }
  const match = inbox.content.match(/^\[RSS - ([^\]]+)\]/);
  if (!match) return null;
  return prisma.rssFeed.findFirst({ where: { name: match[1] }, include });
}

export async function resolveDraftInputs(input: {
  inboxIds?: number[];
  materialIds?: number[];
  ruleIds?: number[];
  keyword?: string;
}) {
  const keyword = String(input.keyword || '').trim();
  const inboxIds = (input.inboxIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
  const materialIds = (input.materialIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
  const ruleIds = (input.ruleIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0);

  const inboxes = inboxIds.length
    ? await prisma.inbox.findMany({ where: { id: { in: inboxIds } } })
    : [];

  let channel: {
    templateMaterialId: number | null;
    rules: { content: string }[];
    materials: { content: string; isArchived: boolean }[];
  } | null = null;
  for (const inbox of inboxes) {
    const feed = await feedForInbox(inbox);
    if (feed && (feed.rules.length > 0 || feed.materials.length > 0 || feed.templateMaterialId)) {
      channel = feed;
      break;
    }
  }

  let ruleContents: string[] = [];
  let materialContents: string[] = [];
  let ruleSource: 'channel' | 'selection' | 'default' = 'default';
  let materialSource: 'channel' | 'selection' | 'default' = 'default';

  if (channel && channel.rules.length > 0) {
    ruleContents = channel.rules.map((rule) => rule.content);
    ruleSource = 'channel';
  } else if (ruleIds.length > 0) {
    const rules = await prisma.rule.findMany({ where: { id: { in: ruleIds } } });
    ruleContents = rules.map((rule) => rule.content);
    ruleSource = 'selection';
  } else {
    const rules = await prisma.rule.findMany({ where: { isActive: true } });
    ruleContents = rules.map((rule) => rule.content);
  }

  const channelMaterials = (channel?.materials || []).filter((material) => !material.isArchived);
  if (channelMaterials.length > 0) {
    materialContents = channelMaterials.map((material) => material.content);
    materialSource = 'channel';
  } else if (channel?.templateMaterialId) {
    const material = await prisma.material.findFirst({
      where: { id: channel.templateMaterialId, isArchived: false },
    });
    if (material) {
      materialContents = [material.content];
      materialSource = 'channel';
    }
  }
  if (materialContents.length === 0 && materialIds.length > 0) {
    const materials = await prisma.material.findMany({
      where: { id: { in: materialIds }, isArchived: false },
    });
    if (materials.length > 0) {
      materialContents = materials.map((material) => material.content);
      materialSource = 'selection';
    }
  }
  if (materialContents.length === 0) {
    const defaults = await prisma.material.findMany({ where: { isActive: true, isArchived: false } });
    if (defaults.length > 0) {
      materialContents = defaults.map((material) => material.content);
    }
  }
  if (materialContents.length === 0) {
    const config = await prisma.automationConfig.findUnique({ where: { id: 1 } });
    if (config?.templateMaterialId) {
      const material = await prisma.material.findFirst({
        where: { id: config.templateMaterialId, isArchived: false },
      });
      if (material) materialContents = [material.content];
    }
  }

  return { keyword, materialContents, ruleContents, ruleSource, materialSource };
}
