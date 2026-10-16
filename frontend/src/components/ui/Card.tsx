import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { cardClass } from './styles';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(cardClass, className)} {...rest} />;
}

// 카드 머리줄: 제목 + 보조 설명 + 오른쪽 동작
export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-line', className)}>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold text-ink flex items-center gap-2">{title}</h2>
        {description && <p className="text-xs text-ink-3 mt-0.5">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...rest} />;
}

// 안내·경고 한 줄
export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'draft' | 'danger' | 'published'; children: ReactNode; className?: string }) {
  const toneClass = {
    info: 'border-info/30 bg-info/10 text-ink-2',
    draft: 'border-draft/30 bg-draft/10 text-ink-2',
    danger: 'border-danger/30 bg-danger/10 text-danger',
    published: 'border-published/30 bg-published/10 text-published',
  }[tone];
  return <div className={cn('text-sm border rounded-control px-3 py-2 leading-relaxed', toneClass, className)}>{children}</div>;
}
