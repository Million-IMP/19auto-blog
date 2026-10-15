import { useEffect, useState } from 'react';
import axios from 'axios';
import { Bot, RotateCcw, Rss, X, ExternalLink, Copy, BookOpen, Sparkles, Clock, Sun, Moon, FileText, CheckCheck } from 'lucide-react';
import type { ParsedInboxItem } from './parseRssItem';

const API_URL = '/api';

export type ReaderArticle = { id: number; content: string; createdAt: string; processed: boolean; parsed: ParsedInboxItem };

type Props = {
  article: ReaderArticle | null;
  onClose: () => void;
  onProcess: (id: number) => void;
};

// 수집 항목 인앱 리더. 열 때마다 원문을 스크래핑하고, 테마·글씨 크기는 페이지에 머무는 동안 유지한다.
export function ArticleReader({ article, onClose, onProcess }: Props) {
const [scrapedData, setScrapedData] = useState<any | null>(null);
const [isScraping, setIsScraping] = useState(false);
const [aiSummary, setAiSummary] = useState<{ bullets: string[]; takeaway: string; keywords: string[] } | null>(null);
const [isSummarizing, setIsSummarizing] = useState(false);
const [readerTheme, setReaderTheme] = useState<'light' | 'paper' | 'dark'>('light');
const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
const [contentTab, setContentTab] = useState<'full' | 'snippet'>('full');
const [copiedLink, setCopiedLink] = useState(false);
const [scrollProgress, setScrollProgress] = useState(0);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 새 항목을 열면 이전 결과를 비운다
  const [shownArticle, setShownArticle] = useState(article);
  if (article !== shownArticle) {
    setShownArticle(article);
    setScrapedData(null);
    setAiSummary(null);
    setScrollProgress(0);
    setContentTab('full');
    setIsScraping(Boolean(article?.parsed.link));
  }

  // 웹페이지 원문은 백그라운드로 가져온다
  useEffect(() => {
    const link = article?.parsed.link;
    if (!link) return;
    let cancelled = false;
    axios.post(`${API_URL}/inbox/scrape`, { url: link })
      .then((res) => { if (!cancelled) setScrapedData(res.data); })
      .catch((e) => console.warn('Scraping error:', e))
      .finally(() => { if (!cancelled) setIsScraping(false); });
    return () => { cancelled = true; };
  }, [article]);

// AI 3줄 핵심 요약 & 블로그 기획점 도출
const handleQuickSummary = async () => {
  if (!article) return;
  setIsSummarizing(true);
  try {
    const textToAnalyze = scrapedData?.fullText || article.parsed?.snippet || article.content;
    const titleToAnalyze = scrapedData?.title || article.parsed?.title || '기사 요약';
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

  if (!article) return null;

  return (
      <div 
        onClick={() => onClose()}
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
                {article.parsed?.isRss ? `[${article.parsed.channel}] 에디토리얼 리더 뷰` : '수집 항목 리더 뷰'}
              </span>
              {article.parsed?.readingTime && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-white/60 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full">
                  <Clock size={10} /> 약 {scrapedData?.readingTimeMinutes || article.parsed.readingTime}분 분량
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
              {article.parsed?.link && (
                <button
                  onClick={() => handleCopyLink(article.parsed.link)}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1 rounded-lg text-xs font-semibold hover:bg-slate-100 transition flex items-center gap-1 shadow-2xs cursor-pointer"
                  title="원문 링크 복사"
                >
                  {copiedLink ? <CheckCheck size={13} className="text-emerald-500" /> : <Copy size={13} />}
                  <span className="hidden md:inline">{copiedLink ? '복사됨!' : '복사'}</span>
                </button>
              )}

              {/* 외부 새창 열기 */}
              {article.parsed?.link && (
                <a
                  href={article.parsed.link}
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
                onClick={() => onClose()} 
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
                  {scrapedData?.siteName || article.parsed?.channel || '웹 수집'}
                </span>
                {scrapedData?.author && (
                  <span className="text-slate-500 font-medium">by {scrapedData.author}</span>
                )}
                <span className="text-slate-400 font-mono text-[11px]">
                  수집 일시: {new Date(article.createdAt).toLocaleString()}
                </span>
                {scrapedData?.charCount ? (
                  <span className="text-slate-400 text-[11px] font-mono">
                    • {scrapedData.charCount.toLocaleString()}자 (~{scrapedData.readingTimeMinutes}분 독서)
                  </span>
                ) : null}
              </div>

              <h1 className="text-xl sm:text-2xl font-black leading-tight tracking-tight">
                {scrapedData?.title || (article.parsed?.isRss ? article.parsed.title : '수집 항목')}
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
                      {article.parsed?.snippet || article.content}
                    </div>
                  </div>
                )
              ) : (
                <div className="whitespace-pre-wrap leading-relaxed p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                  {article.parsed?.snippet || article.content}
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
              {!article.processed && (
                <button
                  onClick={() => {
                    const id = article.id;
                    onClose();
                    onProcess(id);
                  }}
                  className="flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Bot size={14} /> 1 재료함으로 즉시 정제
                </button>
              )}
              <button 
                onClick={() => onClose()} 
                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 px-4 py-2 rounded-lg text-xs font-semibold transition shadow-2xs cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}
