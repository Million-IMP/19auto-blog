import { AsyncLocalStorage } from 'async_hooks';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '', 
});

// 환경변수 기반 AI 모델 지정 (기본값: claude-haiku-5-5)
const AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

export type Outline = {
  keyword: string;
  title: string;
  sections: { h2: string; answer: string; needsSource?: boolean }[];
};

export type ImageScene = {
  h2?: string;
  // 글 속 고유 대상. "한국어 원문 표현 / English visual description"
  anchor?: string;
  point: string;
  scene: string;
  must: string;
  avoid: string;
  prompt: string;
  caption?: string;
  url?: string;
  seed?: number;
  // 생성된 이미지의 관련성 점수(1~5)와 이유. 채점에 실패하면 없다.
  score?: number;
  scoreReason?: string;
  // 채점을 시도했는지. 이어하기에서 같은 장면을 다시 채점하지 않는다.
  checked?: boolean;
  retried?: boolean;
};

export type ImageKind = 'news' | 'concept' | 'howto';

export type ImagePlan = {
  style: string;
  kind?: ImageKind;
  provider?: string;
  // 이 글에서 점수가 낮아 다시 만든 장수
  retries?: number;
  cover: ImageScene;
  sections: ImageScene[];
};

export type ImageInput = { data: string; mediaType: string } | { url: string };

