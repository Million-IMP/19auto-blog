import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Lightbulb, Search, Check, X, PenTool, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, IconButton, Notice, Page, PageHeader, Segmented, buttonClass, cardClass, cn, type BadgeTone } from '../components/ui';

type Evidence = { label: string; source: string; checkedAt: string; basis: string; kind: 'MEASURED' | 'OBSERVED' | 'HYPOTHESIS' | 'UNVERIFIED' };
type TopicCard = {
  id: number;
  inboxId: number | null;
  keyword: string;
  topic: string;
  intent: string;
  journey: string;
  question: string;
  why: string;
  gap: string;
  myValue: string;
  nextStep: string;
  status: string;
  evidence: string;
  relatedPostId: number | null;
  postId: number | null;
  createdAt: string;
};
type InboxItem = { id: number; content: string; processed: boolean };

// 근거 종류: 측정값만 초록, 추정은 노랑, 확인 안 된 것은 회색
const KIND: Record<string, { label: string; tone: BadgeTone }> = {
  MEASURED: { label: '측정값', tone: 'published' },
  OBSERVED: { label: '직접 관찰', tone: 'info' },
  HYPOTHESIS: { label: '분석 가설', tone: 'draft' },
  UNVERIFIED: { label: '확인 필요', tone: 'neutral' },
};

const NEXT_STEP: Record<string, string> = { NEW_POST: '새 글 쓰기', IMPROVE: '기존 글 보강', RESEARCH: '자료 추가 조사' };
const JOURNEY = ['문제인식', '탐색', '비교', '행동'];
const TABS = [
  { value: 'CANDIDATE', label: '후보' },
  { value: 'SELECTED', label: '선택함' },
  { value: 'DISMISSED', label: '제외' },
] as const;

function readEvidence(raw: string): Evidence[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function inboxTitle(content: string) {
  return content.match(/Title: (.+)/)?.[1] || content.split('\n')[0].slice(0, 80);
}

function errorMessage(e: unknown, fallback: string) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}

