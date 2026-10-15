import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

type Status = 'checking' | 'open' | 'locked';

// 서버에 APP_PASSWORD가 설정돼 있으면 로그인 전까지 화면을 막는다.
export function LoginGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((body) => setStatus(!body.required || body.loggedIn ? 'open' : 'locked'))
      .catch(() => setStatus('open'));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || '로그인하지 못했습니다.');
      setStatus('open');
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'checking') return <div className="h-screen bg-slate-50" />;
  if (status === 'open') return <>{children}</>;

  return (
    <div className="h-screen bg-slate-50 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">AUTO<span className="text-blue-600">BLOG</span></h1>
          <p className="text-sm text-slate-500 mt-1">비밀번호를 입력해주세요.</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
          className="w-full p-2.5 text-sm border border-slate-300 rounded-md bg-slate-50"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !password}
          className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? '확인 중...' : '들어가기'}
        </button>
      </form>
    </div>
  );
}
