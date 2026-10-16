import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Lock, LogOut, MessageSquareHeart, Send, Star, Trash2, X } from 'lucide-react';
import { Button, Card, Field, Input, Notice, Textarea } from './ui';

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
        <Star key={n} size={size} className={n <= value ? 'fill-draft text-draft' : 'text-ink-3'} />
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
    <div className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
          사용후기 <span className="text-accent">{list?.count ?? 0}</span>개
          {list?.average != null && (
            <span className="ml-2 flex items-center gap-1 text-xs font-normal text-ink-3">
              <Stars value={Math.round(list.average)} size={12} /> 평균 {list.average}점
            </span>
          )}
        </h3>
        {admin ? (
          <button type="button" onClick={logout} className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
            <LogOut size={12} /> 운영자 로그아웃
          </button>
        ) : (
          <button type="button" onClick={() => setLoginOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink-2">
            <Lock size={11} /> 운영자
          </button>
        )}
      </div>

      {loginOpen && !admin && (
        <form onSubmit={login} className="mb-3 flex flex-col sm:flex-row gap-2">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="운영자 비밀번호"
            autoComplete="current-password"
            autoFocus
            className="flex-1"
          />
          <Button type="submit" disabled={busy || !password}>
            {busy ? '확인 중...' : '확인'}
          </Button>
        </form>
      )}

      {error && <p className="mb-2 text-sm text-danger">{error}</p>}

      {!list ? (
        <p className="text-sm text-ink-3">후기를 불러오는 중입니다.</p>
      ) : list.items.length === 0 ? (
        <p className="text-sm text-ink-3">아직 후기가 없습니다. 위 버튼으로 첫 후기를 남겨 주세요.</p>
      ) : (
        <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {list.items.map((item) => (
            <li key={item.id} className="border border-line bg-surface-2 rounded-control p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-ink truncate">{item.name}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <Stars value={item.rating} size={12} />
                  {admin && (
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      disabled={busy}
                      className="text-ink-3 hover:text-danger disabled:opacity-50"
                      aria-label="후기 삭제"
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-ink-2 whitespace-pre-wrap break-words leading-relaxed">{item.content}</p>
              <p className="text-xs text-ink-3 mt-1.5">{new Date(item.createdAt).toLocaleString()}</p>
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
    <Card className="overflow-hidden">
      {/* 카드 머리: 안내 배너. 감사 문구·작성 폼·목록은 모두 이 카드 안에 이어진다. */}
      <div className="border-b border-accent/30 bg-accent/10 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2.5 w-2.5">
                {!wrote && <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />}
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
              </span>
              <span className="text-xs font-bold tracking-wide text-accent">GPTERS 24기 · 콘텐츠발행자동화 스터디</span>
            </div>
            <h2 className="text-base font-bold text-ink leading-snug">
              {wrote ? '후기 남겨주셔서 감사합니다!' : '동기 여러분, 써보신 소감을 한 줄 남겨주세요'}
            </h2>
            <p className="text-sm text-ink-2 mt-1 leading-relaxed">
              {wrote
                ? '더 써보시고 생각나는 점이 있으면 언제든 또 남겨주세요. 다음 개선에 바로 반영합니다.'
                : '좋았던 점, 불편했던 점, 이런 기능이 있으면 좋겠다는 아이디어 모두 환영합니다. 1분이면 충분해요.'}
            </p>
          </div>
          <Button variant="primary" icon={<MessageSquareHeart size={16} />} onClick={openForm}>
            사용후기 남기기
          </Button>
        </div>
      </div>

      {thanks && (
        <p className="text-sm text-published bg-published/10 border-b border-published/30 px-4 py-3">
          후기가 등록됐습니다. 소중한 의견 고맙습니다!
        </p>
      )}

      {open && (
        <form ref={formRef} onSubmit={submit} className="bg-surface-2 border-b border-line p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">사용후기 쓰기</h3>
            <button type="button" onClick={() => setOpen(false)} className="text-ink-3 hover:text-ink" aria-label="닫기">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="이름 또는 닉네임">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="예: 24기 홍길동" />
            </Field>
            <div className="text-xs font-semibold text-ink-2">
              별점
              <div className="mt-1.5 flex items-center gap-1 h-[38px]">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n}점`} className="p-0.5">
                    <Star size={22} className={n <= rating ? 'fill-draft text-draft' : 'text-ink-3 hover:text-draft'} />
                  </button>
                ))}
                <span className="ml-2 text-ink-3 font-medium">{rating}점</span>
              </div>
            </div>
          </div>
          <Field label="후기" hint={`${content.length}/500`}>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="어떤 기능을 써보셨나요? 좋았던 점, 아쉬운 점, 바라는 점을 자유롭게 적어주세요."
            />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" variant="primary" icon={<Send size={15} />} disabled={sending || !name.trim() || !content.trim()}>
            {sending ? '등록 중...' : '후기 등록'}
          </Button>
        </form>
      )}

      <FeedbackList refreshKey={refreshKey} />
    </Card>
  );
}
