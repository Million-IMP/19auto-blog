import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Activity, AlertTriangle, Bot, CheckCircle2, Hand, RotateCcw, Rss } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Notice, Page, PageHeader, Segmented, cn, type BadgeTone } from '../components/ui';

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
const EVENT_STYLE: Record<string, { label: string; tone: BadgeTone; icon: typeof Bot }> = {
  CRON_RSS_MULTI: { label: '자동 수집', tone: 'info', icon: Rss },
  CRON_AUTO_PIPELINE: { label: '자동 작성', tone: 'accent', icon: Bot },
  MANUAL_RSS: { label: '수동 수집', tone: 'neutral', icon: Hand },
  MANUAL_AUTO_PIPELINE: { label: '수동 작성', tone: 'neutral', icon: Hand },
  POST_READY: { label: '초안 완성', tone: 'published', icon: CheckCircle2 },
  POST_STAGE_ERROR: { label: '단계 실패', tone: 'danger', icon: AlertTriangle },
  CRON_ERROR: { label: '수집 오류', tone: 'danger', icon: AlertTriangle },
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
    <Page>
      <PageHeader
        title="활동 기록"
        description="자동 수집·자동 작성·초안 완성·오류를 시간순으로 모두 볼 수 있습니다. 1분마다 새로 불러옵니다."
        actions={
          <Button icon={<RotateCcw size={14} className={loading ? 'animate-spin' : ''} />} onClick={() => load()} disabled={loading}>
            새로고침
          </Button>
        }
      />

      <Segmented options={KINDS} value={kind as (typeof KINDS)[number]['value']} onChange={setKind} className="mb-section" />

      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}

      {!loading && logs.length === 0 && !error && (
        <EmptyState
          icon={<Activity size={28} />}
          title="기록이 없습니다."
          description={kind ? '다른 종류를 고르거나 "전체"를 눌러 보세요.' : '자동 작성을 켜거나 대시보드에서 "지금 한 바퀴"를 누르면 기록이 쌓입니다.'}
        />
      )}

      <div className="space-y-section">
        {groups.map((group) => (
          <section key={group.day}>
            <h2 className="mb-2 text-xs font-bold text-ink-3">{group.day}</h2>
            <Card>
              <ul className="divide-y divide-line">
                {group.items.map((log) => {
                  const style = EVENT_STYLE[log.event]
                    || (log.event.startsWith('CRON_RSS') ? EVENT_STYLE.CRON_RSS_MULTI : null)
                    || { label: log.event, tone: 'neutral' as BadgeTone, icon: Bot };
                  const Icon = style.icon;
                  const [headline, ...details] = log.message.split('\n');
                  return (
                    <li key={log.id} className={cn('flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:gap-3', hasFailure(log) && 'bg-danger/5')}>
                      <div className="flex shrink-0 items-center gap-2 sm:w-36 sm:items-start">
                        <span className="w-11 pt-0.5 font-mono text-xs tabular-nums text-ink-3">
                          {new Date(log.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                        <Badge tone={style.tone} icon={<Icon size={12} />}>{style.label}</Badge>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm text-ink">{headline}</p>
                        {details.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {details.map((line, i) => (
                              <li key={i} className="break-words text-xs text-ink-3">{line}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ))}
      </div>

      {hasMore && (
        <div className="mt-section text-center">
          <Button variant="ghost" onClick={() => load(logs[logs.length - 1]?.id)} disabled={loading}>
            {loading ? '불러오는 중…' : '이전 기록 더 보기'}
          </Button>
        </div>
      )}
    </Page>
  );
}
