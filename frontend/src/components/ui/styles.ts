import { cn } from './cn';

// 컴포넌트가 아닌 공유 값. 컴포넌트 파일과 분리해야 Vite fast refresh가 깨지지 않는다.

// cn()은 클래스를 이어 붙이기만 하므로 같은 속성(색·패딩 등)을 className으로 덮어쓰면 안 된다.
// 다른 모양이 필요하면 덮어쓰지 말고 여기 variant/size를 추가한다.
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ghostDanger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink border-accent hover:bg-accent-strong hover:border-accent-strong',
  secondary: 'bg-surface-2 text-ink border-line hover:bg-surface-3 hover:border-line-strong',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-ink',
  danger: 'bg-transparent text-danger border-danger/40 hover:bg-danger/10',
  // 삭제 아이콘처럼 평소엔 흐리고 마우스를 올리면 빨개지는 버튼
  ghostDanger: 'bg-transparent text-ink-3 border-transparent hover:bg-danger/10 hover:text-danger',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
  icon: 'h-8 w-8 text-xs',
};

// <a>처럼 Button 컴포넌트를 못 쓰는 곳에서도 같은 버튼 모양을 쓴다
export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex items-center justify-center shrink-0 whitespace-nowrap rounded-control border font-semibold transition',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export const cardClass = 'bg-surface border border-line rounded-card shadow-card';

export const fieldClass = cn(
  'w-full rounded-control border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-3',
  'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
  'disabled:opacity-50',
);

// 단계형 초안 파이프라인 (Post.stage): SOURCES → OUTLINE → DRAFT → POLISH → IMAGES → READY
export const PIPELINE_STAGES = [
  { key: 'SOURCES', label: '자료 확인' },
  { key: 'OUTLINE', label: '목차' },
  { key: 'DRAFT', label: '본문' },
  { key: 'POLISH', label: '문체 교정' },
  { key: 'IMAGES', label: '이미지' },
  { key: 'READY', label: '완성' },
] as const;