function parseJsonTag<T>(text: string, tag: string, label: string): T {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  const raw = match ? match[1] : text;
  try {
    return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch {
    throw new Error(`${label} 응답을 JSON으로 읽지 못했습니다: ${raw.trim().slice(0, 120)}`);
  }
}

export type TopicEvaluation = {
  keyword: string;
  topic?: string;
  question?: string;
  intent?: string;
  journey?: string;
  why?: string;
  gap?: string;
  myValue?: string;
  nextStep?: string;
  relatedPostId?: number | null;
  hypotheses?: string[];
};

export type DraftContext = {
  materials: string;
  sources: string;
  materialTemplates: string[];
  ruleTemplates: string[];
  profile: string;
};

function numbered(items: string[], empty: string) {
  return items.length > 0 ? items.map((item, i) => `${i + 1}. ${item}`).join('\n') : empty;
}

function contextBlock(input: DraftContext) {
  return `[블로그 프로필]
${input.profile || '없음'}

[수집 자료]
${input.materials || '없음'}

[확인한 출처]
${input.sources || '없음'}

[글감 템플릿]
${numbered(input.materialTemplates, '자유 형식')}

[규칙]
${numbered(input.ruleTemplates, '제한 없음')}`;
}

// Design Ref: §5.1 — 장면은 은유가 아니라 글 속 실제 대상(anchor)에서 출발한다. 캡션은 본문에 그대로 실린다.
// 예시 문장에 색·재질을 넣으면 그대로 결과에 섞이므로(#44에서 확인) 예시는 장면 구성만 보여준다.
// v2: 개념을 나열한 anchor(블루투스·LAN·인터넷)와 화면 속 내용 anchor(흐려서 안 보임)가 3점의 원인이었다.
const SCENE_RULES = `- 먼저 anchor를 정합니다: 그 소제목의 핵심 개념 하나를 대표하는, 눈에 보이는 사물이나 사람의 행동(제품·기기·장소·손으로 하는 동작)입니다. 소제목에 개념이 여러 개면 본문에서 가장 먼저 설명하는 하나만 고르고, 나머지는 caption에 남깁니다. 형식은 "한국어 원문 표현 / English visual description"이고, 한국어 부분에 '·'나 쉼표로 여러 개를 나열하지 않습니다. 제품은 상표 대신 생김새로 묘사합니다.
- 화면 속 내용(설정 항목·검사 결과·로그·문서 글)은 anchor가 될 수 없습니다. 화면은 흐리게 그리므로 알아볼 수 없기 때문입니다. 그 기능을 쓰는 손·기기·주변 사물로 보여주고, 화면은 배경에 둡니다.
- prompt는 영어 한 단락으로, 다음 순서로 씁니다: anchor와 그 행동·상태 → 장소·맥락 → shot type·angle·lens → 조명 → 분위기. 화풍·색·재질은 style에서 정하므로 prompt에 쓰지 않습니다.
  예: "a person seen from behind adjusting settings on a laptop at a home desk, the screen showing a blurred unreadable dashboard, a small smart home hub on the shelf beside it, medium shot, eye level, 35mm lens, soft window light from the left, calm focused mood, negative space on the right"
- 사람은 뒷모습·옆모습·기기를 다루는 손까지 그릴 수 있습니다. 얼굴 클로즈업과 군중 장면은 피합니다(왜곡이 잦음).
- 앱·웹 화면이 필요하면 "blurred, unreadable interface"로 씁니다. 이미지 안에 읽히는 글자·숫자·로고·도표, 실제 인물, 실제 상표를 넣지 않습니다.
- 종이·노트·화이트보드·체크리스트처럼 글자가 들어갈 자리는 빈 줄·빈 칸으로만 그립니다. "번호 매긴 단계", "목록", "메모 쓰기"를 장면으로 고르지 말고, prompt에 numbered·written·list 같은 글자를 부르는 말을 쓰지 않습니다(운영 #42에서 노트에 엉터리 숫자가 그려졌다).
- 은유(열쇠·돋보기·저울·실타래 같은 상징물)는 anchor가 순수한 개념일 때만 씁니다. 그때도 글에 나오는 구체 사물이나 상황을 함께 둡니다. 한 글 안에서 같은 소재를 반복하지 않습니다.
- 블로그 썸네일로 잘려도 되도록 여백을 둡니다.
- must에는 anchor의 영어 묘사를 반드시 넣고, 반드시 보여야 할 요소를 영어 쉼표 목록으로 씁니다. avoid는 나오면 안 되는 요소를 영어 쉼표 목록으로 씁니다.
- caption은 이미지 아래에 실리는 한국어 설명 1문장(40자 안팎)입니다. 이미지가 보여주는 것과 그 소제목의 뜻을 잇습니다. 수치나 본문에 없는 사실은 쓰지 않습니다.`;

// Design Ref: §5.2 — 정해진 스타일이 없으면 글 종류에 맞춰 화풍을 고른다.
const STYLE_GUIDE = `- kind는 글 종류입니다: news(제품·서비스·사건 소개), howto(설치·설정·방법 안내), concept(개념·원리 해설).
- 정해진 스타일이 없으면 kind에 맞춰 화풍을 고릅니다.
  news → 사실적인 에디토리얼 사진풍(realistic editorial photography, natural light)
  howto → 실제 작업 환경 사진풍(realistic hands-on setup photography)
  concept → 깔끔한 에디토리얼 일러스트(clean editorial illustration)
- style은 영어 한 문장으로 화풍·색 팔레트·조명·렌더링 품질을 씁니다. 색 팔레트는 이 글의 주제와 톤에서 새로 고릅니다.`;

// 요청 단위 마감 시각. Vercel 함수 제한 안에서 AI 호출이 끝나지 않으면 시간 초과 오류로 멈추고 이어하기로 재개한다.
const deadlineStore = new AsyncLocalStorage<number>();

export function withDeadline<T>(deadline: number, fn: () => Promise<T>) {
  return deadlineStore.run(deadline, fn);
}

export function remainingTime() {
  return (deadlineStore.getStore() ?? Infinity) - Date.now();
}

// cachedPrefix: 여러 단계가 똑같이 보내는 자료 블록. 프롬프트 맨 앞에 두고 캐시해서 다음 단계는 싸게 읽는다.
async function askText(prompt: string, maxTokens: number, cachedPrefix?: string) {
  const deadline = deadlineStore.getStore() ?? Infinity;
  const remaining = deadline - Date.now();
  if (remaining < 5_000) throw new Error('남은 실행 시간이 부족합니다. 다음 실행에서 이어갑니다.');
  const content: Anthropic.ContentBlockParam[] = cachedPrefix
    ? [
        { type: 'text', text: cachedPrefix, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: prompt },
      ]
    : [{ type: 'text', text: prompt }];
  const response = await anthropic.messages.create(
    {
      model: AI_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    },
    Number.isFinite(remaining) ? { timeout: remaining - 2_000, maxRetries: 0 } : undefined
  );
  const textBlock = response.content.find((block: any) => block.type === 'text') as any;
  const text = textBlock?.text || '';
  if (!text) throw new Error('AI 응답이 비어 있습니다.');
  if (response.stop_reason === 'max_tokens') throw new Error(`AI 응답이 길이 제한(${maxTokens} 토큰)에서 잘렸습니다.`);
  if (cachedPrefix) {
    const { cache_read_input_tokens: read, cache_creation_input_tokens: written, input_tokens: fresh } = response.usage;
    console.log(`[AI] 캐시 읽음 ${read ?? 0} · 캐시 저장 ${written ?? 0} · 일반 입력 ${fresh}`);
  }
  return text;
}

// 간단한 URL 스크래퍼 (네이버 블로그의 경우 iframe 내부 주소 우회 시도)
export async function extractUrlText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // 네이버 블로그는 mainFrame이라는 iframe 안에 실제 본문이 있음
    const iframeSrc = $('#mainFrame').attr('src');
    if (iframeSrc) {
      const realUrl = iframeSrc.startsWith('http') ? iframeSrc : `https://blog.naver.com${iframeSrc}`;
      console.log("Fetching Naver Iframe:", realUrl);
      const realRes = await fetch(realUrl, { signal: AbortSignal.timeout(8_000) });
      const realHtml = await realRes.text();
      const _$ = cheerio.load(realHtml);
      // 네이버 블로그 포스트의 실제 본문은 주로 .se-main-container 에 있음
      const content = _$('.se-main-container').text() || _$('#postViewArea').text() || _$('body').text();
      return content.replace(/\s+/g, ' ').substring(0, 3000);
    }
    
    return $('body').text().replace(/\s+/g, ' ').substring(0, 3000);
  } catch (e) {
    return `(URL 내용을 가져오는 데 실패했습니다: ${url})`;
  }
}

