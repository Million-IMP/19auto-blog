import * as cheerio from 'cheerio';

export interface ScrapedArticle {
  title: string;
  description: string;
  ogImage: string | null;
  siteName: string;
  author: string | null;
  publishedTime: string | null;
  favicon: string;
  fullText: string;
  wordCount: number;
  charCount: number;
  readingTimeMinutes: number;
  url: string;
}

/**
 * 웹페이지 원문 전체 및 메타데이터를 정밀 스크래핑하는 서비스
 * - 네이버 블로그 스마트에디터(iframe) 및 주요 언론사/블로그 아티클 태그 완벽 대응
 * - 광고, 스크립트, 불필요한 UI 요소를 제거하고 순수한 기사 본문만을 추출
 */
export async function scrapeArticle(targetUrl: string): Promise<ScrapedArticle> {
  const urlObj = new URL(targetUrl);
  const domain = urlObj.hostname;
  const defaultFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  try {
    // 봇 차단을 방지하기 위해 일반 브라우저 헤더 설정
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: AbortSignal.timeout(8000), // 8초 타임아웃
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    let html = await response.text();
    let $ = cheerio.load(html);

    // 1. 네이버 블로그인 경우 mainFrame iframe 우회 처리
    const iframeSrc = $('#mainFrame').attr('src');
    if (iframeSrc) {
      const realUrl = iframeSrc.startsWith('http') ? iframeSrc : `https://blog.naver.com${iframeSrc}`;
      const realRes = await fetch(realUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (realRes.ok) {
        html = await realRes.text();
        $ = cheerio.load(html);
      }
    }

    // 2. 메타데이터 추출 (OpenGraph 및 표준 메타태그)
    const title = $('meta[property="og:title"]').attr('content') ||
                  $('meta[name="twitter:title"]').attr('content') ||
                  $('title').text().trim() ||
                  '제목 없음';

    const description = $('meta[property="og:description"]').attr('content') ||
                        $('meta[name="description"]').attr('content') ||
                        $('meta[name="twitter:description"]').attr('content') ||
                        '';

    let ogImage = $('meta[property="og:image"]').attr('content') ||
                  $('meta[name="twitter:image"]').attr('content') ||
                  null;

    if (ogImage && !ogImage.startsWith('http')) {
      ogImage = new URL(ogImage, targetUrl).toString();
    }

    const siteName = $('meta[property="og:site_name"]').attr('content') ||
                     domain.replace(/^www\./, '');

    const author = $('meta[name="author"]').attr('content') ||
                   $('meta[property="article:author"]').attr('content') ||
                   null;

    const publishedTime = $('meta[property="article:published_time"]').attr('content') ||
                          $('time').attr('datetime') ||
                          null;

    let favicon = $('link[rel="icon"]').attr('href') ||
                  $('link[rel="shortcut icon"]').attr('href') ||
                  defaultFavicon;

    if (favicon && !favicon.startsWith('http')) {
      favicon = new URL(favicon, targetUrl).toString();
    }

    // 3. 본문 정제: 스크립트, 광고, 네비게이션, 스타일 등 노이즈 제거
    $('script, style, noscript, iframe, nav, header, footer, aside, .ad, .ads, .advertisement, .comment, .comments, .sns-share, .social-share, .sns_share').remove();

    // 4. 본문 주요 컨테이너 탐색 (주요 CMS 및 한국 언론사/블로그 우선순위)
    let bodyText = '';
    const contentCandidates = [
      '.se-main-container',      // 네이버 스마트에디터 ONE
      '#postViewArea',           // 네이버 구형 에디터
      'article',                 // 표준 HTML5 아티클
      '[itemprop="articleBody"]', // Schema.org
      '.article-body',           // 테크크런치, 일반 언론사
      '.article_body',
      '.entry-content',          // 워드프레스
      '.post-content',           // 티스토리 / 블로그
      '#articleBody',
      'main',                    // 표준 main 태그
    ];

    let foundCandidate = false;
    for (const selector of contentCandidates) {
      const el = $(selector);
      if (el.length > 0) {
        // 단락(p), 제목(h1~h4), 리스트(li) 태그를 줄바꿈과 함께 보존
        const paragraphs: string[] = [];
        el.find('p, h1, h2, h3, h4, li').each((_, elem) => {
          const t = $(elem).text().trim();
          if (t.length > 15) { // 너무 짧은 링크 조각 제외
            paragraphs.push(t);
          }
        });

        if (paragraphs.length > 0) {
          bodyText = paragraphs.join('\n\n');
          foundCandidate = true;
          break;
        } else {
          const raw = el.text().trim();
          if (raw.length > 100) {
            bodyText = raw.replace(/\s+/g, ' ');
            foundCandidate = true;
            break;
          }
        }
      }
    }

    // 후보군에서 못 찾으면 body의 p 태그들 모음
    if (!foundCandidate) {
      const paragraphs: string[] = [];
      $('p').each((_, elem) => {
        const t = $(elem).text().trim();
        if (t.length > 20) {
          paragraphs.push(t);
        }
      });
      if (paragraphs.length > 0) {
        bodyText = paragraphs.join('\n\n');
      } else {
        bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 4000);
      }
    }

    // 본문 내 대표 이미지가 없을 경우 본문 내부 첫 번째 큰 이미지 탐색
    if (!ogImage) {
      const firstImg = $('img[src^="http"]').first().attr('src');
      if (firstImg) ogImage = firstImg;
    }

    const charCount = bodyText.length;
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
    // 분당 한글 400~500자 독서 기준 예상 시간 계산
    const readingTimeMinutes = Math.max(1, Math.ceil(charCount / 450));

    return {
      title,
      description,
      ogImage,
      siteName,
      author,
      publishedTime,
      favicon,
      fullText: bodyText.slice(0, 8000), // 너무 긴 텍스트는 8000자로 컷
      wordCount,
      charCount,
      readingTimeMinutes,
      url: targetUrl,
    };
  } catch (error: any) {
    console.warn(`[Scraper] Failed to fetch ${targetUrl}:`, error.message);
    // 실패 시 기본 메타데이터로 폴백
    return {
      title: '원문 페이지 접근 불가',
      description: '웹사이트 방화벽 또는 접속 제한으로 인해 원문 본문을 직접 가져오지 못했습니다. RSS 요약본을 확인해 주세요.',
      ogImage: null,
      siteName: domain,
      author: null,
      publishedTime: null,
      favicon: defaultFavicon,
      fullText: '',
      wordCount: 0,
      charCount: 0,
      readingTimeMinutes: 1,
      url: targetUrl,
    };
  }
}
