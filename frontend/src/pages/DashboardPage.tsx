import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Settings, Play, ChevronDown, ChevronRight } from 'lucide-react';
import { FeedbackBoard } from '../components/FeedbackBoard';
import { parseRssItem } from '../components/inbox/parseRssItem';
import { Badge, Button, ButtonLink, Card, CardHeader, CardBody, EmptyState, Field, Notice, Page, PageHeader, Select, StageBadge, Switch, cn } from '../components/ui';

const API_URL = '/api';

type DashboardStats = {
  inboxUnprocessed: number;
  materialsActive: number;
  drafts: number;
  published: number;
  activeRss: number;
  lastLog: { event: string; message: string; createdAt: string } | null;
};

type MaterialOption = { id: number; title: string | null; isActive?: boolean };
type RuleItem = { id: number; title: string; isActive: boolean };
type InboxItem = { id: number; content: string; createdAt: string };
type TopicItem = { id: number; keyword: string; intent: string };
type DraftItem = { id: number; title: string; stage: string; stageError: string | null; createdAt: string };
type Summary = { inbox: InboxItem[]; blogDrafts: DraftItem[] };
type AutoConfig = {
  enabled: boolean;
  batchSize: number;
  autoOsmu: boolean;
  templateMaterialId: number | null;
  draftSource: string;
  failedCount: number;
};