export const MAX_BENCHMARK_URLS = 5;

// 벤치마킹 URL 입력(배열 또는 줄바꿈 문자열)을 정리한다. http(s)만 남기고 중복 제거, 최대 개수 초과는 오류.
export function normalizeBenchmarkUrls(input: unknown): string[] {
  const raw = Array.isArray(input) ? input.map(String) : String(input ?? '').split(/\s+/);
  const urls = [...new Set(raw.map((u) => u.trim()).filter((u) => /^https?:\/\/\S+$/i.test(u)))];
  if (urls.length > MAX_BENCHMARK_URLS) {
    throw new Error(`URL은 최대 ${MAX_BENCHMARK_URLS}개까지 비교할 수 있습니다.`);
  }
  return urls;
}

export const aiService = {
  // 글 1개 또는 여러 개의 구조를 분석하여 재료 템플릿으로 변환. 여러 개면 공통 패턴·차별화 기회까지 종합한다.
  async extractMaterialStructure(urls: string[]) {
    const texts = await Promise.all(urls.map((url) => extractUrlText(url)));
    const pages = urls
      .map((url, i) => ({ url, text: texts[i] }))
      .filter((page) => !page.text.includes('가져오는 데 실패했습니다'));
    const failed = urls.filter((url) => !pages.some((page) => page.url === url));

    if (pages.length === 0) {
      throw new Error("웹페이지 구조를 읽어오지 못했습니다. 크롤링 방어가 설정된 페이지일 수 있습니다.");
    }

    const prompt = pages.length === 1 ? `
당신은 최고의 블로그 컨설턴트이자 구조 분석가입니다.
다음은 벤치마킹할 블로그 포스트의 텍스트 원본입니다. 이 글의 '특정 내용'을 복사하는 것이 아니라, 이 글이 어떻게 쓰였는지 '구조와 뼈대(목차 흐름, 논리 전개)'를 추출해주세요.

[블로그 포스트 원본]
${pages[0].text}

[출력 지침]
1. 이 글의 전개 구조를 1, 2, 3 단계로 목차화하여 요약해주세요. (예: 1. 시선을 끄는 도입부(질문형) -> 2. 장점 3가지 나열 -> 3. 아쉬운 점과 극복 팁 -> 4. 독자에게 질문을 던지는 마무리)
2. 각 목차 단계별로 글을 작성할 때 참고해야 할 핵심 포인트를 1~2줄씩 덧붙여주세요.
3. 반드시 아래 XML 태그를 사용하여 출력하세요.

<title>이 구조를 부르기 좋은 직관적인 템플릿 제목 (예: IT 제품 실사용 리뷰 구조)</title>
<content>추출한 구조와 뼈대 (Markdown 리스트 포맷)</content>
` : `
당신은 최고의 블로그 컨설턴트이자 구조 분석가입니다.
다음은 벤치마킹할 블로그 포스트 ${pages.length}개의 텍스트 원본입니다. 각 글의 '특정 내용'을 복사하는 것이 아니라, 글들이 어떻게 쓰였는지 '구조와 뼈대(목차 흐름, 논리 전개)'를 비교 분석해서 이 글들보다 나은 글을 쓰기 위한 템플릿 1개로 종합해주세요.

${pages.map((page, i) => `[글 ${i + 1}]\n${page.text}`).join('\n\n')}

[출력 지침]
1. 여러 글이 공통으로 쓰는 전개 흐름은 독자가 기대하는 검증된 구조로 보고 뼈대에 반영합니다.
2. 일부 글에만 있는 좋은 장치(도입 방식, 비교표, 사례, 체크리스트 등)는 효과가 있으면 뼈대에 채택합니다.
3. 어느 글도 다루지 않았거나 약하게 다룬 부분은 차별화 기회로 짚고, 필요하면 뼈대에 단계로 넣습니다.
4. content는 아래 세 섹션을 Markdown으로 씁니다.
   ## 추천 구조 — 1, 2, 3 단계 목차와 단계별 작성 포인트 1~2줄
   ## 공통 패턴 — 여러 글이 공통으로 쓴 구조와 그 이유 (몇 개 글에서 보였는지 표시, 예: 3/${pages.length})
   ## 차별화 기회 — 기존 글들의 빈틈·약점과 이를 채우는 방법
5. 글별 요약은 따로 쓰지 말고, content 전체를 2500자 안팎으로 간결하게 씁니다.
6. 반드시 아래 XML 태그를 사용하여 출력하세요.

<title>이 구조를 부르기 좋은 직관적인 템플릿 제목 (예: IT 제품 실사용 리뷰 구조)</title>
<content>종합한 구조와 인사이트 (Markdown)</content>
`;

    // 여러 글 비교는 섹션이 셋이라 한국어 출력이 길다. 3000 토큰에서 잘리는 것을 확인함.
    const resultText = await askText(prompt, pages.length === 1 ? 3000 : 6000);

    const titleMatch = resultText.match(/<title>([\s\S]*?)<\/title>/);
    const contentMatch = resultText.match(/<content>([\s\S]*?)<\/content>/);

    if (!titleMatch || !contentMatch) {
      throw new Error("AI가 구조 추출 중 응답 포맷을 어겼습니다.");
    }

    return {
      title: titleMatch[1].trim(),
      content: contentMatch[1].trim(),
      analyzed: pages.length,
      failed,
    };
  },

  // 1. 수집함(0) 데이터를 재료(1)나 규칙(2)으로 분류 및 정제
  async processInboxItem(content: string) {
    // 텍스트 내에 URL이 포함되어 있다면 해당 내용을 추출하여 추가
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = content.match(urlRegex) || [];
    let extraContext = '';
    
    for (const url of urls) {
      const extracted = await extractUrlText(url);
      extraContext += `\n\n[웹페이지 내용 참고: ${url}]\n${extracted}\n`;
    }

    const prompt = `
당신은 블로그 자동화 시스템의 'AI 정리·기획자'입니다.
사용자가 무작위로 입력한 메모나 아이디어를 분석하여, 이것이 '글감/재료(MATERIAL)'인지 아니면 '블로그 규칙/톤앤매너(RULE)'인지 분류하고 정제해주세요.
웹페이지 링크가 있다면 첨부된 웹페이지 내용 참고를 바탕으로 핵심을 요약하여 정리해주세요.
(단, 정제된 내용의 길이는 최대 1000자를 넘지 않도록 간결하게 요약하세요.)

[입력 데이터]
${content}
${extraContext}

[출력 형식]
반드시 아래 XML 태그를 사용하여 구조화된 형태로 작성해주세요. 다른 부연 설명은 절대 하지 마세요.
<category>MATERIAL 또는 RULE</category>
<title>내용을 요약한 짧은 제목</title>
<refinedContent>글쓰기에 바로 활용할 수 있도록 다듬어진 내용 (최대 1000자)</refinedContent>
<keyword>연관 키워드 (MATERIAL인 경우 필수, RULE인 경우 없음)</keyword>
`;

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 4000,
      system: "You are a helpful assistant that only outputs strictly formatted XML.",
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block: any) => block.type === 'text') as any;
    const text = textBlock?.text || '';

    if (!text) {
      console.error("AI 응답 디버깅:", JSON.stringify(response, null, 2));
    }

    try {
      const categoryMatch = text.match(/<category>([\s\S]*?)<\/category>/);
      const titleMatch = text.match(/<title>([\s\S]*?)<\/title>/);
      const contentMatch = text.match(/<refinedContent>([\s\S]*?)<\/refinedContent>/);
      const keywordMatch = text.match(/<keyword>([\s\S]*?)<\/keyword>/);

      if (!categoryMatch || !titleMatch || !contentMatch) {
        throw new Error("XML 태그 매칭 실패");
      }

      return {
        category: categoryMatch[1].trim(),
        title: titleMatch[1].trim(),
        refinedContent: contentMatch[1].trim(),
        keyword: keywordMatch && keywordMatch[1].trim() !== '없음' ? keywordMatch[1].trim() : null
      };
    } catch (e) {
      console.error("AI 응답 파싱 에러 (텍스트):", text);
      throw new Error("AI 응답을 파싱할 수 없습니다. 터미널 로그를 확인하세요.");
    }
  },

  // 2-1. OUTLINE 단계: 키워드 · 제목 · 독자 질문형 H2 목차 (AEO)
  async generateOutline(input: DraftContext & { keyword: string }) {
    const prompt = `
당신은 네이버 블로그 기획 에디터입니다. 위 자료로 쓸 글의 목차만 설계하세요. 본문은 쓰지 않습니다.

[사용자 입력 키워드]
${input.keyword || '없음 (자료에서 독자가 실제로 검색할 핵심어를 도출)'}

[지침]
- 핵심어는 독자가 실제로 검색할 말로 하나 정합니다. 검색량·순위는 추정하지 않습니다.
- 소제목(H2)은 독자의 질문 형태로 3~6개. 각 소제목에 바로 답할 한 문장(answer)을 붙입니다.
- 자료에 없는 사실이 필요한 소제목은 needsSource를 true로 둡니다.

아래 형식의 JSON만 <outline> 태그 안에 출력하세요.
<outline>
{"keyword": "...", "title": "...", "sections": [{"h2": "...", "answer": "...", "needsSource": false}]}
</outline>
`;
    const text = await askText(prompt, 3000, contextBlock(input));
    const outline = parseJsonTag<Outline>(text, 'outline', '목차');
    outline.sections = Array.isArray(outline.sections)
      ? outline.sections.filter((s) => typeof s?.h2 === 'string' && s.h2.trim() && typeof s.answer === 'string')
      : [];
    if (typeof outline.title !== 'string' || !outline.title.trim() || outline.sections.length === 0) {
      throw new Error('목차 응답에 제목이나 소제목이 없습니다.');
    }
    if (typeof outline.keyword !== 'string' || !outline.keyword.trim()) outline.keyword = input.keyword || outline.title;
    return outline;
  },

  // 2-2. DRAFT 단계: 목차를 따라 본문 작성 (질문 아래 답 먼저, 출처 없는 수치·경험 금지)
  async generateBody(input: DraftContext & { outline: Outline }) {
    const prompt = `
당신은 네이버 블로그 에디터입니다. 위 자료를 바탕으로, 확정된 목차를 따라 본문을 Markdown으로 작성하세요.

[제목] ${input.outline.title}
[핵심어] ${input.outline.keyword}
[목차]
${input.outline.sections.map((s, i) => `${i + 1}. ## ${s.h2}\n   먼저 답할 내용: ${s.answer}`).join('\n')}

[작성 기준]
- 도입 2~3문장에 핵심어와 글의 결론을 자연스럽게 넣습니다. 핵심어를 억지로 반복하지 않습니다.
- 목차의 소제목을 그대로 ## 로 쓰고, 각 소제목 바로 아래 첫 문장에서 답을 먼저 말합니다.
- 방법은 번호 목록, 비교는 표로 정리합니다. 내용에 맞을 때만 씁니다.
- 수치·날짜·인용은 [확인한 출처]와 [수집 자료]에 있는 것만 쓰고, 문장 끝에 (출처: 사이트명)을 붙입니다.
- 자료에 없는 경험담·후기·통계를 지어내지 않습니다. 모르는 내용은 "확인이 필요합니다"라고 씁니다.
- 모바일에서 읽기 쉽게 문단은 2~3문장으로 씁니다.
- 이미지 마커나 이미지 링크는 넣지 않습니다.
- 마지막 문단에 독자가 할 다음 행동을 정리합니다. 프로필에 행동 유도 문구와 URL이 있으면 그대로 씁니다.

본문 Markdown만 <content> 태그 안에 출력하세요. 제목(#)은 쓰지 않습니다.
<content>
...
</content>
`;
    const text = await askText(prompt, 8000, contextBlock(input));
    const match = text.match(/<content>([\s\S]*?)<\/content>/);
    const content = (match ? match[1] : text).trim();
    if (content.length < 200) throw new Error('본문 응답이 너무 짧습니다.');
    return content;
  },

  // 2-3. POLISH 단계: AI 문체 교정 (humanizer 기준). 의미·수치·출처·확실한 정도는 보존
  async polishBody(content: string, profile: string) {
    const prompt = `
당신은 한국어 교정 편집자입니다. 아래 블로그 본문의 어색한 AI 문체만 고치세요.

[고칠 것]
- 번역투, 추상적이고 과장된 표현, 같은 말 반복, 불필요한 서론·결론 문장
- 예: "효율적인 공간 활용을 도모할 수 있습니다." → "공간을 더 알뜰하게 쓸 수 있습니다."

[지킬 것]
- 의미, 수치, 날짜, 인용, (출처: ...) 표기, 소제목(##), 표와 목록 구조
- 추정은 추정으로 남깁니다. 경험·감정·사례를 새로 지어내지 않습니다.
- 멀쩡한 문장은 바꾸지 않습니다.

[블로그 프로필]
${profile || '없음 (기존 본문의 말투 유지)'}

[본문]
${content}

출력 형식:
<content>교정한 전체 본문</content>
<notes>
- 수정 전 → 수정 후 (대표 사례 최대 3개)
</notes>
`;
    const text = await askText(prompt, 10000);
    const contentMatch = text.match(/<content>([\s\S]*?)<\/content>/);
    const notesMatch = text.match(/<notes>([\s\S]*?)<\/notes>/);
    const polished = contentMatch ? contentMatch[1].trim() : '';
    if (polished.length < content.length * 0.6) {
      throw new Error('교정 결과가 원문보다 지나치게 짧아 적용하지 않았습니다.');
    }
    return { content: polished, notes: notesMatch ? notesMatch[1].trim() : '' };
  },

  // 2-4. IMAGES 단계: 글 톤에서 스타일 1개를 정하고 표지 1장 + 소제목마다 1장 장면 계획
  async planImages(input: { title: string; keyword: string; content: string; headings: string[]; profileStyle: string }) {
    const prompt = `
당신은 블로그 이미지 아트 디렉터입니다. 아래 글에 들어갈 이미지 세트를 계획하세요. 이미지는 만들지 않고 계획만 합니다.

[제목] ${input.title}
[핵심어] ${input.keyword}
[정해진 스타일] ${input.profileStyle || '없음 (본문의 주제와 톤을 보고 하나 정함)'}
[소제목 목록]
${input.headings.map((h, i) => `${i + 1}. ${h}`).join('\n')}

[본문]
${input.content.slice(0, 6000)}

[원칙]
- 한 글에는 스타일 하나만 씁니다. 정해진 스타일이 있으면 그대로 씁니다.
${STYLE_GUIDE}
- 표지 1장은 글의 핵심 대상(글 전체가 다루는 제품·서비스·주제)을, 소제목 이미지는 그 소제목 본문이 설명하는 실제 장면을 보여줍니다. 제목 단어만 보고 고르지 않습니다.
- 장면끼리 구도와 소재가 겹치지 않게 합니다.
${SCENE_RULES}
- sections의 h2는 소제목 목록의 문구를 글자 그대로 씁니다.

아래 형식의 JSON만 <plan> 태그 안에 출력하세요.
<plan>
{"kind": "news|howto|concept", "style": "...", "cover": {"anchor": "한국어 원문 표현 / English description", "point": "전달할 뜻(한국어)", "scene": "장면(한국어)", "must": "필수 요소(영어)", "avoid": "제외 요소(영어)", "prompt": "...", "caption": "..."}, "sections": [{"h2": "...", "anchor": "...", "point": "...", "scene": "...", "must": "...", "avoid": "...", "prompt": "...", "caption": "..."}]}
</plan>
`;
    // 모델이 답 앞에 생각(thinking)을 쓰고 그 토큰도 길이 제한에 포함된다. 7장면 계획이 5.5~8.5천 토큰이라 8000에서 4번 중 1번 잘렸다(v2 실측).
    const text = await askText(prompt, 16000);
    const plan = parseJsonTag<ImagePlan>(text, 'plan', '이미지 계획');
    if (!plan.style || !plan.cover?.prompt || !Array.isArray(plan.sections)) {
      throw new Error('이미지 계획에 스타일이나 표지가 없습니다.');
    }
    if (!['news', 'concept', 'howto'].includes(plan.kind as string)) delete plan.kind;
    return plan;
  },

  // 겹치거나 anchor에 개념을 나열한 장면 하나만 다시 계획한다. reason은 왜 다시 계획하는지 AI에 알려준다.
  async replanScene(input: { h2: string; section: string; style: string; avoidPrompts: string[]; reason?: string }) {
    const reasonLine = input.reason ? `[다시 계획하는 이유] ${input.reason}\n` : '';
    const prompt = `
블로그 소제목 하나에 들어갈 이미지 장면을 새로 계획하세요. 아래 기존 장면들과 구도·소재가 겹치면 안 됩니다.
${reasonLine}
[스타일] ${input.style}
[소제목] ${input.h2}
[소제목 본문]
${input.section.slice(0, 2000)}

[이미 쓴 장면 prompt]
${input.avoidPrompts.map((p) => `- ${p}`).join('\n')}

${SCENE_RULES}
<scene>
{"h2": "${input.h2}", "anchor": "...", "point": "...", "scene": "...", "must": "...", "avoid": "...", "prompt": "...", "caption": "..."}
</scene>
`;
    // 생각(thinking) 토큰까지 들어가도록 계획 한 장면 분량보다 넉넉하게 둔다.
    return parseJsonTag<ImageScene>(await askText(prompt, 4000), 'scene', '장면 계획');
  },

  // Design Ref: §5.3 — 생성된 이미지를 보고 소제목·anchor와 맞는지 1~5점으로 채점한다.
  async scoreImage(input: { image: ImageInput; h2: string; point: string; anchor: string }) {
    const deadline = deadlineStore.getStore() ?? Infinity;
    const remaining = deadline - Date.now();
    if (remaining < 5_000) throw new Error('남은 실행 시간이 부족합니다.');
    const source: Anthropic.ImageBlockParam['source'] =
      'url' in input.image
        ? { type: 'url', url: input.image.url }
        : { type: 'base64', media_type: input.image.mediaType as 'image/png', data: input.image.data };
    const prompt = `
블로그 이미지가 글 내용과 맞는지 채점하세요.

[소제목] ${input.h2}
[전달할 뜻] ${input.point}
[보여야 할 대상] ${input.anchor || '(없음 — 소제목 뜻으로 판단)'}

[채점 기준]
5: 보여야 할 대상이 분명히 보이고 소제목 뜻과 맞음
4: 대상이 보이고 뜻이 대체로 맞음
3: 주제는 관련 있으나 대상이 흐리거나 일부만 보임
2: 일반적인 그림이나 상징물뿐, 대상이 없음
1: 내용과 무관하거나, 손·얼굴 왜곡 또는 읽히는 글자가 크게 보임

[감점하지 않는 것]
- 화면·문서의 글자와 숫자가 흐리거나 읽히지 않는 것 (일부러 흐리게 그립니다). 단, 보여야 할 대상이 화면 속 내용 자체라면 흐려서 알아볼 수 없을 때 3점 이하입니다.
- 색·재질이 대상 묘사와 다른 것 (화풍이 정합니다)
화면 밖(종이·노트·간판·물건)에 알아볼 수 있는 글자·숫자·손글씨가 있으면 작아도 3점 이하입니다.
이 두 가지 말고는 위 기준대로 채점합니다. 손·얼굴 왜곡이나 크게 읽히는 글자는 여전히 1점입니다.

아래 형식의 JSON만 <score> 태그 안에 출력하세요. 다른 설명은 쓰지 않습니다. reason은 무엇이 보이고 무엇이 빠졌는지 한국어 한 문장(60자 이내)입니다.
<score>{"score": 4, "reason": "..."}</score>
`;
    // 한국어 이유가 길어지면 300토큰에서 잘려 JSON이 깨졌다(실측). 여유를 두고, 잘리면 원인을 오류로 남긴다.
    const response = await anthropic.messages.create(
      {
        model: AI_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: [{ type: 'image', source }, { type: 'text', text: prompt }] }],
      },
      Number.isFinite(remaining) ? { timeout: Math.min(remaining - 2_000, 30_000), maxRetries: 0 } : undefined
    );
    const textBlock = response.content.find((block: any) => block.type === 'text') as any;
    if (!textBlock?.text) {
      throw new Error(`이미지 채점 응답에 글이 없습니다 (stop_reason=${response.stop_reason}, blocks=${response.content.map((b: any) => b.type).join(',')})`);
    }
    if (response.stop_reason === 'max_tokens') throw new Error('이미지 채점 응답이 길이 제한에서 잘렸습니다.');
    const result = parseJsonTag<{ score: number; reason: string }>(textBlock.text, 'score', '이미지 채점');
    const score = Number(result.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error(`이미지 채점 점수가 1~5가 아닙니다: ${result.score}`);
    return { score, reason: String(result.reason || '').slice(0, 200) };
  },

  // 글감 보드: 수집 항목 하나를 독자 질문·의도·빈틈·다음 행동으로 평가. 검색량·순위는 추정하지 않는다.
  async evaluateTopic(input: { content: string; existingPosts: { id: number; title: string; keyword: string | null }[]; profile: string }) {
    const prompt = `
당신은 검색 콘텐츠 기획자입니다. 아래 수집 항목이 내 블로그 글감으로 쓸 만한지 평가하세요.

[블로그 프로필]
${input.profile || '없음'}

[수집 항목]
${input.content.slice(0, 4000)}

[내 기존 글 (id · 제목 · 핵심어)]
${input.existingPosts.length > 0 ? input.existingPosts.map((p) => `${p.id} · ${p.title} · ${p.keyword || '-'}`).join('\n') : '없음'}

[평가 기준]
- question: 이 주제를 검색하는 독자가 실제로 묻는 질문 한 문장
- intent: 검색 의도 (정보 확인 / 방법 / 비교·선택 / 구매·행동 중 하나)
- journey: 독자 여정 단계 (문제인식 / 탐색 / 비교 / 행동 중 하나)
- why: 이 독자에게 왜 중요한지 (수집 항목에 근거해서)
- gap: 수집 항목만으로는 답이 부족한 부분
- myValue: 블로그 프로필 기준으로 내가 더할 수 있는 것. 근거가 없으면 "확인 필요"
- nextStep: NEW_POST(새 글) / IMPROVE(내 기존 글 보강) / RESEARCH(자료 추가 조사 먼저)
- relatedPostId: 주제가 겹치는 내 기존 글 id. 없으면 null. 겹치면 nextStep은 보통 IMPROVE
- hypotheses: 위 판단 중 수집 항목에 직접 나오지 않고 추정한 내용 (각 한 문장)
- 검색량·경쟁도·순위·클릭률은 쓰지 않습니다. 모르는 값을 지어내지 않습니다.

아래 형식의 JSON만 <topic> 태그 안에 출력하세요.
<topic>
{"keyword": "...", "topic": "주제 묶음", "question": "...", "intent": "...", "journey": "...", "why": "...", "gap": "...", "myValue": "...", "nextStep": "NEW_POST", "relatedPostId": null, "hypotheses": ["..."]}
</topic>
`;
    return parseJsonTag<TopicEvaluation>(await askText(prompt, 2000), 'topic', '글감 평가');
  },

  // 3. 기존 블로그 글을 바탕으로 OSMU (인스타, 숏츠, 스레드 등) 콘텐츠 변환
  async generateOSMUContent(parentContent: string, platform: string) {
    let platformGuide = "";
    switch (platform) {
      case 'INSTA':
        platformGuide = "인스타그램 피드 또는 카드뉴스에 어울리도록 감성적이고 시각적으로 상상할 수 있는 문구, 그리고 적절한 해시태그를 포함해 300자 내외로 작성하세요.";
        break;
      case 'SHORTS':
        platformGuide = "유튜브 쇼츠나 릴스의 대본 형태로 작성하세요. 초반 3초에 시선을 끄는 훅(Hook)이 있어야 하며, 전체 길이는 60초 이내에 읽을 수 있도록 간결한 구어체로 작성하세요.";
        break;
      case 'THREADS':
        platformGuide = "스레드(Threads)에 어울리는 짧고 위트 있는 문구로, 하나의 강력한 인사이트나 질문을 던져서 사람들의 댓글을 유도하도록 작성하세요.";
        break;
      default:
        platformGuide = "해당 플랫폼에 맞게 내용을 요약 및 변환해주세요.";
    }

    const prompt = `
당신은 뛰어난 콘텐츠 마케터입니다.
다음은 네이버 블로그에 작성된 원본 글입니다. 이 원본 글을 바탕으로 ${platform} 플랫폼에 맞게 OSMU(One Source Multi Use) 콘텐츠로 변환해주세요.

[원본 글]
${parentContent}

[플랫폼별 변환 지침]
${platformGuide}

출력은 변환된 콘텐츠 텍스트만 바로 출력해주세요.
`;

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block: any) => block.type === 'text') as any;
    return textBlock?.text || '';
  },

  // 4. 기사/수집 원문 실시간 AI 3줄 핵심 요약 & 블로그 착안점 도출
  async quickSummarizeArticle(title: string, text: string) {
    const prompt = `
당신은 트렌드 분석가이자 최고 수준의 블로그 기획 에디터입니다.
다음 기사/수집 텍스트를 분석하여, 블로그 포스팅에 즉시 활용할 수 있는 핵심 요약과 아이디어를 도출해주세요.

[기사 제목]
${title}

[기사 본문/내용]
${text.slice(0, 3500)}

[출력 형식]
반드시 아래 XML 태그 규격을 지켜서 답변해주세요.
<bullets>
- 핵심 요약 1 (간결하고 명확한 문장)
- 핵심 요약 2
- 핵심 요약 3
</bullets>
<takeaway>이 기사를 바탕으로 블로그 글을 쓸 때 활용할 수 있는 인사이트나 차별화 포인트 1~2문장</takeaway>
<keywords>키워드1, 키워드2, 키워드3, 키워드4</keywords>
`;

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1000,
      system: "You are an expert editorial consultant. Output strictly formatted XML tags as instructed.",
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block: any) => block.type === 'text') as any;
    const raw = textBlock?.text || '';

    const bulletsMatch = raw.match(/<bullets>([\s\S]*?)<\/bullets>/);
    const takeawayMatch = raw.match(/<takeaway>([\s\S]*?)<\/takeaway>/);
    const keywordsMatch = raw.match(/<keywords>([\s\S]*?)<\/keywords>/);

    const bullets = bulletsMatch 
      ? bulletsMatch[1].split('\n').map((s: string) => s.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)
      : ['원문 핵심 내용을 정리 중입니다.'];
    const takeaway = takeawayMatch ? takeawayMatch[1].trim() : '트렌드 분석에 유용한 글감입니다.';
    const keywords = keywordsMatch 
      ? keywordsMatch[1].split(',').map((k: string) => k.trim()).filter(Boolean)
      : [];

    return {
      bullets,
      takeaway,
      keywords
    };
  }
};

