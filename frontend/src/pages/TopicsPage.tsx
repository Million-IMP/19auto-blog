import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Lightbulb, Search, Check, X, PenTool, ChevronDown, ChevronRight } from 'lucide-react';

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

const KIND = {
  MEASURED: { label: '측정값', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  OBSERVED: { label: '직접 관찰', style: 'bg-blue-50 text-blue-700 border-blue-200' },
  HYPOTHESIS: { label: '분석 가설', style: 'bg-amber-50 text-amber-700 border-amber-200' },
  UNVERIFIED: { label: '확인 필요', style: 'bg-slate-100 text-slate-600 border-slate-300' },
} as const;

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

function Card({ card, busy, onStatus, onDraft }: { card: TopicCard; busy: boolean; onStatus: (status: string) => void; onDraft: () => void }) {
  const [open, setOpen] = useState(false);
  const evidence = readEvidence(card.evidence);
  const step = JOURNEY.indexOf(card.journey);

  return (
    <article className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-500 truncate">{card.topic || '주제 미분류'}</span>
        <span className="font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 shrink-0">{NEXT_STEP[card.nextStep] || card.nextStep}</span>
      </div>

      <div>
        <h3 className="text-base font-bold text-slate-900 leading-snug">{card.keyword}</h3>
        <p className="text-sm text-slate-700 mt-1">“{card.question || '독자 질문 확인 필요'}”</p>
      </div>

      {/* 추천 이유 */}
      <p className="text-sm text-slate-600"><b className="text-slate-800">왜 쓸 만한가</b> {card.why || '확인 필요'}</p>

      {/* 독자 질문 흐름 */}
      <div className="flex items-center gap-1 text-[11px]">
        <span className="text-slate-500 mr-1">{card.intent || '의도 확인 필요'} ·</span>
        {JOURNEY.map((j, i) => (
          <span key={j} className={`px-1.5 py-0.5 rounded border ${i === step ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'}`}>{j}</span>
        ))}
      </div>

      {/* 근거와 빈틈 */}
      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-slate-400">답의 빈틈</dt><dd className="text-slate-700">{card.gap || '확인 필요'}</dd>
        <dt className="text-slate-400">내가 더할 것</dt><dd className="text-slate-700">{card.myValue || '확인 필요'}</dd>
        {card.relatedPostId && (<><dt className="text-slate-400">겹치는 내 글</dt><dd><Link to="/posts" className="text-blue-600 hover:underline">#{card.relatedPostId} 보기</Link></dd></>)}
      </dl>

      <div className="border-t border-slate-100 pt-2">
        <button onClick={() => setOpen(!open)} className="text-xs font-semibold text-slate-600 flex items-center gap-1 hover:text-slate-900">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} 근거와 확인일 ({evidence.length})
        </button>
        {open && (
          <ul className="mt-2 space-y-2">
            {evidence.map((e, i) => (
              <li key={i} className="text-xs">
                <span className={`inline-block border rounded px-1.5 py-0.5 font-semibold mr-1.5 ${KIND[e.kind]?.style || KIND.UNVERIFIED.style}`}>{KIND[e.kind]?.label || e.kind}</span>
                <b className="text-slate-700">{e.label}</b>{' · '}
                {/^https?:\/\//.test(e.source) ? <a href={e.source} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">출처 열기 ↗</a> : <span className="text-slate-600">{e.source}</span>}
                <span className="block text-slate-500 mt-0.5">{e.checkedAt} · {e.basis}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 다음 행동 */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <a href={`https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(card.keyword)}`} target="_blank" rel="noreferrer" className="text-xs text-slate-600 border border-slate-300 rounded px-2.5 py-1.5 hover:bg-slate-50 flex items-center gap-1">
          <Search size={12} /> 네이버 블로그 검색
        </a>
        {card.postId ? (
          <Link to="/posts" className="text-xs font-semibold text-emerald-700 border border-emerald-300 bg-emerald-50 rounded px-2.5 py-1.5">초안 #{card.postId} 보기</Link>
        ) : (
          <button onClick={onDraft} disabled={busy} className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded px-2.5 py-1.5 flex items-center gap-1 disabled:opacity-50">
            <PenTool size={12} /> {busy ? '초안 작성 중...' : '이 글감으로 초안'}
          </button>
        )}
        <div className="ml-auto flex gap-1">
          {card.status !== 'SELECTED' && (
            <button onClick={() => onStatus('SELECTED')} disabled={busy} title="선택" className="text-emerald-600 border border-slate-200 rounded p-1.5 hover:bg-emerald-50"><Check size={14} /></button>
          )}
          {card.status !== 'DISMISSED' && (
            <button onClick={() => onStatus('DISMISSED')} disabled={busy} title="제외" className="text-slate-400 border border-slate-200 rounded p-1.5 hover:bg-slate-50 hover:text-red-500"><X size={14} /></button>
          )}
          {card.status !== 'CANDIDATE' && (
            <button onClick={() => onStatus('CANDIDATE')} disabled={busy} className="text-xs text-slate-500 border border-slate-200 rounded px-2 hover:bg-slate-50">후보로</button>
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 pb-4 border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2"><Lightbulb size={20} className="text-amber-500" /> 글감 보드</h1>
        <p className="text-sm text-slate-500 mt-1">수집한 글을 "누구의 어떤 질문인지, 왜 쓸 만한지, 다음에 무엇을 할지"로 평가합니다.</p>
      </div>

      <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-5">
        다음 행동은 작업 우선순위일 뿐, 검색량·경쟁도·순위를 뜻하지 않습니다. 측정 도구를 연결하지 않았으므로 검색 수요는 항상 "확인 필요"로 표시합니다.
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-4 mb-6 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-slate-800">수집함에서 평가할 항목 고르기 <span className="font-normal text-slate-500">(최대 5건)</span></h2>
          <button onClick={handleEvaluate} disabled={evaluating || picked.length === 0} className="text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded px-3 py-1.5 disabled:opacity-40">
            {evaluating ? '평가 중...' : `${picked.length}건 평가`}
          </button>
        </div>
        {inbox.length === 0 ? (
          <p className="text-xs text-slate-500">처리하지 않은 수집 항목이 없습니다.</p>
        ) : (
          <ul className="max-h-48 overflow-y-auto divide-y divide-slate-100 text-sm">
            {inbox.map((item) => (
              <li key={item.id}>
                <label className="flex items-center gap-2 py-1.5 cursor-pointer">
                  <input type="checkbox" checked={picked.includes(item.id)} onChange={() => togglePick(item.id)} />
                  <span className="truncate text-slate-700">{inboxTitle(item.content)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {message && <p className="text-xs text-slate-600 mt-3">{message}</p>}
      </section>

      <div className="flex gap-1 mb-4">
        {TABS.map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)} className={`text-xs font-semibold px-3 py-1.5 rounded-md border ${tab === t.value ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {cards.length === 0 ? (
        <div className="text-center text-sm text-slate-400 py-16 border border-dashed border-slate-300 rounded-lg">이 상태의 글감 카드가 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cards.map((card) => (
            <Card key={card.id} card={card} busy={busyId === card.id} onStatus={(s) => handleStatus(card.id, s)} onDraft={() => handleDraft(card.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
