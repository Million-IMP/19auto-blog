// 수집 항목 원문에서 RSS 채널·제목·링크·요약을 뽑는다. RSS가 아니면 원문 전체를 요약으로 쓴다.
export function parseRssItem(rawContent: string) {
  const isRss = rawContent.startsWith('[RSS -');
  if (!isRss) {
    return { 
      isRss: false, 
      channel: '', 
      title: '', 
      link: '', 
      domain: '', 
      snippet: rawContent, 
      readingTime: Math.max(1, Math.ceil(rawContent.length / 450)),
      raw: rawContent 
    };
  }
  const channelMatch = rawContent.match(/^\[RSS - (.*?)\]/);
  const titleMatch = rawContent.match(/Title:\s*(.+)/);
  const linkMatch = rawContent.match(/Link:\s*(https?:\/\/[^\s]+)/);
  const snippetMatch = rawContent.match(/Snippet:\s*([\s\S]+)/);
  const link = linkMatch ? linkMatch[1].trim() : '';

  let domain = '';
  try {
    if (link) domain = new URL(link).hostname.replace(/^www\./, '');
  } catch {}

  const snippet = snippetMatch ? snippetMatch[1].trim() : rawContent;
  const readingTime = Math.max(1, Math.ceil((snippet.length + 350) / 450));

  return {
    isRss: true,
    channel: channelMatch ? channelMatch[1].trim() : 'RSS',
    title: titleMatch ? titleMatch[1].trim() : '제목 없음',
    link,
    domain,
    snippet,
    readingTime,
    raw: rawContent
  };
}

export type ParsedInboxItem = ReturnType<typeof parseRssItem>;
