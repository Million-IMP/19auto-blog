import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Activity, AlertTriangle, Bot, CheckCircle2, Hand, RotateCcw, Rss } from 'lucide-react';

const API_URL = '/api';
const PAGE_SIZE = 50;

type LogEntry = { id: number; event: string; message: string; createdAt: string };

const KINDS = [
  { value: '', label: '전체' },
  { value: 'auto', label: '자동 실행' },
  { value: 'manual', label: '수동 실행' },
  { value: 'post', label: '초안 결과' },
  { value: 'error', label: '오류' },
] as const;

// 이벤트별 표시 이름·색·아이콘
const EVENT_STYLE: Record<string, { label: string; className: string; icon: typeof Bot }> = {
  CRON_RSS_MULTI: { label: '자동 수집', className: 'bg-sky-50 text-sky-700 border-sky-200', icon: Rss },
  CRON_AUTO_PIPELINE: { label: '자동 작성', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Bot },
  MANUAL_RSS: { label: '수동 수집', className: 'bg-slate-50 text-slate-700 border-slate-200', icon: Hand },
  MANUAL_AUTO_PIPELINE: { label: '수동 작성', className: 'bg-slate-50 text-slate-700 border-slate-200', icon: Hand },
  POST_READY: { label: '초안 완성', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  POST_STAGE_ERROR: { label: '단계 실패', className: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
  CRON_ERROR: { label: '수집 오류', className: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
};

function dayLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return '오늘';
  if (date.toDateString() === yesterday.toDateString()) return '어제';
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

// 자동 작성 요약은 "실패 N" 숫자로, 나머지는 이벤트 종류로 경고 여부를 정한다
function hasFailure(log: LogEntry) {
  if (log.event.endsWith('ERROR')) return true;
  const failed = log.message.match(/실패 (\d+)/);
  return failed ? Number(failed[1]) > 0 : false;
}

export function ActivityPage() {
  const [kind, setKind] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const loadedCount = useRef(0);

  const load = useCallback(async (before?: number) => {
    setLoading(true);
    try {
      const res = await axios.get<LogEntry[]>(`${API_URL}/system-logs`, {
        params: { limit: PAGE_SIZE, kind: kind || undefined, before },
      });
      setLogs((prev) => {
        const next = before ? [...prev, ...res.data] : res.data;
        loadedCount.current = next.length;
        return next;
      });
      setHasMore(res.data.length === PAGE_SIZE);
      setError('');
    } catch {
      setError('활동 기록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    load();
    // 화면을 열어 둔 동안 1분마다 최신 기록을 다시 불러온다. 이전 기록을 더 펼쳐 봤으면 건드리지 않는다.
    const timer = setInterval(() => {
      if (loadedCount.current <= PAGE_SIZE) load();
    }, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const groups: { day: string; items: LogEntry[] }[] = [];
  for (const log of logs) {
    const day = dayLabel(new Date(log.createdAt));
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(log);
    else groups.push({ day, items: [log] });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 mb-6 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Activity size={20} className="text-blue-600" /> 활동 기록
          </h1>
          <p className="text-sm text-slate-500 mt-1">자동 수집·자동 작성·초안 완성·오류를 시간순으로 모두 볼 수 있습니다.</p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="bg-white text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-slate-50 transition flex items-center gap-2 shadow-sm disabled:opacity-50"
        >
          <RotateCcw size={14} className={loading ? 'animate-spin' : ''} /> 새로고침
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {KINDS.map((k) => (
          <button
            key={k.value}
            onClick={() => setKind(k.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              kind === k.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {!loading && logs.length === 0 && !error && (
        <p className="text-sm text-slate-400 py-16 text-center bg-white border border-slate-200 rounded-lg">기록이 없습니다.</p>
      )}

      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.day}>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{group.day}</h2>
            <ul className="bg-white border border-slate-200 rounded-lg shadow-sm divide-y divide-slate-100">
              {group.items.map((log) => {
                const style = EVENT_STYLE[log.event]
                  || (log.event.startsWith('CRON_RSS') ? EVENT_STYLE.CRON_RSS_MULTI : null)
                  || { label: log.event, className: 'bg-slate-50 text-slate-600 border-slate-200', icon: Bot };
                const Icon = style.icon;
                const [headline, ...details] = log.message.split('\n');
                return (
                  <li key={log.id} className={`px-4 py-3 flex gap-3 ${hasFailure(log) ? 'bg-red-50/40' : ''}`}>
                    <span className="text-xs font-mono text-slate-400 w-12 shrink-0 pt-0.5">
                      {new Date(log.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                    <span className={`h-fit shrink-0 inline-flex items-center gap-1 text-[11px] font-bold border px-2 py-0.5 rounded-md ${style.className}`}>
                      <Icon size={12} /> {style.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 break-words">{headline}</p>
                      {details.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {details.map((line, i) => (
                            <li key={i} className="text-xs text-slate-500 break-words">{line}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={() => load(logs[logs.length - 1]?.id)}
            disabled={loading}
            className="text-sm font-semibold text-blue-600 hover:text-blue-800 px-4 py-2 disabled:opacity-50"
          >
            {loading ? '불러오는 중…' : '이전 기록 더 보기'}
          </button>
        </div>
      )}
    </div>
  );
}
