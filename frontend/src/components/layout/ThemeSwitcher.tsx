import { useEffect, useState } from 'react';
import { cn } from '../ui';
import { applySiteTheme, getSiteTheme, SITE_THEME_EVENT, THEME_OPTIONS, type SiteTheme } from './siteTheme';

// 어두운 / 흰 / 종이 3가지 중 하나를 고르는 버튼 묶음
export function ThemeSwitcher({ className }: { className?: string }) {
  const [theme, setTheme] = useState<SiteTheme>(getSiteTheme);

  useEffect(() => {
    if (theme !== getSiteTheme()) applySiteTheme(theme);
  }, [theme]);

  // 다른 곳(커맨드 팔레트, 다른 스위처)에서 바꾼 색을 따라간다
  useEffect(() => {
    const onChange = (e: Event) => setTheme((e as CustomEvent<SiteTheme>).detail);
    window.addEventListener(SITE_THEME_EVENT, onChange);
    return () => window.removeEventListener(SITE_THEME_EVENT, onChange);
  }, []);

  return (
    <div role="radiogroup" aria-label="화면 색" className={cn('inline-flex gap-0.5 rounded-control border border-line bg-surface-2 p-0.5', className)}>
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
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
