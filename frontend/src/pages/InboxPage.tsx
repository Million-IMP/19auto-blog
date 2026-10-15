import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Send, Bot, Trash2, RotateCcw, Rss, Globe, Eye, Sparkles, Clock, Lightbulb } from 'lucide-react';
import { ArticleReader, type ReaderArticle } from '../components/inbox/ArticleReader';
import { RssChannelModal } from '../components/inbox/RssChannelModal';
import { parseRssItem } from '../components/inbox/parseRssItem';
import { useRssChannels } from '../components/inbox/useRssChannels';

const API_URL = '/api';

function apiErrorMessage(error: unknown, fallback: string) {
  const body = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return body || fallback;
}

export function InboxPage() {
  const [items, setItems] = useState<any[]>([]);
  const [showProcessed, setShowProcessed] = useState(false);
  const [listError, setListError] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const [showRssModal, setShowRssModal] = useState(false);
  const rss = useRssChannels(showRssModal);
  const [activeArticle, setActiveArticle] = useState<ReaderArticle | null>(null);
  const closeReader = useCallback(() => setActiveArticle(null), []);

  useEffect(() => {
    fetchInbox();
    fetchLogs();
  }, []);

  const fetchInbox = async () => {
    try {
      const res = await axios.get(`${API_URL}/inbox`);
      setItems(res.data);
      setListError('');
    } catch (e) {
      setListError(apiErrorMessage(e, '수집함을 불러오지 못했습니다.'));
    }
  };

  const visibleItems = items.filter((item) => (showProcessed ? item.processed : !item.processed));

  const fetchLogs = async () => {
    try {
      const res = await axios.get(`${API_URL}/system-logs`);
      setLogs(res.data);
    } catch (e) {
      console.error(e);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      await axios.post(`${API_URL}/inbox`, { content, type: 'TEXT' });
      setContent('');
      fetchInbox();
    } catch (e) {
      alert(apiErrorMessage(e, '저장 중 오류가 발생했습니다.'));
    }
  };

  const handleProcess = async (id: number) => {
    setLoadingId(id);
    try {
      const res = await axios.post(`${API_URL}/inbox/${id}/process`);
      const { category, data } = res.data;
      fetchInbox(); // Refresh list after successful processing

      const normalized = String(category || '').toUpperCase();
      const categoryName = normalized === 'MATERIAL' ? '1 재료 베이스' : '2 규칙 (프롬프트)';
      const targetPath = normalized === 'MATERIAL' ? '/materials' : '/rules';

      if (confirm(`🎉 AI 정제가 완료되었습니다!\n\n• 분류: [${categoryName}]\n• 생성된 제목: "${data.title}"\n• 키워드: ${data.keyword || '없음'}\n\n해당 메뉴(${categoryName})로 바로 이동하여 확인하시겠습니까?`)) {
        window.location.href = targetPath;
      }
    } catch (e) {
      alert(apiErrorMessage(e, "AI 정제 중 오류가 발생했습니다. 터미널 로그를 확인해주세요."));
    }
    setLoadingId(null);
  };

  const handleEvaluateTopic = async (id: number) => {
    setLoadingId(id);
    try {
      const res = await axios.post(`${API_URL}/topics/evaluate`, { inboxIds: [id] });
      if (res.data.errors?.length) throw new Error(res.data.errors[0]);
      if (confirm(`글감 카드 "${res.data.cards[0]?.keyword}"를 만들었습니다.\n글감 보드로 이동할까요?`)) {
        window.location.href = '/topics';
      }
    } catch (e) {
      alert(apiErrorMessage(e, e instanceof Error ? e.message : '글감 평가 중 오류가 발생했습니다.'));
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

  const handleRetryAuto = async (id: number) => {
    try {
      await axios.post(`${API_URL}/inbox/${id}/auto-retry`);
      fetchInbox();
    } catch (e) {
      alert(apiErrorMessage(e, '다시 시도 표시에 실패했습니다.'));
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
            <Rss size={15} className="text-orange-500" /> RSS 채널 관리 ({rss.rssFeeds.length})
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
                마지막 실행: {new Date(logs[0].createdAt).toLocaleString()} <span className="mx-2 text-slate-300">|</span> <span className="font-medium text-slate-700">{logs[0].message.split('\n')[0]}</span>
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-1">아직 기록된 봇 활동이 없습니다.</p>
            )}
            <p className="text-[11px] text-slate-400 mt-1">글 초안까지 잇는 자동 작성은 대시보드에서 켜고 끕니다.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={fetchLogs} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"><RotateCcw size={12}/> 로그 갱신</button>
          <Link to="/activity" className="text-xs text-slate-600 hover:text-slate-900 font-medium">전체 기록 보기 →</Link>
        </div>
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
          <h3 className="text-sm font-semibold text-slate-700">{showProcessed ? '처리된 수집 항목' : '대기 중인 수집 항목'} ({visibleItems.length})</h3>
          <button
            type="button"
            onClick={() => setShowProcessed((prev) => !prev)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-md border transition ${showProcessed ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
          >
            {showProcessed ? '대기 항목 보기' : '처리됨 보기'}
          </button>
        </div>

        {/* 목록 최상단 구분 컬러 라인 */}
        {visibleItems.length > 0 && (
          <div className="h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-sky-400 shadow-xs" />
        )}

        <div className="divide-y divide-slate-100">
          {listError ? (
            <p className="text-red-600 text-center py-8 text-sm">{listError}</p>
          ) : visibleItems.length === 0 ? (
            <p className="text-slate-500 text-center py-8 text-sm">{showProcessed ? '처리된 항목이 없습니다.' : '처리할 아이템이 없습니다.'}</p>
          ) : (
            Object.entries(
              visibleItems.reduce((acc: any, item: any) => {
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
                                  {item.processed && (
                                    <span className="inline-block px-2 py-0.5 bg-slate-200 text-slate-700 border border-slate-300 text-[10px] font-bold rounded">처리됨</span>
                                  )}

                                  {/* 링크 배지 및 고급 리치 프리뷰 팝오버 */}
                                  {parsed.link && (
                                    <div className="relative inline-flex items-center group/preview">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setActiveArticle({ ...item, parsed }); }}
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
                                  onClick={() => setActiveArticle({ ...item, parsed })}
                                  className="text-sm font-bold text-slate-900 hover:text-blue-600 transition cursor-pointer flex items-center gap-1.5 pt-0.5"
                                  title="클릭하여 스마트 리더로 전체 기사 보기"
                                >
                                  {parsed.title}
                                  <Eye size={13} className="text-slate-400 opacity-0 group-hover:opacity-100 transition shrink-0" />
                                </h4>

                                {/* 기사 요약 미리보기 */}
                                <p 
                                  onClick={() => setActiveArticle({ ...item, parsed })}
                                  className="text-slate-600 text-xs leading-relaxed line-clamp-2 cursor-pointer hover:text-slate-800 transition"
                                  title="클릭하여 스마트 리더로 전체 기사 보기"
                                >
                                  {parsed.snippet}
                                </p>
                              </div>
                            ) : (
                              <div>
                                {item.processed && (
                                  <span className="inline-block mb-1 px-2 py-0.5 bg-slate-200 text-slate-700 border border-slate-300 text-[10px] font-bold rounded">처리됨</span>
                                )}
                                <p
                                  onClick={() => setActiveArticle({ ...item, parsed })}
                                  className="text-slate-800 text-sm whitespace-pre-wrap leading-relaxed cursor-pointer hover:text-blue-600 transition"
                                  title="클릭하여 전체 보기"
                                >
                                  {item.content}
                                </p>
                              </div>
                            )}
                            {item.autoError && !item.processed && (
                              <p className="mt-2 text-[11px] leading-relaxed text-red-600">자동 작성 실패: {item.autoError}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end md:self-center opacity-100 sm:opacity-90 sm:group-hover:opacity-100 transition-opacity">
                          {!item.processed && item.autoError && (
                            <button
                              onClick={() => handleRetryAuto(item.id)}
                              className="bg-white text-slate-700 border border-slate-300 px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-slate-50"
                            >
                              다시 자동 시도
                            </button>
                          )}
                          {!item.processed && (
                            <button
                              onClick={() => handleEvaluateTopic(item.id)}
                              disabled={loadingId === item.id}
                              className="bg-white text-amber-700 border border-amber-200 px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-amber-50 flex items-center gap-1.5 transition disabled:opacity-50"
                              title="독자 질문·의도·빈틈·다음 행동으로 평가해 글감 보드에 올립니다"
                            >
                              <Lightbulb size={14} /> 글감 평가
                            </button>
                          )}
                          {!item.processed && (
                            <button
                              onClick={() => handleProcess(item.id)}
                              disabled={loadingId === item.id}
                              className="bg-white text-blue-600 border border-blue-200 px-3.5 py-1.5 rounded-md text-xs font-semibold hover:bg-blue-600 hover:text-white hover:border-blue-600 shadow-2xs flex items-center gap-1.5 transition disabled:opacity-50"
                            >
                              {loadingId === item.id ? <span className="animate-pulse">처리 중...</span> : <><Bot size={14} /> AI 정제 (재료화)</>}
                            </button>
                          )}
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
        {visibleItems.length > 0 && (
          <div className="h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-sky-400 shadow-xs" />
        )}
      </div>

      <ArticleReader article={activeArticle} onClose={closeReader} onProcess={handleProcess} />

      {showRssModal && <RssChannelModal channels={rss} onClose={() => setShowRssModal(false)} />}
    </div>
  );
}
