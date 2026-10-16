import type { ReactNode } from 'react';
import { cn } from './cn';

// 모든 페이지 공통 바깥 틀: 같은 폭·같은 여백
export function Page({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return <div className={cn('mx-auto w-full px-gutter py-section md:px-8', wide ? 'max-w-[1400px]' : 'max-w-6xl', className)}>{children}</div>;
}

// step: 글 만드는 순서상 몇 번째 화면인지 (사이드바 번호와 같다)
export function PageHeader({ step, title, description, actions }: { step?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-section flex flex-col gap-3 border-b-2 border-ink pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {step && <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-accent tabular-nums">No. {step}</p>}
        <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-display text-2xl font-extrabold tracking-tight text-ink md:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
