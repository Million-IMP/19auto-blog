import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Search, Play, Plus, FileText, CornerDownLeft } from 'lucide-react';
import { cn } from '../ui';
import { NAV, OPEN_PALETTE_EVENT, PALETTE_SHORTCUT } from './nav';
import { applySiteTheme, THEME_OPTIONS } from './siteTheme';

// ⌘K / Ctrl+K로 여는 전역 명령창: 화면 이동, 지금 한 바퀴, 화면 색, 수집함에 바로 넣기, 글 찾기

type PostLite = { id: number; title: string; status: string; stage: string; platform: string };

type Command = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void | Promise<void>;
};

function matches(cmd: Command, q: string) {
  if (!q) return true;
  const hay = `${cmd.label} ${cmd.hint ?? ''} ${cmd.keywords ?? ''}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((word) => hay.includes(word));
}

export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [posts, setPosts] = useState<PostLite[] | null>(null);
  const [toast, setToast] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // 단축키와 외부 버튼(openCommandPalette)으로 열기. 열 때마다 입력을 비운다.
  useEffect(() => {
    const show = () => {
      setQuery('');
      setActive(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => {
          if (!v) {
            setQuery('');
            setActive(0);
          }
          return !v;
        });
      }
    };
    const onOpen = () => show();
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  // 글 목록은 열 때마다 새로 받는다
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    axios.get<PostLite[]>('/api/posts').then((r) => setPosts(r.data)).catch(() => setPosts([]));
    return () => returnFocus.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const close = () => setOpen(false);

  const commands = useMemo<Command[]>(() => {
    const q = query.trim();
    const list: Command[] = [];

    // 입력이 있으면 "수집함에 넣기"를 만든다. URL이면 맨 위, 일반 검색어면 맨 아래 (Enter 한 번에 메모가 쌓이지 않게)
    const isUrl = /^https?:\/\//.test(q);
    let capture: Command | null = null;
    if (q.length > 1) {
      capture = {
        id: 'capture',
        group: '바로 넣기',
        label: `수집함에 넣기: “${q.length > 48 ? `${q.slice(0, 48)}…` : q}”`,
        hint: isUrl ? 'URL' : '메모',
        icon: <Plus size={16} />,
        run: async () => {
          await axios.post('/api/inbox', { content: q, type: 'TEXT' });
          setToast('수집함에 넣었습니다.');
          navigate('/inbox');
        },
      };
    }

    list.push({
      id: 'run',
      group: '실행',
      label: '지금 한 바퀴 돌리기',
      hint: '수집 → 초안 작성',
      keywords: '자동 작성 실행 run',
      icon: <Play size={16} />,
      run: () => navigate('/?run=1'),
    });

    for (const item of NAV) {
      const Icon = item.icon;
      list.push({
        id: `nav${item.to}`,
        group: '이동',
        label: item.full,
        hint: 'step' in item ? `단계 ${item.step}` : undefined,
        keywords: item.label,
        icon: <Icon size={16} />,
        run: () => navigate(item.to),
      });
    }

    for (const t of THEME_OPTIONS) {
      const Icon = t.icon;
      list.push({
        id: `theme-${t.value}`,
        group: '화면 색',
        label: t.label,
        keywords: '테마 색 theme',
        icon: <Icon size={16} />,
        run: () => applySiteTheme(t.value),
      });
    }

    const filtered = list.filter((cmd) => matches(cmd, q));
    if (capture && isUrl) filtered.unshift(capture);

    // 글 찾기: 입력이 있을 때만, 제목으로 최대 6건
    if (q && posts) {
      const found = posts
        .filter((p) => p.title?.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 6)
        .map<Command>((p) => ({
          id: `post${p.id}`,
          group: '글',
          label: p.title,
          hint: p.status === 'PUBLISHED' ? '발행됨' : p.stage === 'READY' ? '발행 대기' : '작성 중',
          icon: <FileText size={16} />,
          run: () => navigate(`/posts#post-${p.id}`),
        }));
      filtered.push(...found);
    }
    if (capture && !isUrl) filtered.push(capture);
    return filtered;
  }, [query, posts, navigate]);

  // 목록이 줄어도 선택이 범위를 넘지 않게 그릴 때 맞춘다
  const current = Math.min(active, Math.max(commands.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const execute = async (cmd: Command | undefined) => {
    if (!cmd) return;
    close();
    try {
      await cmd.run();
    } catch {
      setToast('실행하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((current + 1) % Math.max(commands.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((current - 1 + commands.length) % Math.max(commands.length, 1));
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      execute(commands[current]);
    } else if (e.key === 'Tab') {
      // 창 안에 입력칸 하나뿐이라 포커스를 밖으로 내보내지 않는다
      e.preventDefault();
    }
  };

  return (
    <>
      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-card border border-line bg-surface px-4 py-2 text-sm text-ink shadow-pop">
          {toast}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="명령창">
          <button type="button" aria-label="명령창 닫기" tabIndex={-1} onClick={close} className="palette-scrim absolute inset-0 bg-scrim" />
          <div className="palette-panel relative w-full max-w-xl overflow-hidden rounded-card border border-line-strong bg-surface shadow-pop" onKeyDown={onKeyDown}>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={18} className="shrink-0 text-ink-3" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="이동, 실행, 글 찾기 — 또는 URL·메모를 붙여넣어 수집함에 넣기"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                aria-activedescendant={commands[current] ? `palette-${commands[current].id}` : undefined}
                className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-3 focus:outline-none"
              />
              <kbd className="hidden shrink-0 rounded-control border border-line px-1.5 py-0.5 text-xs text-ink-3 sm:block">Esc</kbd>
            </div>
            <ul ref={listRef} id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {commands.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-3">맞는 항목이 없습니다.</li>}
              {commands.map((cmd, index) => {
                const showGroup = index === 0 || commands[index - 1].group !== cmd.group;
                return (
                  <li key={cmd.id} role="presentation">
                    {showGroup && <p className="px-3 pb-1 pt-2 font-display text-xs font-bold tracking-wide text-ink-3">{cmd.group}</p>}
                    <div
                      id={`palette-${cmd.id}`}
                      role="option"
                      aria-selected={index === current}
                      data-index={index}
                      onMouseMove={() => setActive(index)}
                      onClick={() => execute(cmd)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-control px-3 py-2.5 text-sm',
                        index === current ? 'bg-accent text-accent-ink' : 'text-ink',
                      )}
                    >
                      <span className={cn('shrink-0', index === current ? 'text-accent-ink' : 'text-ink-3')}>{cmd.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                      {cmd.hint && <span className={cn('shrink-0 text-xs', index === current ? 'text-accent-ink/80' : 'text-ink-3')}>{cmd.hint}</span>}
                      {index === current && <CornerDownLeft size={14} className="shrink-0" />}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-ink-3">
              <span>↑↓ 고르기</span>
              <span>Enter 실행</span>
              <span className="ml-auto">{PALETTE_SHORTCUT} 언제든 열기</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
