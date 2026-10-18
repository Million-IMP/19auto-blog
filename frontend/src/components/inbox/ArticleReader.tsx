import { useEffect, useState } from 'react';
import axios from 'axios';
import { Bot, RotateCcw, Rss, X, ExternalLink, Copy, BookOpen, Sparkles, Clock, Sun, Moon, FileText, CheckCheck } from 'lucide-react';
import type { ParsedInboxItem } from './parseRssItem';
import { getSiteTheme } from '../layout/siteTheme';

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
const [readerTheme, setReaderTheme] = useState<'light' | 'paper' | 'dark'>(getSiteTheme);
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
    // 응답 길이 제한에서 잘린 경우처럼 서버가 원인을 보내면 그대로 보여준다.
    const reason = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
    alert(reason ? `AI 요약 생성 중 오류가 발생했습니다: ${reason}` : 'AI 요약 생성 중 오류가 발생했습니다.');
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
        className="fixed inset-0 bg-scrim backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
      >
        <div 
          onClick={(e) => e.stopPropagation()} 
          className={`rounded-card shadow-pop max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border transition-colors duration-200 animate-in zoom-in-95 duration-150 ${
            `theme-${readerTheme}`
          } bg-surface text-ink border-line`}
        >
          {/* 1. 최상단 실시간 독서 진행률 게이지 바 (Reading Progress Bar) */}
          <div className="w-full bg-surface-3 h-1 relative overflow-hidden shrink-0">
            <div 
              className="h-full bg-accent transition-all duration-75 ease-out" 
              style={{ width: `${scrollProgress}%` }}
            />
          </div>

          {/* 2. 상단 에디토리얼 도구 모음 헤더 */}
          <div className={`px-5 py-3 border-b flex items-center justify-between gap-3 shrink-0 ${
            'bg-surface-2 border-line text-ink-2'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen size={16} className="text-accent shrink-0" />
              <span className="font-bold text-xs truncate">
                {article.parsed?.isRss ? `[${article.parsed.channel}] 에디토리얼 리더 뷰` : '수집 항목 리더 뷰'}
              </span>
              {article.parsed?.readingTime && (
                <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-ink-3 bg-surface border border-line px-2 py-0.5 rounded-full">
                  <Clock size={10} /> 약 {scrapedData?.readingTimeMinutes || article.parsed.readingTime}분 분량
                </span>
              )}
            </div>

            {/* 뷰어 도구 컨트롤 (테마, 폰트 크기, 복사, 새창, 닫기) */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* 리더 테마 스위처 */}
              <div className="flex items-center bg-surface border border-line rounded-control p-0.5 text-xs">
                <button
                  onClick={() => setReaderTheme('light')}
                  aria-pressed={readerTheme === 'light'}
                  className={`px-2 py-1 rounded-control text-xs font-bold transition flex items-center gap-1 ${readerTheme === 'light' ? 'bg-accent text-accent-ink' : 'text-ink-3 hover:text-ink'}`}
                  title="라이트 모드"
                >
                  <Sun size={12} />
                </button>
                <button
                  onClick={() => setReaderTheme('paper')}
                  aria-pressed={readerTheme === 'paper'}
                  className={`px-2 py-1 rounded-control text-xs font-bold transition flex items-center gap-1 ${readerTheme === 'paper' ? 'bg-accent text-accent-ink' : 'text-ink-3 hover:text-ink'}`}
                  title="페이퍼 모드 (눈 편한 세피아)"
                >
                  📜
                </button>
                <button
                  onClick={() => setReaderTheme('dark')}
                  aria-pressed={readerTheme === 'dark'}
                  className={`px-2 py-1 rounded-control text-xs font-bold transition flex items-center gap-1 ${readerTheme === 'dark' ? 'bg-accent text-accent-ink' : 'text-ink-3 hover:text-ink'}`}
                  title="다크 모드"
                >
                  <Moon size={12} />
                </button>
              </div>

              {/* 폰트 크기 조절 */}
              <div className="flex items-center bg-surface border border-line rounded-control p-0.5 text-xs font-bold text-ink-2">
                <button 
                  onClick={() => setFontSize('sm')} 
                  className={`px-2 py-1 rounded-control text-xs ${fontSize === 'sm' ? 'bg-surface-3 text-accent' : ''}`}
                  title="작은 글씨"
                >
                  A-
                </button>
                <button 
                  onClick={() => setFontSize('base')} 
                  className={`px-2 py-1 rounded-control text-xs ${fontSize === 'base' ? 'bg-surface-3 text-accent' : ''}`}
                  title="보통 글씨"
                >
                  A
                </button>
                <button 
                  onClick={() => setFontSize('lg')} 
                  className={`px-2 py-1 rounded-control text-xs ${fontSize === 'lg' ? 'bg-surface-3 text-accent' : ''}`}
                  title="큰 글씨"
                >
                  A+
                </button>
              </div>

              {/* 원문 링크 복사 */}
              {article.parsed?.link && (
                <button
                  onClick={() => handleCopyLink(article.parsed.link)}
                  className="bg-surface border border-line text-ink-2 px-2 py-1 rounded-control text-xs font-semibold hover:bg-surface-2 transition flex items-center gap-1 cursor-pointer"
                  title="원문 링크 복사"
                >
                  {copiedLink ? <CheckCheck size={13} className="text-published" /> : <Copy size={13} />}
                  <span className="hidden md:inline">{copiedLink ? '복사됨!' : '복사'}</span>
                </button>
              )}

              {/* 외부 새창 열기 */}
              {article.parsed?.link && (
                <a
                  href={article.parsed.link}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-surface border border-line text-ink-2 p-1.5 rounded-control hover:bg-surface-2 transition"
                  title="원문 웹페이지 새 탭으로 열기"
                >
                  <ExternalLink size={13} />
                </a>
              )}

              {/* 닫기 버튼 */}
              <button 
                onClick={() => onClose()} 
                className="text-ink-3 hover:text-ink-2 p-1.5 rounded-control hover:bg-surface-3 transition cursor-pointer"
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
              <div className="rounded-card overflow-hidden max-h-64 border border-line relative group">
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
                <span className="font-bold text-accent bg-accent/10 border border-accent/40 px-2 py-0.5 rounded-control">
                  {scrapedData?.siteName || article.parsed?.channel || '웹 수집'}
                </span>
                {scrapedData?.author && (
                  <span className="text-ink-3 font-medium">by {scrapedData.author}</span>
                )}
                <span className="text-ink-3 font-mono text-xs">
                  수집 일시: {new Date(article.createdAt).toLocaleString()}
                </span>
                {scrapedData?.charCount ? (
                  <span className="text-ink-3 text-xs font-mono">
                    • {scrapedData.charCount.toLocaleString()}자 (~{scrapedData.readingTimeMinutes}분 독서)
                  </span>
                ) : null}
              </div>

              <h1 className="text-xl sm:text-2xl font-black leading-tight tracking-tight">
                {scrapedData?.title || (article.parsed?.isRss ? article.parsed.title : '수집 항목')}
              </h1>
            </div>

            {/* AI 실시간 3줄 요약 & 블로그 기획 패널 */}
            <div className={`p-4.5 rounded-card border transition-all ${
              'bg-info/10 border-info/40'
            }`}>
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-info animate-pulse" />
                  <h3 className="font-black text-xs sm:text-sm text-info tracking-tight">
                    AI 실시간 에디토리얼 어시스턴트
                  </h3>
                </div>
            
                {!aiSummary && (
                  <button
                    onClick={handleQuickSummary}
                    disabled={isSummarizing}
                    className="bg-accent hover:bg-accent-strong text-accent-ink px-3 py-1.5 rounded-control text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
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
                    <h4 className="text-xs font-bold uppercase tracking-wider text-info mb-1.5">
                      💡 핵심 요약 (Key Insights)
                    </h4>
                    <ul className="space-y-1.5">
                      {aiSummary.bullets.map((b, i) => (
                        <li key={i} className="text-xs leading-relaxed flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-info mt-1.5 shrink-0" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-2 border-t border-info/40">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-info mb-1">
                      🎯 블로그 작성 착안점 (Why It Matters)
                    </h4>
                    <p className="text-xs leading-relaxed font-medium">
                      {aiSummary.takeaway}
                    </p>
                  </div>

                  {aiSummary.keywords.length > 0 && (
                    <div className="pt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-ink-3">추천 키워드 태그:</span>
                      {aiSummary.keywords.map((kw, i) => (
                        <span key={i} className="text-xs font-semibold bg-surface border border-info/40 text-info px-2 py-0.5 rounded-control">
                          #{kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-ink-3 leading-relaxed">
                  상단 버튼을 누르면 AI가 본문 전체를 분석하여 <strong>3줄 핵심 요약</strong>, <strong>블로그 글감 착안점</strong>, <strong>추천 키워드 태그</strong>를 즉석에서 도출합니다.
                </p>
              )}
            </div>

            {/* 탭 전환: [원문 전체 본문 스크래핑] vs [RSS 요약본] */}
            <div className="flex border-b border-line">
              <button
                onClick={() => setContentTab('full')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                  contentTab === 'full' 
                    ? 'border-accent text-accent' 
                    : 'border-transparent text-ink-3 hover:text-ink-2'
                }`}
              >
                <FileText size={14} /> 원문 전체 본문 {isScraping && '(가져오는 중...)'}
              </button>
              <button
                onClick={() => setContentTab('snippet')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                  contentTab === 'snippet' 
                    ? 'border-accent text-accent' 
                    : 'border-transparent text-ink-3 hover:text-ink-2'
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
                    <div className="h-4 bg-surface-3 rounded-control w-3/4"></div>
                    <div className="h-4 bg-surface-3 rounded-control w-full"></div>
                    <div className="h-4 bg-surface-3 rounded-control w-5/6"></div>
                    <div className="h-4 bg-surface-3 rounded-control w-2/3"></div>
                    <div className="py-2 text-center text-xs text-ink-3 font-mono">
                      🌐 웹페이지 원문 전체 텍스트를 정밀 파싱하고 있습니다...
                    </div>
                  </div>
                ) : scrapedData?.fullText ? (
                  <div className="whitespace-pre-wrap leading-relaxed space-y-4">
                    {scrapedData.fullText}
                  </div>
                ) : (
                  <div className="p-4 bg-draft/10 border border-draft/40 rounded-control text-xs text-draft space-y-2">
                    <p className="font-bold">웹사이트 원문 전체 스크래핑 안내</p>
                    <p>해당 웹페이지의 방화벽/봇 차단 정책으로 인해 본문 전체를 긁어오지 못했습니다. 아래의 RSS 요약본을 확인해 주세요.</p>
                    <div className="pt-2 text-ink-2 whitespace-pre-wrap">
                      {article.parsed?.snippet || article.content}
                    </div>
                  </div>
                )
              ) : (
                <div className="whitespace-pre-wrap leading-relaxed p-4 bg-surface-2 rounded-control border border-line">
                  {article.parsed?.snippet || article.content}
                </div>
              )}
            </div>
          </div>

          {/* 4. 하단 플로팅 액션 도크 */}
          <div className={`px-6 py-4 border-t flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0 ${
            readerTheme === 'dark' ? 'bg-canvas border-line' : 'bg-surface-2 border-line'
          }`}>
            <span className="text-xs text-ink-3 flex items-center gap-1.5">
              <span>💡 단축키 <kbd className="px-1.5 py-0.5 bg-surface-3 text-ink-2 rounded-control font-mono text-xs">ESC</kbd> 또는 바깥 여백을 클릭해도 닫힙니다.</span>
            </span>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {!article.processed && (
                <button
                  onClick={() => {
                    const id = article.id;
                    onClose();
                    onProcess(id);
                  }}
                  className="flex-1 sm:flex-initial bg-accent hover:bg-accent-strong text-accent-ink px-4 py-2 rounded-control text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Bot size={14} /> 재료로 정제
                </button>
              )}
              <button 
                onClick={() => onClose()} 
                className="bg-surface border border-line-strong text-ink-2 hover:bg-surface-2 px-4 py-2 rounded-control text-xs font-semibold transition cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}
