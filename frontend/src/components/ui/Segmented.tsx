import { cn } from './cn';

// 탭·필터 버튼 묶음 (전체/초안/발행, 후보/선택/제외 등)
export function Segmented<T extends string>({ options, value, onChange, className }: { options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn('inline-flex flex-wrap gap-1 rounded-control border border-line bg-surface p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-control px-2.5 py-1 text-xs font-semibold transition',
            value === o.value ? 'bg-surface-3 text-accent' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// 켜짐/꺼짐 스위치
export function Switch({ checked, onChange, label, className }: { checked: boolean; onChange: () => void; label?: string; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn('inline-flex items-center gap-2 text-xs font-semibold', checked ? 'text-accent' : 'text-ink-3 hover:text-ink-2', className)}
    >
      <span className={cn('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full transition-all', checked ? 'left-[18px] bg-accent-ink' : 'left-0.5 bg-ink-2')} />
      </span>
      {label}
    </button>
  );
}
