import type { ReactNode } from 'react';
import { cn } from './cn';
import { PIPELINE_STAGES } from './styles';

export type BadgeTone = 'neutral' | 'accent' | 'draft' | 'published' | 'danger' | 'info';

const TONE: Record<BadgeTone, string> = {
  neutral: 'text-ink-2 border-line-strong bg-surface-2',
  accent: 'text-accent border-accent/40 bg-accent/10',
  draft: 'text-draft border-draft/40 bg-draft/10',
  published: 'text-published border-published/40 bg-published/10',
  danger: 'text-danger border-danger/40 bg-danger/10',
  info: 'text-info border-info/40 bg-info/10',
};

export function Badge({ tone = 'neutral', icon, children, className, title }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex max-w-full min-w-0 items-center gap-1 whitespace-nowrap rounded-control border px-1.5 py-0.5 text-xs font-semibold leading-tight', TONE[tone], className)}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

// DB에 문자열로 저장된 상태값 → 표시 이름과 색. 새 상태가 생기면 여기에만 추가한다.
const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  // 글 (Post.status)
  DRAFT: { label: '초안', tone: 'draft' },
  PUBLISHED: { label: '발행됨', tone: 'published' },
  // 글감 카드 (TopicCard.status)
  CANDIDATE: { label: '후보', tone: 'neutral' },
  SELECTED: { label: '선택함', tone: 'accent' },
  DISMISSED: { label: '제외', tone: 'neutral' },
  // 수집함
  PROCESSED: { label: '처리됨', tone: 'neutral' },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const info = STATUS[status] || { label: status, tone: 'neutral' as BadgeTone };
  return <Badge tone={info.tone} className={className}>{info.label}</Badge>;
}

// 단계형 초안 파이프라인 (Post.stage)
export function StageBadge({ stage, failed, className }: { stage: string; failed?: boolean; className?: string }) {
  const label = PIPELINE_STAGES.find((s) => s.key === stage)?.label || stage;
  if (failed) return <Badge tone="danger" className={className}>{label} 실패</Badge>;
  if (stage === 'READY') return <Badge tone="accent" className={className}>발행 대기</Badge>;
  return <Badge tone="info" className={className}>{label} 단계</Badge>;
}
