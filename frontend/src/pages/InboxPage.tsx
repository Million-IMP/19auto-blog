import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Send, Bot, Trash2, RotateCcw, Rss, Globe, Eye, Sparkles, Clock, Lightbulb } from 'lucide-react';
import { ArticleReader, type ReaderArticle } from '../components/inbox/ArticleReader';
import { RssChannelModal } from '../components/inbox/RssChannelModal';
import { parseRssItem } from '../components/inbox/parseRssItem';
import { useRssChannels } from '../components/inbox/useRssChannels';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, Notice, Page, PageHeader, Segmented, StatusBadge, Textarea } from '../components/ui';

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
      const categoryName = normalized === 'MATERIAL' ? '재료 베이스' : '규칙 (프롬프트)';
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
    <Page>
      <PageHeader
        step="01"
        title="수집함"
        description="RSS로 자동으로 모인 글과 직접 붙여넣은 URL·아이디어가 쌓입니다. 쓸 만한 글은 글감으로 평가하거나 재료로 정제합니다."
        actions={
          <>
            <Button icon={<Rss size={15} />} onClick={() => setShowRssModal(true)}>
              RSS 채널 관리 ({rss.rssFeeds.length})
            </Button>
            <Button
              variant="primary"
              icon={<Bot size={16} />}
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
            >
              지금 RSS 수집
            </Button>
          </>
        }
      />

      {/* 봇 활동 한 줄 */}
      <Card className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm text-ink-2">
        <span className="min-w-0 flex-1">
          <b className="text-ink">자동 수집</b>{' '}
          {logs.length > 0
            ? <>{new Date(logs[0].createdAt).toLocaleString()} · {logs[0].message.split('\n')[0]}</>
            : '아직 기록된 봇 활동이 없습니다.'}
          <span className="block text-xs text-ink-3 mt-0.5">초안까지 잇는 자동 작성은 대시보드에서 켜고 끕니다.</span>
        </span>
        <button onClick={fetchLogs} className="text-xs text-ink-2 hover:text-ink font-medium flex items-center gap-1"><RotateCcw size={12}/> 갱신</button>
        <Link to="/activity" className="text-xs text-accent hover:text-accent-strong font-medium">전체 기록 →</Link>
      </Card>

      <Card className="mb-section">
        <CardHeader title={<><Send size={15} className="text-accent"/> 빠른 수집</>} description="URL이나 떠오른 아이디어를 붙여넣으세요. Ctrl+Enter로 바로 저장합니다." />
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="https://… 또는 쓰고 싶은 내용"
            rows={2}
            className="flex-1 min-h-[44px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) handleSubmit(e);
            }}
          />
          <div className="flex gap-2 sm:flex-col">
            <Button type="submit" variant="primary" className="flex-1 sm:flex-none">저장하기</Button>
            <Button variant="ghost" size="sm" onClick={() => setContent('')} className="flex-1 sm:flex-none">지우기</Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title={<>{showProcessed ? '처리된 수집 항목' : '대기 중인 수집 항목'} <span className="text-ink-3 tabular-nums">{visibleItems.length}</span></>}
          action={
            <Segmented
              options={[{ value: 'waiting', label: '대기' }, { value: 'processed', label: '처리됨' }]}
              value={showProcessed ? 'processed' : 'waiting'}
              onChange={(v) => setShowProcessed(v === 'processed')}
            />
          }
        />

        <div className="divide-y divide-line">
          {listError ? (
            <Notice tone="danger" className="m-4">{listError}</Notice>
          ) : visibleItems.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={<Rss size={28} />}
              title={showProcessed ? '처리된 항목이 없습니다.' : '처리할 수집 항목이 없습니다.'}
              description={showProcessed ? '글감 평가나 AI 정제를 마친 항목이 여기에 모입니다.' : 'RSS 채널을 추가하거나 위 빠른 수집 칸에 URL을 붙여넣어 보세요.'}
              action={!showProcessed && <Button size="sm" icon={<Rss size={14} />} onClick={() => setShowRssModal(true)}>RSS 채널 추가</Button>}
            />
          ) : (
            Object.entries(
              visibleItems.reduce((acc: any, item: any) => {
                const date = new Date(item.createdAt);
                const key = date.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                if (!acc[key]) acc[key] = [];
                acc[key].push(item);
                return acc;
              }, {})
            ).map(([time, groupItems]: [string, any]) => (
              <div key={time} className="[&:last-child>div:last-child>div:last-child]:rounded-b-card">
                {/* 시간대 헤더 */}
                <div className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur px-4 py-2 border-b border-line flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-2 tabular-nums">{time} 수집</span>
                  <span className="text-ink-3">{groupItems.length}건</span>
                </div>

                {/* 해당 시간대 기사 목록 */}
                <div className="divide-y divide-line">
                  {groupItems.map((item: any, idx: number) => {
                    const parsed = parseRssItem(item.content);

                    return (
                      <div 
                        key={item.id} 
                        className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 transition-colors group border-l-2 border-l-transparent hover:bg-surface-2 hover:border-l-accent"
                      >
                        <div className="flex-1 min-w-0 flex items-start gap-3">
                          <span className="pt-0.5 text-xs font-mono text-ink-3 tabular-nums shrink-0 w-6 text-right">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            {parsed.isRss ? (
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge>{parsed.channel}</Badge>
                                  {item.processed && <StatusBadge status="PROCESSED" />}

                                  {/* 링크 배지 및 고급 리치 프리뷰 팝오버 */}
                                  {parsed.link && (
                                    <div className="relative inline-flex items-center group/preview">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setActiveArticle({ ...item, parsed }); }}
                                        className="inline-flex items-center gap-1.5 px-2 py-0.5 text-ink-2 hover:text-accent border border-line rounded-control text-xs font-semibold transition-all cursor-pointer group-hover/preview:border-accent/40"
                                      >
                                        {parsed.domain ? (
                                          <img 
                                            src={`https://www.google.com/s2/favicons?domain=${parsed.domain}&sz=32`} 
                                            alt="" 
                                            className="w-3.5 h-3.5 rounded-control"
                                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                          />
                                        ) : (
                                          <Globe size={13} className="text-accent" />
                                        )}
                                        <span className="truncate max-w-[160px] sm:max-w-[280px] font-mono">{parsed.domain || parsed.link}</span>
                                        <Eye size={12} />
                                      </button>
                                      
                                      {/* 고급 리치 프리뷰 팝오버 (슬랙/트위터 스타일 카드) */}
                                      <div className="absolute left-0 bottom-full mb-2.5 hidden group-hover/preview:flex flex-col bg-surface-3 backdrop-blur-md text-ink text-xs p-3.5 rounded-card shadow-pop z-40 min-w-[300px] max-w-[380px] pointer-events-none border border-line animate-in fade-in zoom-in-95 duration-150">
                                        <div className="flex items-center justify-between gap-2 border-b border-line pb-2 mb-2">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            {parsed.domain && (
                                              <img 
                                                src={`https://www.google.com/s2/favicons?domain=${parsed.domain}&sz=32`} 
                                                alt="" 
                                                className="w-4 h-4 rounded-control shrink-0" 
                                              />
                                            )}
                                            <span className="text-xs font-bold text-ink-3 truncate">{parsed.domain || '원문 출처'}</span>
                                          </div>
                                          <span className="text-xs font-semibold text-published bg-published/10 border border-published/40 px-1.5 py-0.5 rounded-control flex items-center gap-1 shrink-0">
                                            <Clock size={10} /> 약 {parsed.readingTime}분 분량
                                          </span>
                                        </div>

                                        <p className="font-bold text-ink text-xs line-clamp-1 mb-1">
                                          {parsed.title}
                                        </p>
                                        <p className="text-ink-3 text-xs line-clamp-2 leading-relaxed">
                                          {parsed.snippet}
                                        </p>

                                        <div className="mt-2.5 pt-2 border-t border-line flex items-center justify-between text-xs text-ink-3">
                                          <span className="text-accent font-medium flex items-center gap-1">
                                            <Sparkles size={11} className="text-accent animate-pulse" /> 클릭 시 스마트 리더로 전체 열람
                                          </span>
                                          <span className="font-mono text-ink-3">ESC 닫기</span>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* 기사 제목 (클릭 시 화면 내 에디토리얼 리더 열림) */}
                                <h4 
                                  onClick={() => setActiveArticle({ ...item, parsed })}
                                  className="text-sm font-bold text-ink hover:text-accent transition cursor-pointer flex items-center gap-1.5 pt-0.5"
                                  title="클릭하여 스마트 리더로 전체 기사 보기"
                                >
                                  {parsed.title}
                                  <Eye size={13} className="text-ink-3 opacity-0 group-hover:opacity-100 transition shrink-0" />
                                </h4>

                                {/* 기사 요약 미리보기 */}
                                <p 
                                  onClick={() => setActiveArticle({ ...item, parsed })}
                                  className="text-ink-2 text-xs leading-relaxed line-clamp-2 cursor-pointer hover:text-ink transition"
                                  title="클릭하여 스마트 리더로 전체 기사 보기"
                                >
                                  {parsed.snippet}
                                </p>
                              </div>
                            ) : (
                              <div>
                                {item.processed && <StatusBadge status="PROCESSED" className="mb-1" />}
                                <p
                                  onClick={() => setActiveArticle({ ...item, parsed })}
                                  className="text-ink text-sm whitespace-pre-wrap leading-relaxed cursor-pointer hover:text-accent transition"
                                  title="클릭하여 전체 보기"
                                >
                                  {item.content}
                                </p>
                              </div>
                            )}
                            {item.autoError && !item.processed && (
                              <p className="mt-2 text-xs leading-relaxed text-danger">자동 작성 실패: {item.autoError}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-end md:self-center">
                          {!item.processed && item.autoError && (
                            <Button size="sm" onClick={() => handleRetryAuto(item.id)}>다시 자동 시도</Button>
                          )}
                          {!item.processed && (
                            <Button
                              size="sm"
                              variant="primary"
                              icon={<Lightbulb size={14} />}
                              onClick={() => handleEvaluateTopic(item.id)}
                              disabled={loadingId === item.id}
                              title="독자 질문·의도·빈틈·다음 행동으로 평가해 글감 보드에 올립니다"
                            >
                              글감 평가
                            </Button>
                          )}
                          {!item.processed && (
                            <Button size="sm" icon={<Bot size={14} />} onClick={() => handleProcess(item.id)} disabled={loadingId === item.id}>
                              {loadingId === item.id ? '처리 중...' : '재료로 정제'}
                            </Button>
                          )}
                          <IconButton title="삭제" onClick={() => handleDelete(item.id)} variant="ghostDanger">
                            <Trash2 size={15} />
                          </IconButton>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            ))
          )}
        </div>
      </Card>

      <ArticleReader article={activeArticle} onClose={closeReader} onProcess={handleProcess} />

      {showRssModal && <RssChannelModal channels={rss} onClose={() => setShowRssModal(false)} />}
    </Page>
  );
}
