import { useEffect, useState } from 'react';
import { Moon, Sun, ScrollText } from 'lucide-react';
import { cn } from '../ui';
import { applySiteTheme, getSiteTheme, type SiteTheme } from './siteTheme';

const OPTIONS: readonly { value: SiteTheme; label: string; icon: typeof Moon }[] = [
  { value: 'dark', label: '어두운 화면', icon: Moon },
  { value: 'light', label: '흰 화면', icon: Sun },
  { value: 'paper', label: '종이 화면', icon: ScrollText },
];

// 어두운 / 흰 / 종이 3가지 중 하나를 고르는 버튼 묶음
export function ThemeSwitcher({ className }: { className?: string }) {
  const [theme, setTheme] = useState<SiteTheme>(getSiteTheme);

  useEffect(() => {
    applySiteTheme(theme);
  }, [theme]);

  return (
    <div role="radiogroup" aria-label="화면 색" className={cn('inline-flex gap-0.5 rounded-control border border-line bg-surface-2 p-0.5', className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            'grid h-7 w-7 place-items-center rounded-control transition',
            theme === value ? 'bg-accent text-accent-ink' : 'text-ink-3 hover:text-ink',
          )}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
