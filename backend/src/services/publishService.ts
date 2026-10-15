import * as cheerio from 'cheerio';
import { prisma } from '../db';
import { isPublicUrl } from './draftPipeline';

// "파일이 생겼다"와 "발행됐다"는 다르다. 발행 기록은 중복을 막고, 공개 화면을 실제로 열어 확인한다.
export type PublishCheck = {
  checkedAt: string;
  url: string;
  ok: boolean;
  titleFound: boolean;
  imageCount: number;
  expectedImages: number;
  note: string;
};

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

export async function markPublished(id: number, rawUrl: unknown) {
  const url = String(rawUrl || '').trim();
  if (!/^https?:\/\//.test(url)) throw httpError('발행된 글의 전체 주소(http로 시작)를 입력해주세요.', 400);
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) throw httpError('글을 찾을 수 없습니다.', 404);
  if (post.stage !== 'READY') throw httpError('아직 작성 중인 글입니다. 완성된 뒤에 발행 처리해주세요.', 409);
  if (post.status === 'PUBLISHED') throw httpError(`이미 발행 처리된 글입니다: ${post.publishedUrl || '주소 없음'}`, 409);
  const duplicate = await prisma.post.findFirst({ where: { publishedUrl: url, id: { not: id } } });
  if (duplicate) throw httpError(`같은 주소로 이미 발행 처리된 글이 있습니다: #${duplicate.id} ${duplicate.title}`, 409);
  // 동시에 두 번 눌러도 한 번만 발행 처리한다.
  const updated = await prisma.post.updateMany({
    where: { id, status: { not: 'PUBLISHED' } },
    data: { status: 'PUBLISHED', publishedUrl: url, publishCheck: null },
  });
  if (updated.count !== 1) throw httpError('이미 발행 처리된 글입니다.', 409);
  return prisma.post.findUniqueOrThrow({ where: { id } });
}

function normalize(text: string) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 19auto-blog publish check)' },
  });
  if (!res.ok) throw new Error(`공개 페이지 응답 ${res.status}`);
  return res.text();
}

// 네이버 블로그는 본문이 #mainFrame iframe 안에 있다.
async function loadPublishedPage(url: string) {
  let $ = cheerio.load(await fetchHtml(url));
  const frame = $('#mainFrame').attr('src');
  if (frame) {
    const frameUrl = frame.startsWith('http') ? frame : `https://blog.naver.com${frame}`;
    $ = cheerio.load(await fetchHtml(frameUrl));
  }
  const body = $('.se-main-container').first();
  const scope = body.length ? body : $('article').first().length ? $('article').first() : $('body');
  return {
    text: normalize(`${$('title').text()} ${$('.se-title-text').text()} ${$('h1, h2, h3').text()} ${scope.text()}`),
    imageCount: scope.find('img').length,
  };
}

export async function verifyPublished(id: number) {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) throw httpError('글을 찾을 수 없습니다.', 404);
  if (post.status !== 'PUBLISHED' || !post.publishedUrl) throw httpError('발행 처리된 글만 공개 확인할 수 있습니다.', 409);
  if (!isPublicUrl(post.publishedUrl)) throw httpError('공개 확인할 수 없는 주소입니다.', 400);

  const expectedImages = (post.content.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
  let check: PublishCheck;
  try {
    const page = await loadPublishedPage(post.publishedUrl);
    const title = normalize(post.title);
    const titleFound = page.text.includes(title) || page.text.includes(title.slice(0, 20));
    const notes = [];
    if (!titleFound) notes.push('공개 화면에서 제목을 찾지 못했습니다. 제목을 바꿨거나 비공개일 수 있습니다.');
    if (page.imageCount === 0) notes.push('공개 화면에서 이미지를 찾지 못했습니다.');
    else if (page.imageCount < expectedImages) notes.push(`이미지가 초안(${expectedImages}장)보다 적습니다.`);
    check = {
      checkedAt: new Date().toISOString(),
      url: post.publishedUrl,
      ok: titleFound && page.imageCount > 0,
      titleFound,
      imageCount: page.imageCount,
      expectedImages,
      note: notes.join(' ') || '제목과 이미지가 공개 화면에 보입니다.',
    };
  } catch (err: any) {
    check = {
      checkedAt: new Date().toISOString(),
      url: post.publishedUrl,
      ok: false,
      titleFound: false,
      imageCount: 0,
      expectedImages,
      note: `공개 페이지를 열지 못했습니다: ${String(err?.message || err).slice(0, 150)}`,
    };
  }
  return prisma.post.update({ where: { id }, data: { publishCheck: JSON.stringify(check) } });
}