function apiErrorMessage(error: unknown, fallback: string) {
  const body = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return body || fallback;
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// 보드의 한 열: 단계 번호·이름·건수 + 최근 항목 몇 개 + 비었을 때 할 일
function Column({ step, title, count, to, hot, children, more, empty }: {
  step: string; title: string; count: number | string; to: string; hot?: boolean;
  children?: ReactNode; more?: number; empty?: ReactNode;
}) {
  return (
    <section className={cn('flex min-h-[320px] snap-start flex-col rounded-card border bg-surface', hot ? 'border-accent/40' : 'border-line')}>
      <Link to={to} className="group flex items-baseline gap-2 rounded-t-card border-b border-line px-3.5 py-3 hover:bg-surface-2">
        <span className="text-xs font-bold tabular-nums text-ink-3">{step}</span>
        <b className="text-sm font-bold text-ink group-hover:text-accent">{title}</b>
        <span className={cn('ml-auto text-xl font-extrabold tabular-nums', hot ? 'text-accent' : 'text-ink')}>{count}</span>
      </Link>
      {empty ?? (
        <div className="grid content-start gap-2 p-2.5">
          {children}
          {more !== undefined && more > 0 && (
            <Link to={to} className="py-1 text-center text-xs text-ink-3 hover:text-ink">+{more}건 더 보기</Link>
          )}
        </div>
      )}
    </section>
  );
}

function Item({ to, title, meta }: { to: string; title: string; meta: ReactNode }) {
  return (
    <Link to={to} className="block rounded-control border border-line bg-surface-2 px-3 py-2.5 text-sm leading-snug text-ink hover:border-line-strong">
      <span className="line-clamp-2">{title}</span>
      <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">{meta}</span>
    </Link>
  );
}

// 빈 열: 공통 EmptyState를 열 안에 맞게 작게
function ColumnEmpty({ text, to, label }: { text: string; to: string; label: string }) {
  return <EmptyState compact className="m-2.5" title={text} action={<ButtonLink to={to} size="sm">{label}</ButtonLink>} />;
}

function AutoSettings({ auto, setAuto, materials, saving, running, dirty, onSave }: {
  auto: AutoConfig; setAuto: (next: AutoConfig) => void; materials: MaterialOption[];
  saving: boolean; running: boolean; dirty: boolean; onSave: () => void;
}) {
  return (
    <CardBody className="space-y-3">
      <p className="text-sm leading-relaxed text-ink-2">
        매일 오전 9시(한국시간)에 새 글을 모은 뒤, 아직 초안이 없는 최신 수집 항목을 네이버 블로그 초안으로 만듭니다.
        채널에 규칙이나 글감이 있으면 그것을 먼저 씁니다. 여기 글 뼈대는 채널에 글감이 없을 때의 기본입니다.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="한 번에">
          <Select value={auto.batchSize} onChange={(e) => setAuto({ ...auto, batchSize: Number(e.target.value) })}>
            <option value={1}>1건</option>
            <option value={2}>2건</option>
            <option value={3}>3건</option>
          </Select>
        </Field>
        <Field label="글 뼈대" className="md:col-span-2">
          <Select value={auto.templateMaterialId ?? ''} onChange={(e) => setAuto({ ...auto, templateMaterialId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">없음. 기본 글쓰기</option>
            {materials.map((item) => (
              <option key={item.id} value={item.id}>{item.title || `재료 #${item.id}`}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="초안 대상">
        <Select value={auto.draftSource} onChange={(e) => setAuto({ ...auto, draftSource: e.target.value })}>
          <option value="ALL_RSS">새 RSS 글마다 초안 만들기</option>
          <option value="SELECTED_TOPICS">새 RSS 글은 글감 보드에서 평가만 하고, 내가 고른 글감만 초안 만들기</option>
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={auto.autoOsmu} onChange={(e) => setAuto({ ...auto, autoOsmu: e.target.checked })} />
        블로그 초안 뒤에 인스타, 숏츠, 스레드 글도 만들기
      </label>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button variant={dirty ? 'primary' : 'secondary'} onClick={onSave} disabled={saving || running || !dirty}>
          {saving ? '저장 중...' : dirty ? '설정 저장' : '저장됨'}
        </Button>
        {dirty && <span className="text-sm text-draft">저장하지 않은 변경이 있습니다.</span>}
        {auto.failedCount > 0 && (
          <span className="text-sm text-danger">실패 {auto.failedCount}건은 수집함에서 다시 시도할 수 있습니다.</span>
        )}
      </div>
    </CardBody>
  );
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [summary, setSummary] = useState<Summary>({ inbox: [], blogDrafts: [] });
  // savedAuto: 서버에 저장된 값(배지 표시 기준) / auto: 화면에서 고치는 중인 값
  const [savedAuto, setSavedAuto] = useState<AutoConfig | null>(null);
  const [auto, setAuto] = useState<AutoConfig | null>(null);
  const [autoMsg, setAutoMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const dirty = Boolean(auto && savedAuto && JSON.stringify(auto) !== JSON.stringify(savedAuto));

  // load는 한 번만 만들고, 저장된 설정은 ref로 읽는다 (고치는 중인 설정을 새로고침이 덮어쓰지 않게)
  const savedAutoRef = useRef<AutoConfig | null>(null);
  useEffect(() => {
    savedAutoRef.current = savedAuto;
  }, [savedAuto]);

  const load = useCallback(() => {
    axios.get<DashboardStats>(`${API_URL}/stats`).then((r) => setStats(r.data)).catch((e) => setError(apiErrorMessage(e, '집계를 불러오지 못했습니다.')));
    axios.get<AutoConfig>(`${API_URL}/automation`)
      .then((r) => {
        setSavedAuto(r.data);
        // 고치는 중인 설정은 새로고침으로 덮어쓰지 않는다
        setAuto((prev) => {
          const saved = savedAutoRef.current;
          return prev && saved && JSON.stringify(prev) !== JSON.stringify(saved) ? prev : r.data;
        });
      })
      .catch((e) => setError(apiErrorMessage(e, '자동 작성 설정을 불러오지 못했습니다.')));
    // 보드 열 내용. 하나가 실패해도 나머지 열은 보여준다.
    axios.get<Summary>(`${API_URL}/dashboard`).then((r) => setSummary(r.data)).catch(() => undefined);
    axios.get<MaterialOption[]>(`${API_URL}/materials`).then((r) => setMaterials(r.data)).catch(() => undefined);
    axios.get<RuleItem[]>(`${API_URL}/rules`).then((r) => setRules(r.data)).catch(() => undefined);
    axios.get<TopicItem[]>(`${API_URL}/topics`, { params: { status: 'CANDIDATE' } }).then((r) => setTopics(r.data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveAuto = async () => {
    if (!auto) return;
    setSaving(true);
    setAutoMsg('');
    try {
      const r = await axios.put<AutoConfig>(`${API_URL}/automation`, auto);
      setSavedAuto(r.data);
      setAuto(r.data);
      setAutoMsg('설정을 저장했습니다.');
    } catch (e) {
      setAutoMsg(apiErrorMessage(e, '설정을 저장하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleAuto = () => {
    if (!auto) return;
    setAuto({ ...auto, enabled: !auto.enabled });
    setSettingsOpen(true);
  };

  const runAuto = async () => {
    setRunning(true);
    setAutoMsg('수집을 확인하고 초안을 작성하는 중입니다.');
    try {
      const r = await axios.post(`${API_URL}/automation/run`, undefined, { timeout: 180000 });
      const body = r.data;
      const line = body.skipped
        ? (body.messages?.[0] || '이미 실행 중입니다.')
        : `수집 ${body.addedCount ?? 0}건. 초안 ${body.drafted}건, 분류 ${body.classified}건, 파생 ${body.osmu}건, 실패 ${body.failed}건. ${(body.messages || []).join(' / ')}`;
      setAutoMsg(line);
      load();
    } catch (e) {
      setAutoMsg(apiErrorMessage(e, '자동 작성에 실패했습니다.'));
    } finally {
      setRunning(false);
    }
  };

  const inbox = summary.inbox;
  const writing = summary.blogDrafts.filter((p) => p.stage !== 'READY');
  const ready = summary.blogDrafts.filter((p) => p.stage === 'READY');
  const activeMaterials = materials.filter((m) => m.isActive);
  const activeRules = rules.filter((r) => r.isActive);

  // 지금 가장 먼저 손댈 단계: 뒤쪽(발행에 가까운) 단계부터 쌓인 곳
  const hotStep = ready.length > 0 ? 5 : writing.length > 0 ? 4 : topics.length > 0 ? 2 : 1;

  return (
    <Page wide>
      <PageHeader
        title={
          <>
            파이프라인
            {savedAuto && (
              <Badge tone={savedAuto.enabled ? 'accent' : 'neutral'} className="self-center">
                {savedAuto.enabled ? '자동 작성 켜짐 · 매일 09:00' : '자동 작성 꺼짐'}
              </Badge>
            )}
          </>
        }
        description="수집한 글이 글감·재료·규칙을 거쳐 초안과 발행 대기까지 어디쯤 있는지 봅니다. 열 제목을 누르면 그 화면으로 갑니다."
        actions={
          <>
            <Button icon={<Settings size={15} />} onClick={() => setSettingsOpen((v) => !v)}>설정</Button>
            <Button variant="primary" icon={<Play size={15} />} onClick={runAuto} disabled={running}>{running ? '작성 중...' : '지금 한 바퀴'}</Button>
          </>
        }
      />

      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      {autoMsg && <Notice tone="info" className="mb-4">{autoMsg}</Notice>}

      <div className="-mx-gutter grid snap-x snap-mandatory scroll-px-gutter auto-cols-[82%] grid-flow-col gap-3 overflow-x-auto px-gutter pb-2 sm:auto-cols-[45%] md:mx-0 md:scroll-px-0 md:px-0 lg:grid-flow-row lg:grid-cols-5 lg:overflow-visible">
        <Column step="01" title="수집" count={stats?.inboxUnprocessed ?? '–'} to="/inbox" hot={hotStep === 1} more={(stats?.inboxUnprocessed ?? 0) - inbox.length}
          empty={stats && stats.inboxUnprocessed === 0 ? <ColumnEmpty text="새로 모인 글이 없어요. RSS 채널을 추가하거나 URL을 붙여넣어 보세요." to="/inbox" label="수집함 열기" /> : undefined}>
          {inbox.map((item) => {
            const parsed = parseRssItem(item.content);
            return <Item key={item.id} to="/inbox" title={parsed.isRss ? parsed.title : item.content} meta={<>{parsed.channel || '직접 입력'} · {timeOf(item.createdAt)}</>} />;
          })}
        </Column>

        <Column step="02" title="글감" count={topics.length} to="/topics" hot={hotStep === 2} more={topics.length - 3}
          empty={topics.length === 0 ? <ColumnEmpty text="평가한 글감이 없어요. 수집한 글 중 쓸 만한 것을 골라 평가해 보세요." to="/topics" label="글감 고르기" /> : undefined}>
          {topics.slice(0, 3).map((t) => <Item key={t.id} to="/topics" title={t.keyword} meta={t.intent || '평가 대기'} />)}
        </Column>

        <Column step="03" title="재료 · 규칙" count={activeMaterials.length + activeRules.length} to="/rules"
          empty={activeMaterials.length + activeRules.length === 0 ? <ColumnEmpty text="기본으로 쓸 글 뼈대나 규칙이 없어요. 없으면 기본 글쓰기로 진행합니다." to="/materials" label="재료 등록" /> : undefined}>
          {activeMaterials.slice(0, 2).map((m) => <Item key={`m${m.id}`} to="/materials" title={m.title || `재료 #${m.id}`} meta="재료 · 기본 적용" />)}
          {activeRules.slice(0, 3).map((r) => <Item key={`r${r.id}`} to="/rules" title={r.title} meta="규칙 · 적용 중" />)}
        </Column>

        <Column step="04" title="초안" count={writing.length} to="/posts?status=draft&stage=writing" hot={hotStep === 4} more={writing.length - 3}
          empty={writing.length === 0 ? <ColumnEmpty text="작성 중인 초안이 없어요. 글감에서 초안을 만들거나 '지금 한 바퀴'를 눌러 보세요." to="/posts" label="작업실 열기" /> : undefined}>
          {writing.slice(0, 3).map((p) => <Item key={p.id} to="/posts?status=draft&stage=writing" title={p.title} meta={<><StageBadge stage={p.stage} failed={Boolean(p.stageError)} />{timeOf(p.createdAt)}</>} />)}
        </Column>

        <Column step="05" title="발행 대기" count={ready.length} to="/posts?status=draft&stage=ready" hot={hotStep === 5} more={ready.length - 3}
          empty={ready.length === 0 ? <ColumnEmpty text="완성된 초안이 아직 없어요. 초안이 모든 단계를 마치면 여기에 쌓입니다." to="/posts" label="초안 열기" /> : undefined}>
          {ready.slice(0, 3).map((p) => <Item key={p.id} to="/posts?status=draft&stage=ready" title={p.title} meta={<><Badge tone="draft">발행 전</Badge>{timeOf(p.createdAt)}</>} />)}
        </Column>
      </div>

      <Card className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-sm text-ink-2">
        <span className="min-w-0 basis-full truncate sm:basis-0 sm:flex-1">
          <span className={cn('mr-2 inline-block h-2 w-2 rounded-full', stats?.lastLog ? 'bg-published' : 'bg-ink-3')} />
          <b className="text-ink">최근 봇 활동</b>{' '}
          {stats?.lastLog ? `${new Date(stats.lastLog.createdAt).toLocaleString()} · ${stats.lastLog.message.split('\n')[0]}` : stats ? '아직 기록이 없습니다.' : '불러오는 중입니다.'}
        </span>
        <span>활성 RSS <b className="text-ink">{stats?.activeRss ?? '–'}</b></span>
        <Link to="/posts?status=published" className="hover:text-ink">발행 완료 <b className="text-published">{stats?.published ?? '–'}</b></Link>
        <Link to="/activity" className="text-accent hover:text-accent-strong">전체 기록 →</Link>
      </Card>

      <div className="mt-section grid grid-cols-1 items-start gap-section lg:grid-cols-2">
        <Card>
          <CardHeader
            title={<button type="button" onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen} className="flex items-center gap-1.5">{settingsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}자동 작성 설정</button>}
            description={auto ? `한 번에 ${auto.batchSize}건 · ${auto.draftSource === 'SELECTED_TOPICS' ? '고른 글감만' : '새 RSS 글마다'}` : undefined}
            action={auto && <Switch checked={auto.enabled} onChange={toggleAuto} label={`${auto.enabled ? '켜짐' : '꺼짐'}${dirty ? ' (저장 전)' : ''}`} />}
          />
          {settingsOpen && auto && <AutoSettings auto={auto} setAuto={setAuto} materials={materials} saving={saving} running={running} dirty={dirty} onSave={saveAuto} />}
        </Card>
        <FeedbackBoard />
      </div>
    </Page>
  );
}
