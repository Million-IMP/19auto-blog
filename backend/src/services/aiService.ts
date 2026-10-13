import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '', 
});

// 간단한 URL 스크래퍼 (네이버 블로그의 경우 iframe 내부 주소 우회 시도)
async function extractUrlText(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // 네이버 블로그는 mainFrame이라는 iframe 안에 실제 본문이 있음
    const iframeSrc = $('#mainFrame').attr('src');
    if (iframeSrc) {
      const realUrl = iframeSrc.startsWith('http') ? iframeSrc : `https://blog.naver.com${iframeSrc}`;
      console.log("Fetching Naver Iframe:", realUrl);
      const realRes = await fetch(realUrl);
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

export const aiService = {
  // 특정 글의 구조를 추출하여 재료 템플릿으로 변환
  async extractMaterialStructure(url: string) {
    const extractedText = await extractUrlText(url);
    
    if (extractedText.includes("가져오는 데 실패했습니다")) {
      throw new Error("웹페이지 구조를 읽어오지 못했습니다. 크롤링 방어가 설정된 페이지일 수 있습니다.");
    }

    const prompt = `
당신은 최고의 블로그 컨설턴트이자 구조 분석가입니다.
다음은 벤치마킹할 블로그 포스트의 텍스트 원본입니다. 이 글의 '특정 내용'을 복사하는 것이 아니라, 이 글이 어떻게 쓰였는지 '구조와 뼈대(목차 흐름, 논리 전개)'를 추출해주세요.

[블로그 포스트 원본]
${extractedText}

[출력 지침]
1. 이 글의 전개 구조를 1, 2, 3 단계로 목차화하여 요약해주세요. (예: 1. 시선을 끄는 도입부(질문형) -> 2. 장점 3가지 나열 -> 3. 아쉬운 점과 극복 팁 -> 4. 독자에게 질문을 던지는 마무리)
2. 각 목차 단계별로 글을 작성할 때 참고해야 할 핵심 포인트를 1~2줄씩 덧붙여주세요.
3. 반드시 아래 XML 태그를 사용하여 출력하세요.

<title>이 구조를 부르기 좋은 직관적인 템플릿 제목 (예: IT 제품 실사용 리뷰 구조)</title>
<content>추출한 구조와 뼈대 (Markdown 리스트 포맷)</content>
`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block: any) => block.type === 'text') as any;
    const resultText = textBlock?.text || '';

    const titleMatch = resultText.match(/<title>([\s\S]*?)<\/title>/);
    const contentMatch = resultText.match(/<content>([\s\S]*?)<\/content>/);

    if (!titleMatch || !contentMatch) {
      throw new Error("AI가 구조 추출 중 응답 포맷을 어겼습니다.");
    }

    return {
      title: titleMatch[1].trim(),
      content: contentMatch[1].trim()
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
      model: 'claude-haiku-5-5',
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

  // 2. 키워드, 수집함 데이터, 재료 템플릿, 규칙 템플릿을 바탕으로 네이버 블로그 초안 작성 (Direct Generate)
  async generateDirectDraft(keyword: string, inboxContents: string[], materialTemplates: string[], ruleTemplates: string[]) {
    // 텍스트 내에 URL이 포함되어 있다면 해당 내용을 추출하여 추가 (수집함 데이터)
    let enrichedContents = [];
    for (const content of inboxContents) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = content.match(urlRegex) || [];
      let extraContext = '';
      for (const url of urls) {
        const extracted = await extractUrlText(url);
        extraContext += `\n[웹페이지 내용 참고: ${url}]\n${extracted}\n`;
      }
      enrichedContents.push(content + extraContext);
    }

    const prompt = `
당신은 최고의 SEO, AEO(Answer Engine Optimization), GEO(Generative Engine Optimization) 전문가이자 네이버 블로그 전문 AI 에디터입니다.
주어진 [사용자 입력 키워드(선택)], [원시 자료], [글감 템플릿], [규칙]을 종합하여, 검색 엔진과 AI 검색 모두에서 노출되기 가장 좋은 최적의 타겟 키워드를 먼저 도출하고, 이를 바탕으로 완성도 높은 네이버 블로그 글 초안을 작성해주세요.

[사용자 입력 타겟 키워드]
${keyword ? keyword : '없음 (AI가 자료를 분석하여 최적의 타겟 키워드를 도출할 것)'}

[원시 자료 (글의 재료가 될 내용)]
${enrichedContents.length > 0 ? enrichedContents.map((m, i) => `${i + 1}. ${m}`).join('\n\n') : '없음'}

[글감 템플릿 (글의 뼈대와 방향성)]
${materialTemplates.length > 0 ? materialTemplates.map((m, i) => `${i + 1}. ${m}`).join('\n') : '자유 형식'}

[규칙 (반드시 지켜야 할 말투나 형식)]
${ruleTemplates.length > 0 ? ruleTemplates.map((r, i) => `${i + 1}. ${r}`).join('\n') : '제한 없음'}

[작성 지침]
1. 사용자 입력 키워드가 '없음'이거나 부실하다면, 주어진 원시 자료를 바탕으로 SEO(검색량 대비 경쟁도), AEO(사용자의 명확한 질문에 대한 답변형), GEO(AI 요약 엔진이 선호하는 구조)에 가장 적합한 핵심 키워드(롱테일 키워드 포함)를 스스로 도출하세요.
2. 도출된 키워드를 활용해 클릭을 유도하는 매력적인 제목을 작성하세요.
3. 서론-본론-결론 구조를 가지며, 모바일 가독성을 위해 문단을 짧게 나누고 가독성을 높이세요. GEO 최적화를 위해 글 초반에 요약(결론)을 배치하는 것도 좋습니다.
4. 네이버 블로그 SEO 가산점 및 시각적 가독성을 위해, 본문의 주요 소제목(## 또는 ###) 아래에 해당 내용과 어울리는 이미지가 들어갈 자리 2~3곳에 반드시 '[[IMAGE: 상세한 영문 이미지 묘사, photorealistic, high quality blog]]' 마커를 분산 배치하세요.
5. 출력은 반드시 아래 XML 태그를 사용하여 구조화된 형태로 작성해주세요.

<keyword>도출한 최적의 타겟 키워드</keyword>
<title>작성한 블로그 제목</title>
<content>
작성한 블로그 본문 내용 (Markdown 포맷)
</content>
`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block: any) => block.type === 'text') as any;
    const resultText = textBlock?.text || '';

    // XML 태그 파싱
    const keywordMatch = resultText.match(/<keyword>([\s\S]*?)<\/keyword>/);
    const titleMatch = resultText.match(/<title>([\s\S]*?)<\/title>/);
    const contentMatch = resultText.match(/<content>([\s\S]*?)<\/content>/);

    let rawContent = contentMatch ? contentMatch[1].trim() : resultText;

    // 본문 내 [[IMAGE: ...]] 마커를 Pollinations AI 이미지 URL로 자동 치환
    const processedContent = rawContent.replace(/\[\[IMAGE:\s*([\s\S]*?)\]\]/g, (_, imgDesc) => {
      const cleanDesc = encodeURIComponent(imgDesc.trim().replace(/\n/g, ' '));
      return `\n\n![일러스트](https://image.pollinations.ai/prompt/${cleanDesc}?width=800&height=400&nologo=true)\n\n`;
    });

    return {
      keyword: keywordMatch ? keywordMatch[1].trim() : (keyword || '키워드 미상'),
      title: titleMatch ? titleMatch[1].trim() : `[초안] ${keyword || 'AI 생성 글'}`,
      content: processedContent
    };
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
      model: 'claude-haiku-5-5',
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
      model: 'claude-haiku-5-5',
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

