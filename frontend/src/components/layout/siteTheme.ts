// 사이트 전체 스킨. index.css의 .theme-dark / .theme-light / .theme-paper 토큰을 <html>에 붙여 바꾼다.
// index.html의 인라인 스크립트도 같은 키로 첫 화면 깜빡임을 막는다.
export type SiteTheme = 'dark' | 'light' | 'paper';

// 처음 방문했거나 고른 적이 없을 때 쓰는 색 (index.html 인라인 스크립트와 같게 유지)
export const DEFAULT_SITE_THEME: SiteTheme = 'paper';

const STORAGE_KEY = 'site-theme';
export const SITE_THEMES: readonly SiteTheme[] = ['dark', 'light', 'paper'];

function isTheme(value: unknown): value is SiteTheme {
  return SITE_THEMES.includes(value as SiteTheme);
}

export function getSiteTheme(): SiteTheme {
  const fromDom = SITE_THEMES.find((t) => document.documentElement.classList.contains(`theme-${t}`));
  if (fromDom) return fromDom;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    // 저장소를 못 쓰는 환경(시크릿 창 등)은 기본값
  }
  return DEFAULT_SITE_THEME;
}

export function applySiteTheme(theme: SiteTheme) {
  const root = document.documentElement;
  for (const t of SITE_THEMES) root.classList.toggle(`theme-${t}`, t === theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 저장 실패해도 이번 방문 동안은 적용된다
  }
}