function TopicCardView({ card, busy, onStatus, onDraft }: { card: TopicCard; busy: boolean; onStatus: (status: string) => void; onDraft: () => void }) {
  const [open, setOpen] = useState(false);
  const evidence = readEvidence(card.evidence);
  const step = JOURNEY.indexOf(card.journey);

  return (
    <article className={cn(cardClass, 'p-4 flex flex-col gap-3 min-w-0')}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-ink-3 truncate">{card.topic || '주제 미분류'}</span>
        <Badge tone="accent">{NEXT_STEP[card.nextStep] || card.nextStep}</Badge>
      </div>

      <div>
        <h3 className="text-base font-bold text-ink leading-snug">{card.keyword}</h3>
        <p className="text-sm text-ink-2 mt-1">“{card.question || '독자 질문 확인 필요'}”</p>
      </div>

      {/* 추천 이유 */}
      <p className="text-sm text-ink-2"><b className="text-ink">왜 쓸 만한가</b> {card.why || '확인 필요'}</p>

      {/* 독자 질문 흐름 */}
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="text-ink-3 mr-1">{card.intent || '의도 확인 필요'} ·</span>
        {JOURNEY.map((j, i) => (
          <span key={j} className={`px-1.5 py-0.5 rounded-control border ${i === step ? 'bg-accent/10 text-accent border-accent/40 font-semibold' : 'text-ink-3 border-line'}`}>{j}</span>
        ))}
      </div>

      {/* 근거와 빈틈 */}
      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-ink-3">답의 빈틈</dt><dd className="text-ink-2">{card.gap || '확인 필요'}</dd>
        <dt className="text-ink-3">내가 더할 것</dt><dd className="text-ink-2">{card.myValue || '확인 필요'}</dd>
        {card.relatedPostId && (<><dt className="text-ink-3">겹치는 내 글</dt><dd><Link to="/posts" className="text-accent hover:underline">#{card.relatedPostId} 보기</Link></dd></>)}
      </dl>

      <div className="border-t border-line pt-2">
        <button onClick={() => setOpen(!open)} className="text-xs font-semibold text-ink-2 flex items-center gap-1 hover:text-ink">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} 근거와 확인일 ({evidence.length})
        </button>
        {open && (
          <ul className="mt-2 space-y-2">
            {evidence.map((e, i) => (
              <li key={i} className="text-xs">
                <Badge tone={(KIND[e.kind] || KIND.UNVERIFIED).tone} className="mr-1.5">{KIND[e.kind]?.label || e.kind}</Badge>
                <b className="text-ink-2">{e.label}</b>{' · '}
                {/^https?:\/\//.test(e.source) ? <a href={e.source} target="_blank" rel="noreferrer" className="text-accent hover:underline">출처 열기 ↗</a> : <span className="text-ink-2">{e.source}</span>}
                <span className="block text-ink-3 mt-0.5">{e.checkedAt} · {e.basis}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 다음 행동 */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {card.postId ? (
          <ButtonLink to="/posts" size="sm" variant="secondary">초안 #{card.postId} 보기</ButtonLink>
        ) : (
          <Button size="sm" variant="primary" icon={<PenTool size={13} />} onClick={onDraft} disabled={busy}>
            {busy ? '초안 작성 중...' : '이 글감으로 초안'}
          </Button>
        )}
        <a href={`https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(card.keyword)}`} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'sm')}>
          <Search size={13} /> 네이버 검색
        </a>
        <div className="ml-auto flex gap-1">
          {card.status !== 'SELECTED' && (
            <IconButton title="선택" onClick={() => onStatus('SELECTED')} disabled={busy}><Check size={15} /></IconButton>
          )}
          {card.status !== 'DISMISSED' && (
            <IconButton title="제외" onClick={() => onStatus('DISMISSED')} disabled={busy} variant="ghostDanger"><X size={15} /></IconButton>
          )}
          {card.status !== 'CANDIDATE' && (
            <Button size="sm" variant="ghost" onClick={() => onStatus('CANDIDATE')} disabled={busy}>후보로</Button>
          )}
        </div>
      </div>
    </article>
  );
}

export function TopicsPage() {
  const [tab, setTab] = useState<string>('CANDIDATE');
  const [cards, setCards] = useState<TopicCard[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [evaluating, setEvaluating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const loadCards = (status = tab) => {
    axios.get(`/api/topics?status=${status}`).then((res) => setCards(res.data)).catch((e) => setMessage(errorMessage(e, '글감 카드를 불러오지 못했습니다.')));
  };

  const loadInbox = () => {
    axios.get('/api/inbox').then((res) => setInbox(res.data.filter((i: InboxItem) => !i.processed).slice(0, 30))).catch(() => undefined);
  };

  useEffect(() => {
    loadCards(tab);
  }, [tab]);

  useEffect(() => {
    loadInbox();
  }, []);

  const togglePick = (id: number) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : prev.length >= 5 ? prev : [...prev, id]));
  };

  const handleEvaluate = async () => {
    if (picked.length === 0) return;
    setEvaluating(true);
    setMessage(`${picked.length}건을 평가하는 중입니다. 건당 AI 호출 1회.`);
    try {
      const res = await axios.post('/api/topics/evaluate', { inboxIds: picked });
      setMessage(`카드 ${res.data.cards.length}건 생성.${res.data.errors.length ? ` 실패: ${res.data.errors.join(' / ')}` : ''}`);
      setPicked([]);
      setTab('CANDIDATE');
      loadCards('CANDIDATE');
    } catch (e) {
      setMessage(errorMessage(e, '평가 중 오류가 발생했습니다.'));
    }
    setEvaluating(false);
  };

  const handleStatus = async (id: number, status: string) => {
    setBusyId(id);
    try {
      await axios.put(`/api/topics/${id}`, { status });
      loadCards();
    } catch (e) {
      setMessage(errorMessage(e, '상태를 바꾸지 못했습니다.'));
    }
    setBusyId(null);
  };

  const handleDraft = async (id: number) => {
    setBusyId(id);
    setMessage('초안을 단계별로 작성하는 중입니다. 1분 안팎 걸립니다.');
    try {
      const res = await axios.post(`/api/topics/${id}/draft`);
      setMessage(res.data.stageError ? `초안이 멈췄습니다: ${res.data.stageError} (발행 대기열에서 이어하기)` : `초안 "${res.data.title}" 완성. 발행 대기열에서 확인하세요.`);
      loadCards();
      loadInbox();
    } catch (e) {
      setMessage(errorMessage(e, '초안을 만들지 못했습니다.'));
    }
    setBusyId(null);
  };

  const emptyText: Record<string, { title: string; description: string }> = {
    CANDIDATE: { title: '평가를 기다리는 글감이 없습니다.', description: '위 목록에서 쓸 만한 수집 글을 골라 "평가"를 누르면 글감 카드가 생깁니다.' },
    SELECTED: { title: '아직 고른 글감이 없습니다.', description: '후보 카드에서 체크(✓)를 누르면 여기로 옮겨집니다.' },
    DISMISSED: { title: '제외한 글감이 없습니다.', description: '후보 카드에서 X를 누르면 여기로 옮겨집니다.' },
  };

  return (
    <Page>
      <PageHeader
        step="02"
        title="글감 보드"
        description="수집한 글을 &quot;누구의 어떤 질문인지, 왜 쓸 만한지, 다음에 무엇을 할지&quot;로 평가해 쓸 글을 고릅니다."
      />

      <Notice tone="draft" className="mb-4">
        다음 행동은 작업 우선순위일 뿐, 검색량·경쟁도·순위를 뜻하지 않습니다. 측정 도구를 연결하지 않았으므로 검색 수요는 항상 "확인 필요"로 표시합니다.
      </Notice>

      <Card className="mb-section">
        <CardHeader
          title={<>수집함에서 평가할 항목 고르기 <span className="font-normal text-ink-3">최대 5건 · 건당 AI 호출 1회</span></>}
          action={
            <Button variant="primary" size="sm" icon={<Lightbulb size={14} />} onClick={handleEvaluate} disabled={evaluating || picked.length === 0}>
              {evaluating ? '평가 중...' : `${picked.length}건 평가`}
            </Button>
          }
        />
        <CardBody>
          {inbox.length === 0 ? (
            <p className="text-sm text-ink-3">처리하지 않은 수집 항목이 없습니다. <Link to="/inbox" className="text-accent hover:text-accent-strong">수집함에서 글을 모아 보세요 →</Link></p>
          ) : (
            <ul className="max-h-56 overflow-y-auto divide-y divide-line text-sm">
              {inbox.map((item) => (
                <li key={item.id}>
                  <label className="flex items-center gap-2.5 py-2 cursor-pointer hover:text-ink">
                    <input type="checkbox" checked={picked.includes(item.id)} onChange={() => togglePick(item.id)} />
                    <span className={cn('truncate', picked.includes(item.id) ? 'text-ink' : 'text-ink-2')}>{inboxTitle(item.content)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {message && <Notice tone="info" className="mt-3">{message}</Notice>}
        </CardBody>
      </Card>

      <Segmented options={TABS} value={tab as (typeof TABS)[number]['value']} onChange={setTab} className="mb-4" />

      {cards.length === 0 ? (
        <EmptyState icon={<Lightbulb size={28} />} title={emptyText[tab]?.title} description={emptyText[tab]?.description} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cards.map((card) => (
            <TopicCardView key={card.id} card={card} busy={busyId === card.id} onStatus={(s) => handleStatus(card.id, s)} onDraft={() => handleDraft(card.id)} />
          ))}
        </div>
      )}
    </Page>
  );
}
