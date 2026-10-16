import type { ReactNode } from 'react';
import { cn } from './cn';

// 빈 목록: 무엇이 비었는지 + 어떻게 채우는지 + (있으면) 바로 가는 버튼
// compact: 대시보드 열처럼 좁은 곳에 넣을 때 여백을 줄인다 (className으로 패딩을 덮어쓰지 말 것)
export function EmptyState({ icon, title, description, action, compact, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong text-center', compact ? 'px-3 py-6' : 'px-4 py-10', className)}>
      {icon && <div className="text-ink-3 mb-1">{icon}</div>}
      <p className="text-sm font-semibold text-ink-2">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-3 leading-relaxed">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
