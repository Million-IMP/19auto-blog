import type { ReactNode } from 'react';
import { cn } from './cn';

// 모든 페이지 공통 바깥 틀: 같은 폭·같은 여백
export function Page({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return <div className={cn('mx-auto w-full px-gutter py-section md:px-8', wide ? 'max-w-[1400px]' : 'max-w-6xl', className)}>{children}</div>;
}

// step: 글 만드는 순서상 몇 번째 화면인지 (사이드바 번호와 같다)
export function PageHeader({ step, title, description, actions }: { step?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-section">
      <div className="min-w-0">
        <h1 className="flex items-baseline gap-2 text-xl font-bold tracking-tight text-ink">
          {step && <span className="text-sm font-bold text-ink-3 tabular-nums">{step}</span>}
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
