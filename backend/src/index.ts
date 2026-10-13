import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { aiService } from './services/aiService';
import { scrapeArticle } from './services/scraperService';
import Parser from 'rss-parser';
import cron from 'node-cron';

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const parser = new Parser();

// --- 0 수집함 (Inbox) ---
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
            data: { content, type: 'TEXT' }
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
app.get('/api/rss-feeds', async (req, res) => {
  const feeds = await prisma.rssFeed.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(feeds);
});

app.post('/api/rss-feeds', async (req, res) => {
  const { name, url, category } = req.body;
  if (!name || !url) return res.status(400).json({ error: "Name and URL are required" });
  try {
    const feed = await prisma.rssFeed.create({ data: { name, url, category } });
    res.json(feed);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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

    let createdItem;
    if (aiResult.category === 'MATERIAL') {
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
      data: { processed: true }
    });

    res.json({ success: true, category: aiResult.category, data: createdItem });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/inbox/:id', async (req, res) => {
  await prisma.inbox.delete({ where: { id: Number(req.params.id) } });
  res.json({ success: true });
});

// --- 1 재료 (Material) ---
app.get('/api/materials', async (req, res) => {
  const items = await prisma.material.findMany({ where: { isArchived: false }, orderBy: { createdAt: 'desc' } });
  res.json(items);
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
  res.json(items);
});

app.delete('/api/posts/:id', async (req, res) => {
  await prisma.post.delete({ where: { id: Number(req.params.id) } });
  res.json({ success: true });
});

// AI 초안 생성 
app.post('/api/posts/generate', async (req, res) => {
  try {
    const { keyword, inboxIds, materialIds, ruleIds } = req.body; 
    
    // 1. 선택된 수집함 원시 데이터 가져오기
    const inboxes = await prisma.inbox.findMany({
      where: { id: { in: inboxIds || [] } }
    });
    
    // 2. 선택된 재료 템플릿 가져오기
    const materials = await prisma.material.findMany({
      where: { id: { in: materialIds || [] } }
    });
    
    // 3. 선택된 규칙 템플릿 가져오기
    const rules = await prisma.rule.findMany({
      where: { id: { in: ruleIds || [] } }
    });

    const inboxContents = inboxes.map(i => i.content);
    const materialContents = materials.map(m => m.content);
    const ruleContents = rules.map(r => r.content);

    // 4. AI 초안 직접 생성 (Direct Generate)
    const draftResult = await aiService.generateDirectDraft(keyword, inboxContents, materialContents, ruleContents);

    // AI 썸네일 이미지 자동 첨부 (pollinations.ai 활용)
    // 한글 키워드일 수 있으므로 영어로 번역하거나 직관적인 영단어 조합이 좋지만, pollinations는 한글 프롬프트도 어느정도 이해합니다.
    const imagePrompt = encodeURIComponent(`high quality, blog cover, ${draftResult.keyword}`);
    const imageUrl = `https://image.pollinations.ai/prompt/${imagePrompt}?width=800&height=400&nologo=true`;
    const imageMarkdown = `![${draftResult.keyword}](${imageUrl})\n\n`;

    // 5. Post 초안으로 DB 저장
    const post = await prisma.post.create({
      data: {
        title: draftResult.title,
        content: imageMarkdown + draftResult.content,
        status: 'DRAFT',
        keyword: draftResult.keyword,
        platform: 'NAVER_BLOG'
      }
    });

    // 선택된 Inbox 항목들 처리 완료 처리
    if (inboxIds && inboxIds.length > 0) {
      await prisma.inbox.updateMany({
        where: { id: { in: inboxIds } },
        data: { processed: true }
      });
    }

    res.json(post);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// 3.0 초안 내용 및 제목 직접 수정
app.put('/api/posts/:id', async (req, res) => {
  try {
    const { title, content } = req.body;
    const post = await prisma.post.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(title && { title }),
        ...(content && { content })
      }
    });
    res.json(post);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3.1 초안 발행 처리 (URL 저장 및 상태 변경)
app.put('/api/posts/:id/publish', async (req, res) => {
  const { publishedUrl } = req.body;
  const post = await prisma.post.update({
    where: { id: Number(req.params.id) },
    data: {
      status: 'PUBLISHED',
      publishedUrl: publishedUrl
    }
  });
  res.json(post);
});

// 3.2 OSMU 콘텐츠 생성
app.post('/api/posts/:id/osmu', async (req, res) => {
  try {
    const { id } = req.params;
    const { platform } = req.body; // 'INSTA', 'SHORTS', 'THREADS'

    const parentPost = await prisma.post.findUnique({ where: { id: Number(id) } });
    if (!parentPost) return res.status(404).json({ error: "Parent post not found" });

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
    res.status(500).json({ error: error.message });
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

// 스케줄러 봇: 매시간 정각에 활성 RSS 피드들을 순회 수집 (0 * * * *)
cron.schedule('0 * * * *', async () => {
  console.log('🤖 [Cron] 매시간 정각 멀티 RSS 수집을 시작합니다...');
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
  } catch (error: any) {
    console.error('🤖 [Cron] RSS 수집 중 에러 발생:', error);
    await prisma.systemLog.create({
      data: {
        event: 'CRON_ERROR',
        message: `RSS 수집 실패: ${error.message}`
      }
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('🤖 [Cron] 스케줄러 봇이 활성화되었습니다 (매시간 정각 실행)');
});
