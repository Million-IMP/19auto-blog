import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Send, Bot, Trash2, RotateCcw, Rss, Plus, X, Globe, Check, 
  ExternalLink, Eye, Copy, BookOpen, Sparkles, Clock, 
  Sun, Moon, FileText, CheckCheck
} from 'lucide-react';

const API_URL = 'http://localhost:3001/api';

export function InboxPage() {
  const [items, setItems] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [loadingId, setLoadingId] = useState<number | null>(null);

  // RSS 채널 관리 상태
  const [rssFeeds, setRssFeeds] = useState<any[]>([]);
  const [showRssModal, setShowRssModal] = useState(false);
  const [newRssName, setNewRssName] = useState('');
  const [newRssUrl, setNewRssUrl] = useState('');
  const [newRssCategory, setNewRssCategory] = useState('IT/테크');

  // 고급 스마트 리더 뷰어 상태
  const [activeArticle, setActiveArticle] = useState<any | null>(null);
  const [scrapedData, setScrapedData] = useState<any | null>(null);
  const [isScraping, setIsScraping] = useState(false);
  const [aiSummary, setAiSummary] = useState<{ bullets: string[]; takeaway: string; keywords: string[] } | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [readerTheme, setReaderTheme] = useState<'light' | 'paper' | 'dark'>('light');
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [contentTab, setContentTab] = useState<'full' | 'snippet'>('full');
  const [copiedLink, setCopiedLink] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveArticle(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const parseRssItem = (rawContent: string) => {
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
    } catch (e) {}

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
  };

  // 인앱 에디토리얼 리더 열기 & 웹페이지 원문 백그라운드 스크래핑
  const openArticleReader = async (item: any, parsed: any) => {
    setActiveArticle({ ...item, parsed });
    setScrapedData(null);
    setAiSummary(null);
    setScrollProgress(0);
    setContentTab('full');

    if (parsed.link) {
      setIsScraping(true);
      try {
        const res = await axios.post(`${API_URL}/inbox/scrape`, { url: parsed.link });
        setScrapedData(res.data);
      } catch (e) {
        console.warn("Scraping error:", e);
      } finally {
        setIsScraping(false);
      }
    }
  };

  // AI 3줄 핵심 요약 & 블로그 기획점 도출
  const handleQuickSummary = async () => {
    if (!activeArticle) return;
    setIsSummarizing(true);
    try {
      const textToAnalyze = scrapedData?.fullText || activeArticle.parsed?.snippet || activeArticle.content;
      const titleToAnalyze = scrapedData?.title || activeArticle.parsed?.title || '기사 요약';
      const res = await axios.post(`${API_URL}/inbox/quick-summary`, {
        title: titleToAnalyze,
        text: textToAnalyze,
      });
      setAiSummary(res.data);
    } catch (e) {
      alert("AI 요약 생성 중 오류가 발생했습니다.");
    } finally {
      setIsSummarizing(false);
    }
  };

  // 링크 클립보드 복사
  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  useEffect(() => {
    fetchInbox();
    fetchLogs();
    fetchRssFeeds();
  }, []);

  const fetchInbox = async () => {
    const res = await axios.get(`${API_URL}/inbox`);
    setItems(res.data.filter((item: any) => !item.processed));
  };

  const fetchLogs = async () => {
    try {
      const res = await axios.get(`${API_URL}/system-logs`);
      setLogs(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRssFeeds = async () => {
    try {
      const res = await axios.get(`${API_URL}/rss-feeds`);
      setRssFeeds(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddRss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRssName.trim() || !newRssUrl.trim()) return alert("채널명과 RSS URL을 입력해주세요.");
    try {
      await axios.post(`${API_URL}/rss-feeds`, {
        name: newRssName.trim(),
        url: newRssUrl.trim(),
        category: newRssCategory
      });
      setNewRssName('');
      setNewRssUrl('');
      fetchRssFeeds();
      alert("새 RSS 채널이 등록되었습니다.");
    } catch (e) {
      alert("RSS 채널 등록 중 오류가 발생했습니다.");
    }
  };

  const handleToggleRss = async (id: number) => {
    try {
      await axios.put(`${API_URL}/rss-feeds/${id}/toggle`);
      fetchRssFeeds();
    } catch (e) {
      alert("상태 변경 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteRss = async (id: number) => {
    if (!confirm("이 RSS 채널을 삭제하시겠습니까?")) return;
    try {
      await axios.delete(`${API_URL}/rss-feeds/${id}`);
      fetchRssFeeds();
    } catch (e) {
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    await axios.post(`${API_URL}/inbox`, { content, type: 'TEXT' });
    setContent('');
    fetchInbox();
  };

  const handleProcess = async (id: number) => {
    setLoadingId(id);
    try {
      const res = await axios.post(`${API_URL}/inbox/${id}/process`);
      const { category, data } = res.data;
      fetchInbox(); // Refresh list after successful processing

      const categoryName = category === 'MATERIAL' ? '1 재료 베이스' : '2 규칙 (프롬프트)';
      const targetPath = category === 'MATERIAL' ? '/materials' : '/rules';

      if (confirm(`🎉 AI 정제가 완료되었습니다!\n\n• 분류: [${categoryName}]\n• 생성된 제목: "${data.title}"\n• 키워드: ${data.keyword || '없음'}\n\n해당 메뉴(${categoryName})로 바로 이동하여 확인하시겠습니까?`)) {
        window.location.href = targetPath;
      }
    } catch (e) {
      console.error(e);
      alert("AI 정제 중 오류가 발생했습니다. 터미널 로그를 확인해주세요.");
    }
    setLoadingId(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await axios.delete(`${API_URL}/inbox/${id}`);
      fetchInbox();
    } catch (e) {
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 mb-6 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">0 수집함</h1>
          <p className="text-sm text-slate-500 mt-1">외부 정보와 떠오르는 아이디어를 자동/수동으로 모아둡니다.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowRssModal(true)}
            className="bg-white text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-slate-50 transition flex items-center gap-2 shadow-sm"
          >
            <Rss size={15} className="text-orange-500" /> RSS 채널 관리 ({rssFeeds.length})
          </button>
          <button 
            onClick={async () => {
              try {
                const res = await axios.post(`${API_URL}/inbox/rss`);
                alert(`활성화된 RSS 채널들에서 ${res.data.addedCount}개의 새 기사를 수집했습니다.`);
                fetchInbox();
                fetchLogs();
              } catch(e) {
                alert('RSS 수집 중 오류가 발생했습니다.');
              }
            }}
            className="bg-emerald-600 text-white px-3.5 py-1.5 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition flex items-center gap-2 shadow-sm"
          >
            <Bot size={16} /> 활성 RSS 즉시 수집
          </button>
        </div>
      </div>
      
      {/* 봇 활동 기록 위젯 */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6 shadow-sm flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-2 rounded-md"><Bot size={16} className="text-slate-600" /></div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">자동 수집 봇 상태</h3>
            {logs.length > 0 ? (
              <p className="text-xs text-slate-500 mt-1">
                마지막 실행: {new Date(logs[0].createdAt).toLocaleString()} <span className="mx-2 text-slate-300">|</span> <span className="font-medium text-slate-700">{logs[0].message}</span>
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-1">아직 기록된 봇 활동이 없습니다.</p>
            )}
          </div>
        </div>
        <button onClick={fetchLogs} className="text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0 flex items-center gap-1"><RotateCcw size={12}/> 로그 갱신</button>
      </div>
      
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2"><Send size={16} className="text-blue-500"/> 빠른 수집</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <textarea 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="URL이나 떠오르는 아이디어를 입력 (Enter: 줄바꿈, Ctrl+Enter: 전송)" 
              rows={2}
              className="flex-1 p-3 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-900 resize-y min-h-[44px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) handleSubmit(e);
              }}
            />
            <div className="flex flex-col gap-2 shrink-0">
              <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm font-semibold hover:bg-blue-700 transition w-full h-[44px] flex items-center justify-center gap-2">
                저장하기
              </button>
              <button type="button" onClick={() => setContent('')} className="text-slate-500 bg-slate-100 hover:bg-slate-200 px-5 py-2 rounded-md text-xs font-semibold transition w-full">
                지우기
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-slate-700">대기 중인 수집 항목 ({items.length})</h3>
        </div>

        {/* 목록 최상단 구분 컬러 라인 */}
        {items.length > 0 && (
          <div className="h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-sky-400 shadow-xs" />
        )}

        <div className="divide-y divide-slate-100">
          {items.length === 0 ? (
            <p className="text-slate-500 text-center py-8 text-sm">처리할 아이템이 없습니다.</p>
          ) : (
            Object.entries(
              items.reduce((acc: any, item: any) => {
                const date = new Date(item.createdAt);
                const key = date.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                if (!acc[key]) acc[key] = [];
                acc[key].push(item);
                return acc;
              }, {})
            ).map(([time, groupItems]: [string, any], groupIdx: number, arr: any[]) => (
              <div key={time} className="relative">
                {/* 시간대 헤더 */}
                <div className="bg-slate-100 px-4 py-2.5 border-y border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                    <span className="text-xs font-bold text-slate-800 bg-white border border-slate-200 px-2.5 py-0.5 rounded shadow-xs">
                      🕒 {time} 수집
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                    {groupItems.length}건의 기사
                  </span>
                </div>

                {/* 해당 시간대 기사 목록 */}
                <div className="divide-y divide-slate-200/80">
                  {groupItems.map((item: any, idx: number) => {
                    const isOdd = idx % 2 === 1;
                    const parsed = parseRssItem(item.content);

                    return (
                      <div 
                        key={item.id} 
                        className={`p-4.5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors group border-l-4 ${
                          isOdd 
                            ? 'bg-slate-100/80 border-l-slate-300 hover:bg-blue-50/70 hover:border-l-blue-500' 
                            : 'bg-white border-l-transparent hover:bg-blue-50/70 hover:border-l-blue-500'
                        }`}
                      >
                        <div className="flex-1 min-w-0 flex items-start gap-3">
                          <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded shrink-0 font-bold ${
                            isOdd ? 'bg-slate-200/90 text-slate-600' : 'bg-slate-100 text-slate-500'
                          }`}>
                            #{idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            {parsed.isRss ? (
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold rounded shadow-2xs">
                                    {parsed.channel}
                                  </span>

                                  {/* 링크 배지 및 고급 리치 프리뷰 팝오버 */}
                                  {parsed.link && (
                                    <div className="relative inline-flex items-center group/preview">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); openArticleReader(item, parsed); }}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-md text-xs font-semibold transition-all shadow-2xs cursor-pointer group-hover/preview:border-blue-400"
                                      >
                                        {parsed.domain ? (
                                          <img 
                                            src={`https://www.google.com/s2/favicons?domain=${parsed.domain}&sz=32`} 
                                            alt="" 
                                            className="w-3.5 h-3.5 rounded-xs"
                                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                          />
                                        ) : (
                                          <Globe size={13} className="text-blue-500" />
                                        )}
                                        <span className="truncate max-w-[180px] sm:max-w-[280px] font-mono">{parsed.domain || parsed.link}</span>
                                        <span className="text-[10px] text-blue-600 bg-white border border-blue-200 px-1 py-0.2 rounded font-sans font-bold flex items-center gap-0.5">
                                          <Eye size={10} /> 열람
                                        </span>
                                      </button>
                                      
                                      {/* 고급 리치 프리뷰 팝오버 (슬랙/트위터 스타일 카드) */}
                                      <div className="absolute left-0 bottom-full mb-2.5 hidden group-hover/preview:flex flex-col bg-slate-900/95 backdrop-blur-md text-white text-xs p-3.5 rounded-xl shadow-2xl z-40 min-w-[300px] max-w-[380px] pointer-events-none border border-slate-700/80 animate-in fade-in zoom-in-95 duration-150">
                                        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2 mb-2">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            {parsed.domain && (
                                              <img 
                                                src={`https://www.google.com/s2/favicons?domain=${parsed.domain}&sz=32`} 
                                                alt="" 
                                                className="w-4 h-4 rounded-xs shrink-0" 
                                              />
                                            )}
                                            <span className="text-[11px] font-bold text-slate-300 truncate">{parsed.domain || '원문 출처'}</span>
                                          </div>
                                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
                                            <Clock size={10} /> 약 {parsed.readingTime}분 분량
                                          </span>
                                        </div>

                                        <p className="font-bold text-slate-100 text-[12px] line-clamp-1 mb-1">
                                          {parsed.title}
                                        </p>
                                        <p className="text-slate-400 text-[11px] line-clamp-2 leading-relaxed">
                                          {parsed.snippet}
                                        </p>

                                        <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                                          <span className="text-blue-400 font-medium flex items-center gap-1">
                                            <Sparkles size={11} className="text-blue-400 animate-pulse" /> 클릭 시 스마트 리더로 전체 열람
                                          </span>
                                          <span className="font-mono text-slate-500">ESC 닫기</span>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* 기사 제목 (클릭 시 화면 내 에디토리얼 리더 열림) */}
                                <h4 
                                  onClick={() => openArticleReader(item, parsed)}
                                  className="text-sm font-bold text-slate-900 hover:text-blue-600 transition cursor-pointer flex items-center gap-1.5 pt-0.5"
                                  title="클릭하여 스마트 리더로 전체 기사 보기"
                                >
                                  {parsed.title}
                                  <Eye size={13} className="text-slate-400 opacity-0 group-hover:opacity-100 transition shrink-0" />
                                </h4>

                                {/* 기사 요약 미리보기 */}
                                <p 
                                  onClick={() => openArticleReader(item, parsed)}
                                  className="text-slate-600 text-xs leading-relaxed line-clamp-2 cursor-pointer hover:text-slate-800 transition"
                                  title="클릭하여 스마트 리더로 전체 기사 보기"
                                >
                                  {parsed.snippet}
                                </p>
                              </div>
                            ) : (
                              <p 
                                onClick={() => openArticleReader(item, parsed)}
                                className="text-slate-800 text-sm whitespace-pre-wrap leading-relaxed cursor-pointer hover:text-blue-600 transition"
                                title="클릭하여 전체 보기"
                              >
                                {item.content}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end md:self-center opacity-100 sm:opacity-90 sm:group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleProcess(item.id)}
                            disabled={loadingId === item.id}
                            className="bg-white text-blue-600 border border-blue-200 px-3.5 py-1.5 rounded-md text-xs font-semibold hover:bg-blue-600 hover:text-white hover:border-blue-600 shadow-2xs flex items-center gap-1.5 transition disabled:opacity-50"
                          >
                            {loadingId === item.id ? <span className="animate-pulse">처리 중...</span> : <><Bot size={14} /> AI 정제 (재료화)</>}
                          </button>
                          <button 
                            onClick={() => handleDelete(item.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                            title="삭제"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 시간별 그룹 마지막 칸 사이의 구분 컬러 라인 */}
                {groupIdx < arr.length - 1 && (
                  <div className="h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-sky-400 shadow-xs" />
                )}
              </div>
            ))
          )}
        </div>

        {/* 목록 최하단 구분 컬러 라인 */}
        {items.length > 0 && (
          <div className="h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-sky-400 shadow-xs" />
        )}
      </div>

      {/* 최고급 스마트 인앱 에디토리얼 리더 모달 */}
      {activeArticle && (
        <div 
          onClick={() => setActiveArticle(null)}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className={`rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border transition-colors duration-200 animate-in zoom-in-95 duration-150 ${
              readerTheme === 'paper' 
                ? 'bg-[#fcf8f2] text-[#2c2621] border-[#e8dfd5]' 
                : readerTheme === 'dark' 
                  ? 'bg-slate-900 text-slate-100 border-slate-800' 
                  : 'bg-white text-slate-900 border-slate-200'
            }`}
          >
            {/* 1. 최상단 실시간 독서 진행률 게이지 바 (Reading Progress Bar) */}
            <div className="w-full bg-slate-200/50 dark:bg-slate-800 h-1 relative overflow-hidden shrink-0">
              <div 
                className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-sky-400 transition-all duration-75 ease-out" 
                style={{ width: `${scrollProgress}%` }}
              />
            </div>

            {/* 2. 상단 에디토리얼 도구 모음 헤더 */}
            <div className={`px-5 py-3 border-b flex items-center justify-between gap-3 shrink-0 ${
              readerTheme === 'dark' ? 'bg-slate-950/80 border-slate-800 text-slate-300' : 'bg-slate-50/90 border-slate-200 text-slate-700'
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen size={16} className="text-blue-500 shrink-0" />
                <span className="font-bold text-xs truncate">
                  {activeArticle.parsed?.isRss ? `[${activeArticle.parsed.channel}] 에디토리얼 리더 뷰` : '수집 항목 리더 뷰'}
                </span>
                {activeArticle.parsed?.readingTime && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-white/60 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full">
                    <Clock size={10} /> 약 {scrapedData?.readingTimeMinutes || activeArticle.parsed.readingTime}분 분량
                  </span>
                )}
              </div>

              {/* 뷰어 도구 컨트롤 (테마, 폰트 크기, 복사, 새창, 닫기) */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* 리더 테마 스위처 */}
                <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 text-xs">
                  <button
                    onClick={() => setReaderTheme('light')}
                    className={`px-2 py-1 rounded text-[11px] font-bold transition flex items-center gap-1 ${readerTheme === 'light' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900'}`}
                    title="라이트 모드"
                  >
                    <Sun size={12} />
                  </button>
                  <button
                    onClick={() => setReaderTheme('paper')}
                    className={`px-2 py-1 rounded text-[11px] font-bold transition flex items-center gap-1 ${readerTheme === 'paper' ? 'bg-[#936d4b] text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900'}`}
                    title="페이퍼 모드 (눈 편한 세피아)"
                  >
                    📜
                  </button>
                  <button
                    onClick={() => setReaderTheme('dark')}
                    className={`px-2 py-1 rounded text-[11px] font-bold transition flex items-center gap-1 ${readerTheme === 'dark' ? 'bg-slate-700 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900'}`}
                    title="다크 모드"
                  >
                    <Moon size={12} />
                  </button>
                </div>

                {/* 폰트 크기 조절 */}
                <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <button 
                    onClick={() => setFontSize('sm')} 
                    className={`px-2 py-1 rounded text-[11px] ${fontSize === 'sm' ? 'bg-slate-200 dark:bg-slate-700 text-blue-600' : ''}`}
                    title="작은 글씨"
                  >
                    A-
                  </button>
                  <button 
                    onClick={() => setFontSize('base')} 
                    className={`px-2 py-1 rounded text-[11px] ${fontSize === 'base' ? 'bg-slate-200 dark:bg-slate-700 text-blue-600' : ''}`}
                    title="보통 글씨"
                  >
                    A
                  </button>
                  <button 
                    onClick={() => setFontSize('lg')} 
                    className={`px-2 py-1 rounded text-[11px] ${fontSize === 'lg' ? 'bg-slate-200 dark:bg-slate-700 text-blue-600' : ''}`}
                    title="큰 글씨"
                  >
                    A+
                  </button>
                </div>

                {/* 원문 링크 복사 */}
                {activeArticle.parsed?.link && (
                  <button
                    onClick={() => handleCopyLink(activeArticle.parsed.link)}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1 rounded-lg text-xs font-semibold hover:bg-slate-100 transition flex items-center gap-1 shadow-2xs cursor-pointer"
                    title="원문 링크 복사"
                  >
                    {copiedLink ? <CheckCheck size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    <span className="hidden md:inline">{copiedLink ? '복사됨!' : '복사'}</span>
                  </button>
                )}

                {/* 외부 새창 열기 */}
                {activeArticle.parsed?.link && (
                  <a
                    href={activeArticle.parsed.link}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 transition shadow-2xs"
                    title="원문 웹페이지 새 탭으로 열기"
                  >
                    <ExternalLink size={13} />
                  </a>
                )}

                {/* 닫기 버튼 */}
                <button 
                  onClick={() => setActiveArticle(null)} 
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
                  title="닫기 (ESC 또는 바깥 여백 클릭)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* 3. 모달 스크롤 본문 영역 */}
            <div 
              onScroll={(e) => {
                const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                if (scrollHeight - clientHeight > 0) {
                  setScrollProgress(Math.round((scrollTop / (scrollHeight - clientHeight)) * 100));
                }
              }}
              className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-6"
            >
              {/* 스크래핑된 OG 대표 이미지 배너 */}
              {scrapedData?.ogImage && (
                <div className="rounded-xl overflow-hidden shadow-sm max-h-64 border border-slate-200/60 dark:border-slate-700 relative group">
                  <img 
                    src={scrapedData.ogImage} 
                    alt="" 
                    className="w-full h-64 object-cover group-hover:scale-101 transition duration-300"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                </div>
              )}

              {/* 헤드라인 및 출처 메타정보 */}
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
                  <span className="font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 px-2 py-0.5 rounded-md">
                    {scrapedData?.siteName || activeArticle.parsed?.channel || '웹 수집'}
                  </span>
                  {scrapedData?.author && (
                    <span className="text-slate-500 font-medium">by {scrapedData.author}</span>
                  )}
                  <span className="text-slate-400 font-mono text-[11px]">
                    수집 일시: {new Date(activeArticle.createdAt).toLocaleString()}
                  </span>
                  {scrapedData?.charCount ? (
                    <span className="text-slate-400 text-[11px] font-mono">
                      • {scrapedData.charCount.toLocaleString()}자 (~{scrapedData.readingTimeMinutes}분 독서)
                    </span>
                  ) : null}
                </div>

                <h1 className="text-xl sm:text-2xl font-black leading-tight tracking-tight">
                  {scrapedData?.title || (activeArticle.parsed?.isRss ? activeArticle.parsed.title : '수집 항목')}
                </h1>
              </div>

              {/* AI 실시간 3줄 요약 & 블로그 기획 패널 */}
              <div className={`p-4.5 rounded-xl border transition-all ${
                readerTheme === 'dark' 
                  ? 'bg-slate-800/80 border-slate-700' 
                  : readerTheme === 'paper' 
                    ? 'bg-[#f4eee5] border-[#dfd5c7]' 
                    : 'bg-gradient-to-br from-indigo-50/70 via-blue-50/50 to-sky-50/70 border-indigo-100 shadow-2xs'
              }`}>
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-600 animate-pulse" />
                    <h3 className="font-black text-xs sm:text-sm text-indigo-900 dark:text-indigo-300 tracking-tight">
                      AI 실시간 에디토리얼 어시스턴트
                    </h3>
                  </div>
                  
                  {!aiSummary && (
                    <button
                      onClick={handleQuickSummary}
                      disabled={isSummarizing}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      {isSummarizing ? (
                        <span className="flex items-center gap-1.5"><RotateCcw size={12} className="animate-spin" /> AI 분석 중...</span>
                      ) : (
                        <><Sparkles size={13} /> 3줄 핵심 요약 & 소재 분석</>
                      )}
                    </button>
                  )}
                </div>

                {aiSummary ? (
                  <div className="space-y-3 pt-1">
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 mb-1.5">
                        💡 핵심 요약 (Key Insights)
                      </h4>
                      <ul className="space-y-1.5">
                        {aiSummary.bullets.map((b, i) => (
                          <li key={i} className="text-xs leading-relaxed flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-2 border-t border-indigo-200/60 dark:border-slate-700/60">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 mb-1">
                        🎯 블로그 작성 착안점 (Why It Matters)
                      </h4>
                      <p className="text-xs leading-relaxed font-medium">
                        {aiSummary.takeaway}
                      </p>
                    </div>

                    {aiSummary.keywords.length > 0 && (
                      <div className="pt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400">추천 키워드 태그:</span>
                        {aiSummary.keywords.map((kw, i) => (
                          <span key={i} className="text-[11px] font-semibold bg-white dark:bg-slate-700 border border-indigo-200 dark:border-slate-600 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md shadow-2xs">
                            #{kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    상단 버튼을 누르면 AI가 본문 전체를 분석하여 <strong>3줄 핵심 요약</strong>, <strong>블로그 글감 착안점</strong>, <strong>추천 키워드 태그</strong>를 즉석에서 도출합니다.
                  </p>
                )}
              </div>

              {/* 탭 전환: [원문 전체 본문 스크래핑] vs [RSS 요약본] */}
              <div className="flex border-b border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setContentTab('full')}
                  className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                    contentTab === 'full' 
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <FileText size={14} /> 원문 전체 본문 {isScraping && '(가져오는 중...)'}
                </button>
                <button
                  onClick={() => setContentTab('snippet')}
                  className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                    contentTab === 'snippet' 
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Rss size={14} /> RSS 수집 요약본
                </button>
              </div>

              {/* 본문 뷰어 */}
              <div className={`space-y-4 font-sans ${
                fontSize === 'sm' ? 'text-xs' : fontSize === 'lg' ? 'text-base leading-loose' : 'text-sm leading-relaxed'
              }`}>
                {contentTab === 'full' ? (
                  isScraping ? (
                    <div className="space-y-3 py-6 animate-pulse">
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div>
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
                      <div className="py-2 text-center text-xs text-slate-400 font-mono">
                        🌐 웹페이지 원문 전체 텍스트를 정밀 파싱하고 있습니다...
                      </div>
                    </div>
                  ) : scrapedData?.fullText ? (
                    <div className="whitespace-pre-wrap leading-relaxed space-y-4">
                      {scrapedData.fullText}
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg text-xs text-amber-800 dark:text-amber-300 space-y-2">
                      <p className="font-bold">웹사이트 원문 전체 스크래핑 안내</p>
                      <p>해당 웹페이지의 방화벽/봇 차단 정책으로 인해 본문 전체를 긁어오지 못했습니다. 아래의 RSS 요약본을 확인해 주세요.</p>
                      <div className="pt-2 text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {activeArticle.parsed?.snippet || activeArticle.content}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="whitespace-pre-wrap leading-relaxed p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    {activeArticle.parsed?.snippet || activeArticle.content}
                  </div>
                )}
              </div>
            </div>

            {/* 4. 하단 플로팅 액션 도크 */}
            <div className={`px-6 py-4 border-t flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0 ${
              readerTheme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <span>💡 단축키 <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-mono text-[10px]">ESC</kbd> 또는 바깥 여백을 클릭해도 닫힙니다.</span>
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button 
                  onClick={() => {
                    const id = activeArticle.id;
                    setActiveArticle(null);
                    handleProcess(id);
                  }}
                  className="flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Bot size={14} /> 1 재료함으로 즉시 정제
                </button>
                <button 
                  onClick={() => setActiveArticle(null)} 
                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 px-4 py-2 rounded-lg text-xs font-semibold transition shadow-2xs cursor-pointer"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RSS 채널 관리 모달 */}
      {showRssModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Rss size={18} className="text-orange-400" />
                <h3 className="font-bold text-base">RSS 수집 채널 관리</h3>
              </div>
              <button onClick={() => setShowRssModal(false)} className="text-slate-400 hover:text-white transition">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* 새 채널 등록 폼 */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Plus size={14} className="text-orange-500" /> 새 RSS 채널 등록
                </h4>
                <form onSubmit={handleAddRss} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input 
                      type="text" 
                      value={newRssName} 
                      onChange={(e) => setNewRssName(e.target.value)}
                      placeholder="채널명 (예: GeekNews)" 
                      className="text-xs p-2.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:border-orange-500 font-semibold"
                    />
                    <select
                      value={newRssCategory}
                      onChange={(e) => setNewRssCategory(e.target.value)}
                      className="text-xs p-2.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:border-orange-500 text-slate-700"
                    >
                      <option value="IT/테크">IT / 테크</option>
                      <option value="개발/기술">개발 / 기술</option>
                      <option value="스타트업/비즈니스">스타트업 / 비즈니스</option>
                      <option value="일반 트렌드">일반 트렌드</option>
                    </select>
                    <input 
                      type="text" 
                      value={newRssUrl} 
                      onChange={(e) => setNewRssUrl(e.target.value)}
                      placeholder="RSS URL (https://.../feed)" 
                      className="text-xs p-2.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:border-orange-500 col-span-1 sm:col-span-3 font-mono"
                    />
                  </div>
                  <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2 rounded-md text-xs font-bold transition shadow-sm">
                    + RSS 채널 등록하기
                  </button>
                </form>
              </div>

              {/* 등록된 RSS 목록 */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">등록된 채널 목록 ({rssFeeds.length})</h4>
                <div className="space-y-2">
                  {rssFeeds.length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center">등록된 RSS 채널이 없습니다.</p>
                  ) : (
                    rssFeeds.map(feed => (
                      <div key={feed.id} className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3 shadow-xs hover:border-slate-300 transition">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{feed.category || '기본'}</span>
                            <h5 className="text-sm font-bold text-slate-900 truncate">{feed.name}</h5>
                          </div>
                          <p className="text-xs text-slate-400 font-mono truncate">{feed.url}</p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <button 
                            type="button" 
                            onClick={() => handleToggleRss(feed.id)}
                            className={`px-2.5 py-1 rounded text-xs font-bold border transition ${feed.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}
                          >
                            {feed.isActive ? '자동수집 켜짐' : '꺼짐'}
                          </button>
                          <button 
                            type="button" 
                            onClick={() => handleDeleteRss(feed.id)}
                            className="text-slate-300 hover:text-red-500 p-1 rounded transition" 
                            title="채널 삭제"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-right">
              <button onClick={() => setShowRssModal(false)} className="text-xs bg-white border border-slate-300 px-4 py-2 rounded-md font-semibold text-slate-700 hover:bg-slate-100 transition shadow-sm">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
