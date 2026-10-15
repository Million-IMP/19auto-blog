import express from 'express';
import cors from 'cors';
import { aiService, withDeadline } from './services/aiService';
import { LOCAL_IMAGE_DIR } from './services/imageProvider';
import { scrapeArticle } from './services/scraperService';
import { getAutomationConfig, runAutomationCycle, updateAutomationConfig } from './services/automationService';
import { resolveDraftInputs } from './services/writingPlan';
import { markPublished, verifyPublished } from './services/publishService';
import { draftFromTopic, evaluateInbox, TOPIC_STATUSES, updateTopic } from './services/topicService';
import { advancePost, createPipelinePost, getBlogProfile, regenerateImage, requestDeadline, resumePost, updateBlogProfile } from './services/draftPipeline';
import { prisma } from './db';
import { authStatus, login, logout, requireAuth } from './auth';
import Parser from 'rss-parser';
import cron from 'node-cron';

const app = express();

process.on('uncaughtException', (err) => {
  console.error('💥 [Uncaught Exception]:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('💥 [Unhandled Rejection]:', reason);
});

app.use(cors());
app.use(express.json());
app.use(requireAuth);

// --- 접근 제한 (APP_PASSWORD) ---
app.get('/api/auth/status', authStatus);
app.post('/api/auth/login', login);
app.post('/api/auth/logout', logout);

const PORT = process.env.PORT || 3001;
const parser = new Parser();

// --- 0 수집함 (Inbox) ---
app.get('/api/stats', async (req, res) => {
  try {
    const [inboxUnprocessed, materialsActive, drafts, published, activeRss, lastLog] = await Promise.all([
      prisma.inbox.count({ where: { processed: false } }),
      prisma.material.count({ where: { isArchived: false } }),
      prisma.post.count({ where: { status: 'DRAFT' } }),
      prisma.post.count({ where: { status: 'PUBLISHED' } }),
      prisma.rssFeed.count({ where: { isActive: true } }),
      prisma.systemLog.findFirst({ orderBy: { createdAt: 'desc' } }),
    ]);
    res.json({
      inboxUnprocessed,
      materialsActive,
      drafts,
      published,
      activeRss,
      lastLog: lastLog
        ? { event: lastLog.event, message: lastLog.message, createdAt: lastLog.createdAt }
        : null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/inbox', async (req, res) => {
  const items = await prisma.inbox.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(items);
});

app.post('/api/inbox', async (req, res) => {
  const { content, type } = req.body;
  const item = await prisma.inbox.create({ data: { content, type } });
  res.json(item);
});

// RSS 수집 헬퍼 함수
// RSS 다중 채널 수집 헬퍼 함수
async function fetchAllActiveRssFeeds() {
  const activeFeeds = await prisma.rssFeed.findMany({ where: { isActive: true } });
  let totalAddedCount = 0;

  for (const feedConfig of activeFeeds) {
    try {
      const feed = await parser.parseURL(feedConfig.url);
      // 최신 5개 글만 가져와서 수집함에 넣음
      for (const item of feed.items.slice(0, 5)) {
        if (!item.link) continue;
        const content = `[RSS - ${feedConfig.name}]\nTitle: ${item.title}\nLink: ${item.link}\nSnippet: ${item.contentSnippet || item.content || ''}`;
        
        // 중복 방지
        const existing = await prisma.inbox.findFirst({
          where: { content: { contains: item.link } }
        });

        if (!existing) {
          await prisma.inbox.create({
            data: { content, type: 'TEXT', rssFeedId: feedConfig.id }
          });
          totalAddedCount++;
        }
      }
    } catch (feedErr: any) {
      console.error(`RSS 수집 실패 (${feedConfig.name}):`, feedErr.message);
    }
  }
  return totalAddedCount;
}

// RSS 채널 관리 API
const feedInclude = {
  rules: { select: { id: true, title: true } },
  materials: { select: { id: true, title: true } },
} as const;

function ruleIdList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter((id) => Number.isInteger(id) && id > 0);
}

async function saveFeedWriting(id: number, body: { name?: string; url?: string; category?: string; templateMaterialId?: number | null; materialIds?: unknown; ruleIds?: unknown }) {
  const name = String(body.name || '').trim();
  const url = String(body.url || '').trim();
  if (!name || !url) throw new Error('채널명과 RSS URL을 입력해주세요.');
  const ruleIds = ruleIdList(body.ruleIds);
  const materialIds = Array.isArray(body.materialIds)
    ? ruleIdList(body.materialIds)
    : (body.templateMaterialId ? [Number(body.templateMaterialId)].filter((id) => Number.isInteger(id) && id > 0) : []);
  const templateMaterialId: number | null = materialIds[0] ?? null;
  if (materialIds.length > 0) {
    const foundMaterials = await prisma.material.findMany({ where: { id: { in: materialIds }, isArchived: false } });
    if (foundMaterials.length !== materialIds.length) throw new Error('선택한 재료를 찾을 수 없습니다.');
  }
  if (ruleIds.length > 0) {
    const found = await prisma.rule.findMany({ where: { id: { in: ruleIds } } });
    if (found.length !== ruleIds.length) throw new Error('선택한 규칙을 찾을 수 없습니다.');
  }
  return prisma.rssFeed.update({
    where: { id },
    data: {
      name,
      url,
      category: String(body.category || '').trim() || null,
      templateMaterialId,
      materials: { set: materialIds.map((materialId) => ({ id: materialId })) },
      rules: { set: ruleIds.map((ruleId) => ({ id: ruleId })) },
    },
    include: feedInclude,
  });
}

app.get('/api/rss-feeds', async (req, res) => {
  const feeds = await prisma.rssFeed.findMany({ orderBy: { createdAt: 'desc' }, include: feedInclude });
  res.json(feeds);
});

app.post('/api/rss-feeds', async (req, res) => {
  const { name, url, category, templateMaterialId, materialIds, ruleIds } = req.body;
  if (!name || !url) return res.status(400).json({ error: "Name and URL are required" });
  try {
    const feed = await prisma.rssFeed.create({ data: { name, url, category } });
    const saved = await saveFeedWriting(feed.id, { name, url, category, templateMaterialId, materialIds, ruleIds });
    res.json(saved);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/rss-feeds/:id', async (req, res) => {
  try {
    const feed = await prisma.rssFeed.findUnique({ where: { id: Number(req.params.id) } });
    if (!feed) return res.status(404).json({ error: 'Not found' });
    const saved = await saveFeedWriting(feed.id, req.body);
    res.json(saved);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/rss-feeds/:id/toggle', async (req, res) => {
  const feed = await prisma.rssFeed.findUnique({ where: { id: Number(req.params.id) } });
  if (!feed) return res.status(404).json({ error: "Not found" });
  const updated = await prisma.rssFeed.update({
    where: { id: Number(req.params.id) },
    data: { isActive: !feed.isActive }
  });
  res.json(updated);
});

app.delete('/api/rss-feeds/:id', async (req, res) => {
  await prisma.rssFeed.delete({ where: { id: Number(req.params.id) } });
  res.json({ success: true });
});

// 수동 전체 RSS 수집 자동화 엔드포인트
app.post('/api/inbox/rss', async (req, res) => {
  try {
    const addedCount = await fetchAllActiveRssFeeds();
    res.json({ success: true, addedCount });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// 기사 원문 및 메타데이터 정밀 스크래핑 엔드포인트
app.post('/api/inbox/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });
    const data = await scrapeArticle(url);
    res.json(data);
  } catch (error: any) {
    console.error("Scrape Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 기사 원문 즉석 AI 3줄 요약 & 블로그 착안점 생성
app.post('/api/inbox/quick-summary', async (req, res) => {
  try {
    const { title, text } = req.body;
    if (!title || !text) return res.status(400).json({ error: "Title and text are required" });
    const summary = await aiService.quickSummarizeArticle(title, text);
    res.json(summary);
  } catch (error: any) {
    console.error("Quick Summary Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// AI를 이용해 Inbox 데이터를 처리 (Material 또는 Rule로 자동 분류)
app.post('/api/inbox/:id/process', async (req, res) => {
  try {
    const { id } = req.params;
    const inboxItem = await prisma.inbox.findUnique({ where: { id: Number(id) } });
    if (!inboxItem) return res.status(404).json({ error: "Item not found" });

    // AI 처리
    const aiResult = await aiService.processInboxItem(inboxItem.content);

    const category = String(aiResult.category || '').trim().toUpperCase();
    if (category !== 'MATERIAL' && category !== 'RULE') {
      return res.status(422).json({ error: 'AI 분류 결과를 해석하지 못했습니다.' });
    }

    let createdItem;
    if (category === 'MATERIAL') {
      createdItem = await prisma.material.create({
        data: {
          title: aiResult.title,
          content: aiResult.refinedContent,
          keyword: aiResult.keyword,
          inboxId: inboxItem.id
        }
      });
    } else {
      createdItem = await prisma.rule.create({
        data: {
          title: aiResult.title,
          content: aiResult.refinedContent,
          type: 'INSIGHT'
        }
      });
    }

    // Inbox 아이템 처리 완료 마킹
    await prisma.inbox.update({
      where: { id: inboxItem.id },
      data: { processed: true, autoError: null }
    });

    res.json({ success: true, category, data: createdItem });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/inbox/:id', async (req, res) => {
  await prisma.inbox.delete({ where: { id: Number(req.params.id) } });
  res.json({ success: true });
});

app.post('/api/inbox/:id/auto-retry', async (req, res) => {
  try {
    const item = await prisma.inbox.findUnique({ where: { id: Number(req.params.id) } });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const updated = await prisma.inbox.update({
      where: { id: item.id },
      data: { autoError: null },
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/automation', async (req, res) => {
  try {
    res.json(await getAutomationConfig());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/automation', async (req, res) => {
  try {
    const { enabled, batchSize, autoOsmu, templateMaterialId, draftSource } = req.body;
    const config = await updateAutomationConfig({ enabled, batchSize, autoOsmu, templateMaterialId, draftSource });
    res.json(config);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/automation/run', async (req, res) => {
  const deadline = requestDeadline();
  try {
    const addedCount = await fetchAllActiveRssFeeds();
    await prisma.systemLog.create({
      data: {
        event: 'MANUAL_RSS',
        message: addedCount > 0 ? `수동 수집 ${addedCount}건.` : '수동 수집: 새로운 기사 없음.',
      },
    });
    const result = await runAutomationCycle('manual', deadline);
    res.json({ ...result, addedCount });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// --- 글감 보드 (Topic Cards) ---
app.get('/api/topics', async (req, res) => {
  try {
    const status = String(req.query.status || '');
    const cards = await prisma.topicCard.findMany({
      where: TOPIC_STATUSES.includes(status) ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(cards);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 수집 항목을 글감 카드로 평가 (한 번에 최대 5건, AI 호출 1건씩)
app.post('/api/topics/evaluate', async (req, res) => {
  try {
    res.json(await evaluateInbox(Array.isArray(req.body?.inboxIds) ? req.body.inboxIds : []));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/topics/:id', async (req, res) => {
  try {
    res.json(await updateTopic(Number(req.params.id), req.body || {}));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/topics/:id/draft', async (req, res) => {
  const deadline = requestDeadline();
  try {
    res.json(await draftFromTopic(Number(req.params.id), deadline));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- 1 재료 (Material) ---
app.get('/api/materials', async (req, res) => {
  const items = await prisma.material.findMany({
    orderBy: { createdAt: 'desc' },
  });
  res.json(items);
});

app.put('/api/materials/:id/toggle', async (req, res) => {
  try {
    const material = await prisma.material.findUnique({ where: { id: Number(req.params.id) } });
    if (!material) return res.status(404).json({ error: 'Material not found' });
    const updated = await prisma.material.update({
      where: { id: material.id },
      data: { isActive: !material.isActive },
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/materials/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const material = await prisma.material.findUnique({ where: { id } });
    if (!material) return res.status(404).json({ error: 'Material not found' });
    const content = String(req.body.content || '').trim();
    if (!content) return res.status(400).json({ error: '내용을 입력해주세요.' });
    const updated = await prisma.material.update({
      where: { id },
      data: {
        title: String(req.body.title || '').trim() || '기본 글감 구조',
        content,
        isArchived: false,
      },
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/materials/extract', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });
    const result = await aiService.extractMaterialStructure(url);
    res.json(result);
  } catch (error: any) {
    console.error("Extract Material Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/materials', async (req, res) => {
  const { title, content, keyword, inboxId } = req.body;
  const item = await prisma.material.create({ data: { title, content, keyword, inboxId } });
  if (inboxId) {
    await prisma.inbox.update({ where: { id: inboxId }, data: { processed: true } });
  }
  res.json(item);
});

app.delete('/api/materials/:id', async (req, res) => {
  await prisma.material.delete({ where: { id: Number(req.params.id) } });
  res.json({ success: true });
});

// --- 2 규칙 (Rule) ---
app.get('/api/rules', async (req, res) => {
  const items = await prisma.rule.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(items);
});

app.post('/api/rules', async (req, res) => {
  const { title, content, type } = req.body;
  const item = await prisma.rule.create({ data: { title, content, type } });
  res.json(item);
});

app.put('/api/rules/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rule = await prisma.rule.findUnique({ where: { id } });
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    const content = String(req.body.content || '').trim();
    if (!content) return res.status(400).json({ error: '내용을 입력해주세요.' });
    const allowedTypes = ['TONE', 'FORMAT', 'PROHIBITED', 'INSIGHT'];
    const type = allowedTypes.includes(req.body.type) ? req.body.type : rule.type;
    const updated = await prisma.rule.update({
      where: { id },
      data: {
        title: String(req.body.title || '').trim() || '새 규칙 템플릿',
        content,
        type,
      },
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/rules/:id/toggle', async (req, res) => {
  const rule = await prisma.rule.findUnique({ where: { id: Number(req.params.id) } });
  if (!rule) return res.status(404).json({ error: "Rule not found" });
  const updated = await prisma.rule.update({
    where: { id: Number(req.params.id) },
    data: { isActive: !rule.isActive }
  });
  res.json(updated);
});

app.delete('/api/rules/:id', async (req, res) => {
  await prisma.rule.delete({ where: { id: Number(req.params.id) } });
  res.json({ success: true });
});

// --- 3 발행 & 초안 (Post) ---
app.get('/api/posts', async (req, res) => {
  const items = await prisma.post.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(items.map(({ brief, outline, lockedUntil, ...post }) => ({ ...post, isPipeline: brief !== null })));
});

// 작성이 끝나지 않은 글은 수정·발행·변환하지 않는다 (단계 결과가 덮어쓰는 것을 막음).
async function requireReadyPost(id: number) {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) throw Object.assign(new Error('글을 찾을 수 없습니다.'), { status: 404 });
  if (post.stage !== 'READY') throw Object.assign(new Error('아직 작성 중인 글입니다. 완성된 뒤에 다시 시도해주세요.'), { status: 409 });
  return post;
}

app.delete('/api/posts/:id', async (req, res) => {
  try {
    await prisma.post.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// AI 초안 생성 
app.post('/api/posts/generate', async (req, res) => {
  const deadline = requestDeadline();
  try {
    const { keyword, inboxIds, materialIds, ruleIds } = req.body;
    const inboxes = await prisma.inbox.findMany({
      where: { id: { in: inboxIds || [] } }
    });
    const plan = await resolveDraftInputs({ keyword, inboxIds, materialIds, ruleIds });
    const inboxContents = inboxes.map(i => i.content);
    const created = await createPipelinePost({
      brief: {
        keyword: plan.keyword,
        inboxContents,
        materialContents: plan.materialContents,
        ruleContents: plan.ruleContents,
      },
      inboxId: Array.isArray(inboxIds) && inboxIds.length === 1 ? Number(inboxIds[0]) : null,
    });

    // 선택된 Inbox 항목들 처리 완료 처리
    if (inboxIds && inboxIds.length > 0) {
      await prisma.inbox.updateMany({
        where: { id: { in: inboxIds } },
        data: { processed: true }
      });
    }

    // 단계별로 진행. 실패하면 stageError가 기록된 글이 그대로 반환되고 이어하기로 재개한다.
    const post = await advancePost(created.id, deadline);
    res.json(post);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// 3.0.1 멈춘 단계부터 이어서 진행
app.post('/api/posts/:id/resume', async (req, res) => {
  try {
    const post = await resumePost(Number(req.params.id), requestDeadline());
    res.json(post);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3.0.3 이미지 한 장만 다시 생성 (0 = 표지, 1.. = 소제목 순서)
app.post('/api/posts/:id/images/:index/regenerate', async (req, res) => {
  try {
    res.json(await withDeadline(requestDeadline(), () => regenerateImage(Number(req.params.id), Number(req.params.index))));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3.0.4 로컬에 저장한 Ideogram 이미지 (Vercel에서는 Blob 주소를 쓰므로 쓰지 않는다)
app.get('/api/images/:file', (req, res) => {
  const file = String(req.params.file);
  if (!/^[\w-]+\.(png|jpg|webp)$/.test(file)) return res.status(400).json({ error: '잘못된 파일 이름입니다.' });
  res.sendFile(file, { root: LOCAL_IMAGE_DIR, maxAge: '30d' }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });
  });
});

// 3.0.2 블로그 프로필 (모든 초안 공통 기준)
app.get('/api/profile', async (req, res) => {
  try {
    res.json(await getBlogProfile());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/profile', async (req, res) => {
  try {
    res.json(await updateBlogProfile(req.body || {}));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3.0 초안 내용 및 제목 직접 수정
app.put('/api/posts/:id', async (req, res) => {
  try {
    const { title, content } = req.body;
    await requireReadyPost(Number(req.params.id));
    const post = await prisma.post.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(title && { title }),
        ...(content && { content })
      }
    });
    res.json(post);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 3.1 초안 발행 처리 (URL 저장 및 상태 변경)
app.put('/api/posts/:id/publish', async (req, res) => {
  try {
    res.json(await markPublished(Number(req.params.id), req.body?.publishedUrl));
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 3.1.1 공개 확인: 발행 주소를 실제로 열어 제목과 이미지가 보이는지 기록
app.post('/api/posts/:id/verify', async (req, res) => {
  try {
    res.json(await verifyPublished(Number(req.params.id)));
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 3.2 OSMU 콘텐츠 생성
app.post('/api/posts/:id/osmu', async (req, res) => {
  try {
    const { id } = req.params;
    const { platform } = req.body; // 'INSTA', 'SHORTS', 'THREADS'

    const parentPost = await requireReadyPost(Number(id));

    const osmuContent = await aiService.generateOSMUContent(parentPost.content, platform);

    const post = await prisma.post.create({
      data: {
        title: `[${platform}] ${parentPost.title}`,
        content: osmuContent,
        status: 'DRAFT',
        keyword: parentPost.keyword,
        platform: platform,
        parentPostId: parentPost.id
      }
    });

    res.json(post);
  } catch (error: any) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// --- 4 시스템 로그 (Logs) ---
app.get('/api/system-logs', async (req, res) => {
  const logs = await prisma.systemLog.findMany({ 
    orderBy: { createdAt: 'desc' },
    take: 10 
  });
  res.json(logs);
});

export async function runHourlyPipeline(deadline = requestDeadline()) {
  console.log('🤖 [Cron] 정기 RSS 수집을 시작합니다...');
  try {
    const addedCount = await fetchAllActiveRssFeeds();
    const msg = addedCount > 0 ? `새로운 기사 ${addedCount}건 수집 완료.` : '새로운 기사 없음.';
    console.log(`🤖 [Cron] ${msg}`);

    await prisma.systemLog.create({
      data: {
        event: 'CRON_RSS_MULTI',
        message: msg
      }
    });

    const config = await getAutomationConfig();
    if (config.enabled) {
      await runAutomationCycle('cron', deadline);
    }
  } catch (error: any) {
    console.error('🤖 [Cron] RSS 수집 중 에러 발생:', error);
    await prisma.systemLog.create({
      data: {
        event: 'CRON_ERROR',
        message: `RSS 수집 실패: ${error.message}`
      }
    });
    throw error;
  }
}

app.get('/api/cron/daily', async (req, res) => {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    await runHourlyPipeline();
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

if (!process.env.VERCEL) {
  if (process.env.DISABLE_LOCAL_CRON === '1') {
    console.log('🤖 [Cron] 로컬 스케줄러는 꺼져 있습니다. 버셀 크론이 수집을 담당합니다.');
  } else {
    cron.schedule('0 * * * *', () => {
      runHourlyPipeline().catch((error) => {
        console.error('🤖 [Cron] 처리되지 않은 오류:', error);
      });
    });
    console.log('🤖 [Cron] 스케줄러 봇이 활성화되었습니다 (매시간 정각, 수집 후 자동 작성)');
  }

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

export default app;
