import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Lock, LogOut, MessageSquareHeart, Send, Star, Trash2, X } from 'lucide-react';

type Feedback = { id: number; name: string; rating: number; content: string; createdAt: string };
type FeedbackList = { items: Feedback[]; count: number; average: number | null };

// 한 번 후기를 남긴 사람에게는 배너를 깜빡이지 않는다.
const WROTE_KEY = 'autoblog_feedback_written';

function readWrote() {
  try {
    return localStorage.getItem(WROTE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveWrote() {
  try {
    localStorage.setItem(WROTE_KEY, '1');
  } catch {
    // 저장이 막힌 브라우저에서는 다음에도 배너가 깜빡일 뿐이다.
  }
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`별점 ${value}점`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
      ))}
    </span>
  );
}

// 후기는 누구나 본다. 운영자(APP_PASSWORD 로그인)일 때만 삭제 버튼이 보인다.
function FeedbackList({ refreshKey }: { refreshKey: number }) {
  const [list, setList] = useState<FeedbackList | null>(null);
  const [admin, setAdmin] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch('/api/feedback')
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || '후기를 불러오지 못했습니다.');
        setList(body);
      })
      .catch(() => setList({ items: [], count: 0, average: null }));
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((body) => setAdmin(Boolean(body.admin)))
      .catch(() => setAdmin(false));
  }, []);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || '로그인하지 못했습니다.');
      setPassword('');
      setAdmin(true);
      setLoginOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAdmin(false);
  };

  const remove = async (item: Feedback) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/feedback/${item.id}`, { method: 'DELETE' });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || '삭제하지 못했습니다.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          사용후기 <span className="text-indigo-600">{list?.count ?? 0}</span>개
          {list?.average != null && (
            <span className="ml-2 flex items-center gap-1 text-xs font-normal text-slate-500">
              <Stars value={Math.round(list.average)} size={12} /> 평균 {list.average}점
            </span>
          )}
        </h3>
        {admin ? (
          <button type="button" onClick={logout} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800">
            <LogOut size={12} /> 운영자 로그아웃
          </button>
        ) : (
          <button type="button" onClick={() => setLoginOpen((v) => !v)} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600">
            <Lock size={11} /> 운영자
          </button>
        )}
      </div>

      {loginOpen && !admin && (
        <form onSubmit={login} className="mb-3 flex flex-col sm:flex-row gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="운영자 비밀번호"
            autoComplete="current-password"
            autoFocus
            className="flex-1 p-2 text-sm border border-slate-300 rounded-md bg-slate-50"
          />
          <button type="submit" disabled={busy || !password} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-900 disabled:opacity-50">
            {busy ? '확인 중...' : '확인'}
          </button>
        </form>
      )}

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {!list ? (
        <p className="text-xs text-slate-500">후기를 불러오는 중입니다.</p>
      ) : list.items.length === 0 ? (
        <p className="text-sm text-slate-500">아직 후기가 없습니다. 첫 번째 후기의 주인공이 되어주세요! 🎉</p>
      ) : (
        <ul className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {list.items.map((item) => (
            <li key={item.id} className="border border-slate-100 bg-slate-50 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-slate-800 truncate">{item.name}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <Stars value={item.rating} size={12} />
                  {admin && (
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      disabled={busy}
                      className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                      aria-label="후기 삭제"
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap break-words leading-relaxed">{item.content}</p>
              <p className="text-[11px] text-slate-400 mt-1.5">{new Date(item.createdAt).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FeedbackBoard() {
  const [open, setOpen] = useState(false);
  const [wrote, setWrote] = useState(readWrote);
  const [name, setName] = useState('');
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const openForm = () => {
    setOpen(true);
    setThanks(false);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, rating, content }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || '후기를 남기지 못했습니다.');
      saveWrote();
      setWrote(true);
      setContent('');
      setOpen(false);
      setThanks(true);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '후기를 남기지 못했습니다.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="mb-6">
      {/* 눈에 띄는 안내 배너 */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-5 shadow-md">
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
        <div className="absolute right-16 -bottom-10 h-24 w-24 rounded-full bg-white/10" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="relative flex h-2.5 w-2.5">
                {!wrote && <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75" />}
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-300" />
              </span>
              <span className={`text-[11px] font-bold tracking-wide text-amber-200 ${wrote ? '' : 'motion-safe:animate-pulse'}`}>
                GPTERS 24기 · 콘텐츠발행자동화 스터디
              </span>
            </div>
            <h2 className="text-lg font-bold text-white leading-snug">
              {wrote ? '후기 남겨주셔서 감사합니다! 🙌' : '동기 여러분, 써보신 소감을 한 줄 남겨주세요 ✍️'}
            </h2>
            <p className="text-sm text-blue-100 mt-1 leading-relaxed">
              {wrote
                ? '더 써보시고 생각나는 점이 있으면 언제든 또 남겨주세요. 다음 개선에 바로 반영합니다.'
                : '좋았던 점, 불편했던 점, 이런 기능이 있으면 좋겠다는 아이디어 모두 환영합니다. 1분이면 충분해요.'}
            </p>
          </div>
          <button
            type="button"
            onClick={openForm}
            className={`shrink-0 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-indigo-700 shadow hover:bg-amber-50 transition ${wrote ? '' : 'motion-safe:animate-bounce'}`}
          >
            <MessageSquareHeart size={18} />
            사용후기 남기기
          </button>
        </div>
      </div>

      {thanks && (
        <p className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          후기가 등록됐습니다. 소중한 의견 고맙습니다!
        </p>
      )}

      {open && (
        <form ref={formRef} onSubmit={submit} className="mt-3 bg-white border-2 border-indigo-200 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">사용후기 쓰기</h3>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="닫기">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-600">
              이름 또는 닉네임
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                placeholder="예: 24기 홍길동"
                className="mt-1 w-full p-2 text-sm border border-slate-300 rounded-md bg-slate-50"
              />
            </label>
            <div className="text-xs font-semibold text-slate-600">
              별점
              <div className="mt-1 flex items-center gap-1 h-[38px]">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n}점`} className="p-0.5">
                    <Star size={22} className={n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 hover:text-amber-300'} />
                  </button>
                ))}
                <span className="ml-2 text-slate-500 font-medium">{rating}점</span>
              </div>
            </div>
          </div>
          <label className="block text-xs font-semibold text-slate-600">
            후기
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="어떤 기능을 써보셨나요? 좋았던 점, 아쉬운 점, 바라는 점을 자유롭게 적어주세요."
              className="mt-1 w-full p-2 text-sm border border-slate-300 rounded-md bg-slate-50 leading-relaxed"
            />
            <span className="block text-right text-[11px] text-slate-400 font-normal">{content.length}/500</span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={sending || !name.trim() || !content.trim()}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            <Send size={15} />
            {sending ? '등록 중...' : '후기 등록'}
          </button>
        </form>
      )}

      <FeedbackList refreshKey={refreshKey} />
    </section>
  );
}
