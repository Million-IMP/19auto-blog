import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Inbox, Lightbulb, Archive, BookOpen, FileText, Activity, Menu, X } from 'lucide-react';
import { cn } from '../ui';

// 글 만드는 순서대로 나열한다. step은 페이지 제목 앞 번호와 같다.
const NAV = [
  { to: '/', label: '홈', full: '대시보드', icon: Home },
  { to: '/inbox', label: '수집', full: '수집함', step: '01', icon: Inbox },
  { to: '/topics', label: '글감', full: '글감 보드', step: '02', icon: Lightbulb },
  { to: '/materials', label: '재료', full: '재료 베이스', step: '03', icon: Archive },
  { to: '/rules', label: '규칙', full: '규칙 (프롬프트)', step: '03', icon: BookOpen },
  { to: '/posts', label: '초안', full: '초안 · 발행 대기', step: '04', icon: FileText },
  { to: '/activity', label: '기록', full: '활동 기록', icon: Activity },
] as const;

function Logo({ small }: { small?: boolean }) {
  return <div className={cn('grid place-items-center rounded-card bg-accent font-black text-accent-ink', small ? 'h-8 w-8' : 'h-9 w-9')}>A</div>;
}

// 768px 이상: 왼쪽 아이콘 레일
function Rail({ pathname }: { pathname: string }) {
  return (
    <aside className="hidden md:flex w-20 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-4">
      <Link to="/" aria-label="AutoBlog 홈" className="mb-4"><Logo /></Link>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              title={item.full}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex w-16 flex-col items-center gap-1 rounded-card py-2 text-xs font-semibold transition',
                active ? 'bg-surface-2 text-accent' : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
              )}
            >
              {'step' in item && <span className={cn('absolute right-1 top-0.5 text-xs font-bold tabular-nums', active ? 'text-accent' : 'text-ink-3')}>{item.step}</span>}
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

// 768px 미만: 상단바 + 드로어
function MobileNav({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const current = NAV.find((item) => item.to === pathname);

  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll<HTMLElement>('a, button');
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const onPop = () => setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    const menuButton = menuRef.current;
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      menuButton?.focus();
    };
  }, [open]);

  return (
    <>
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
        <Link to="/" aria-label="AutoBlog 홈" onClick={() => setOpen(false)}><Logo small /></Link>
        <span className="flex-1 truncate text-sm font-bold text-ink">{current?.full ?? 'AutoBlog'}</span>
        <button ref={menuRef} type="button" onClick={() => setOpen(true)} aria-label="메뉴 열기" aria-expanded={open} className="grid h-9 w-9 place-items-center rounded-control border border-line text-ink-2">
          <Menu size={18} />
        </button>
      </header>

      {open && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="메뉴">
          <button type="button" aria-label="메뉴 닫기" tabIndex={-1} onClick={() => setOpen(false)} className="absolute inset-0 bg-scrim" />
          <nav ref={panelRef} className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-1 border-r border-line bg-surface p-4 shadow-pop">
            <div className="mb-3 flex items-center gap-3">
              <Logo small />
              <span className="flex-1 font-bold text-ink">AutoBlog</span>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="메뉴 닫기" className="grid h-9 w-9 place-items-center rounded-control text-ink-2 hover:bg-surface-2">
                <X size={18} />
              </button>
            </div>
            <p className="px-3 pb-1 text-xs font-semibold text-ink-3">글 만드는 순서</p>
            {NAV.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={cn('flex items-center gap-3 rounded-card px-3 py-2.5 text-sm font-semibold', active ? 'bg-surface-2 text-accent' : 'text-ink-2 hover:bg-surface-2')}
                >
                  <Icon size={18} />
                  <span className="flex-1">{item.full}</span>
                  {'step' in item && <span className="text-xs tabular-nums text-ink-3">{item.step}</span>}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink md:flex-row">
      <Rail pathname={pathname} />
      <MobileNav pathname={pathname} />
      <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
