import { Home, Inbox, Lightbulb, Archive, BookOpen, FileText, Activity } from 'lucide-react';

// 글 만드는 순서대로 나열한다. step은 페이지 제목 앞 번호와 같다.
// 사이드바(AppShell)와 커맨드 팔레트가 같이 쓴다.
export const NAV = [
  { to: '/', label: '홈', full: '대시보드', icon: Home },
  { to: '/inbox', label: '수집', full: '수집함', step: '01', icon: Inbox },
  { to: '/topics', label: '글감', full: '글감 보드', step: '02', icon: Lightbulb },
  { to: '/materials', label: '재료', full: '재료 베이스', step: '03', icon: Archive },
  { to: '/rules', label: '규칙', full: '규칙 (프롬프트)', step: '03', icon: BookOpen },
  { to: '/posts', label: '초안', full: '초안 · 발행 대기', step: '04', icon: FileText },
  { to: '/activity', label: '기록', full: '활동 기록', icon: Activity },
] as const;

// 커맨드 팔레트를 여는 전역 이벤트 (버튼·단축키 어디서든 같은 방법으로 연다)
export const OPEN_PALETTE_EVENT = 'open-command-palette';

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const PALETTE_SHORTCUT = isMac ? '⌘K' : 'Ctrl K';
