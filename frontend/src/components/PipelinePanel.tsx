import { useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RotateCw, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge, Button, PIPELINE_STAGES } from './ui';

const STAGES = PIPELINE_STAGES;

type PipelinePost = {
  id: number;
  stage: string;
  stageError: string | null;
  sources: string | null;
  polishNotes: string | null;
  imagePlan: string | null;
  status?: string;
};

type ImageScene = {
  h2?: string;
  anchor?: string;
  point: string;
  scene: string;
  must: string;
  avoid: string;
  caption?: string;
  url?: string;
  score?: number;
  scoreReason?: string;
  retried?: boolean;
  // image-jobs: 새 그림을 기다리는 장면 (이전 그림은 올라올 때까지 그대로 보인다)
  pending?: boolean;
};
type ImagePlan = { style: string; provider?: string; retries?: number; cover: ImageScene; sections: ImageScene[] };

// 이미지 관련성 점수(1~5). 4 이상 통과, 3 보통, 2 이하는 다시 생성 권장
function ScoreBadge({ scene }: { scene: ImageScene }) {
  if (scene.score === undefined) return null;
  const tone = scene.score >= 4 ? 'bg-published/10 text-published border-published/40' : scene.score === 3 ? 'bg-info/10 text-info border-info/40' : 'bg-danger/10 text-danger border-danger/40';
  return (
    <span title={scene.scoreReason} className={`px-1.5 py-0.5 rounded-control border font-semibold text-xs ${tone}`}>
      관련성 {scene.score}/5{scene.retried ? ' · 재생성' : ''}
    </span>
  );
}

function averageScore(plan: ImagePlan) {
  const scores = [plan.cover, ...plan.sections].map((s) => s.score).filter((s): s is number => s !== undefined);
  return scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;
}

function readPlan(raw: string | null): ImagePlan | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function ImagePlanList({ plan, regenerating, busy, onRegenerate }: { plan: ImagePlan; regenerating: number | null; busy: boolean; onRegenerate: (index: number) => void }) {
  const scenes = [{ label: '표지', scene: plan.cover }, ...plan.sections.map((s) => ({ label: s.h2 || '', scene: s }))];
  return (
    <div className="not-prose space-y-2">
      <p className="text-ink-2">
        <b>스타일</b> {plan.style} {plan.provider && <span className="text-ink-3">· {plan.provider}</span>}
      </p>
      {scenes.map(({ label, scene }, index) => (
        <div key={index} className="flex gap-3 items-start bg-surface border border-line rounded-control p-2">
          {scene.url ? <img src={scene.url} alt={scene.point} className="w-28 h-16 object-cover rounded-control shrink-0 bg-surface-2" /> : <div className="w-28 h-16 rounded-control bg-surface-2 shrink-0" />}
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-semibold text-ink truncate">{label}</p>
              <ScoreBadge scene={scene} />
              {(!scene.url || scene.pending) && <Badge tone="draft" title="PC 작업자(scripts/image-jobs.js)가 그림을 올리면 채워집니다">작업 대기</Badge>}
            </div>
            {scene.anchor && <p className="text-ink-2">대상: {scene.anchor.split('/')[0].trim()}</p>}
            <p className="text-ink-2">{scene.scene}</p>
            {scene.scoreReason && <p className="text-ink-3">채점: {scene.scoreReason}</p>}
            <p className="text-ink-3">필수: {scene.must} · 제외: {scene.avoid}</p>
            {scene.caption && <p className="text-ink-3">캡션: ▲ {scene.caption}</p>}
          </div>
          {scene.url && (
            <Button size="sm" onClick={() => onRegenerate(index)} disabled={busy || regenerating !== null} icon={<RotateCw size={12} className={regenerating === index ? 'animate-spin' : ''} />}>
              다시 생성
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line pt-2">
      <button onClick={() => setOpen(!open)} className="text-xs font-semibold text-ink-2 flex items-center gap-1 hover:text-ink">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {title}
      </button>
      {open && (
        <div className="prose prose-xs max-w-none text-xs mt-2 bg-surface-2 p-3 rounded-control border border-line">
          {children}
        </div>
      )}
    </div>
  );
}

export function PipelinePanel({ post, resuming, onResume, onChanged }: { post: PipelinePost; resuming: boolean; onResume: () => void; onChanged: () => void }) {
  const current = STAGES.findIndex((s) => s.key === post.stage);
  const failed = Boolean(post.stageError);
  const plan = readPlan(post.imagePlan);
  const [regenerating, setRegenerating] = useState<number | null>(null);
  // 이미지 세트 다시 만들기는 그림 약 7장의 구독 사용량이 드니 한 번 더 눌러야 실행한다
  const [rebuildArmed, setRebuildArmed] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const canRebuild = Boolean(plan) && post.stage === 'READY' && post.status !== 'PUBLISHED';
  const average = plan ? averageScore(plan) : null;

  const handleRebuild = async () => {
    if (!rebuildArmed) {
      setRebuildArmed(true);
      return;
    }
    setRebuildArmed(false);
    setRebuilding(true);
    try {
      await axios.post(`/api/posts/${post.id}/images/rebuild`);
      onChanged();
    } catch (e: any) {
      alert(e.response?.data?.error || '이미지 세트를 다시 만들지 못했습니다.');
    }
    setRebuilding(false);
  };

  const handleRegenerate = async (index: number) => {
    setRegenerating(index);
    try {
      await axios.post(`/api/posts/${post.id}/images/${index}/regenerate`);
      onChanged();
    } catch (e: any) {
      alert(e.response?.data?.error || '이미지를 다시 만들지 못했습니다.');
    }
    setRegenerating(null);
  };

  return (
    <div className="mb-4 border border-line rounded-control p-3 space-y-2 bg-surface-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {STAGES.map((s, i) => {
          const done = i < current || post.stage === 'READY';
          const active = i === current && post.stage !== 'READY';
          const style = done
            ? 'bg-published/10 text-published border-published/40'
            : active && failed
              ? 'bg-danger/10 text-danger border-danger/40'
              : active
                ? 'bg-info/10 text-info border-info/40'
                : 'text-ink-3 border-line';
          const mark = done ? '✓' : active ? (failed ? '✕' : '●') : '';
          return (
            <span key={s.key} className={`px-2 py-0.5 rounded-control border font-semibold ${style}`}>
              {mark} {s.label}
            </span>
          );
        })}
      </div>

      {failed && (
        <div className="flex items-start justify-between gap-3 bg-danger/10 border border-danger/40 rounded-control p-2">
          <p className="text-xs text-danger break-all">{post.stageError}</p>
          <Button size="sm" variant="danger" onClick={onResume} disabled={resuming} icon={<RotateCw size={12} className={resuming ? 'animate-spin' : ''} />}>
            {resuming ? '진행 중...' : '이어하기'}
          </Button>
        </div>
      )}
      {!failed && post.stage !== 'READY' && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-info">다음 실행에서 이어서 진행합니다.</p>
          <Button size="sm" onClick={onResume} disabled={resuming}>
            {resuming ? '진행 중...' : '지금 진행'}
          </Button>
        </div>
      )}

      {post.sources && (
        <Section title="출처 · 확인일">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.sources}</ReactMarkdown>
        </Section>
      )}
      {plan && (
        <Section title={`이미지 계획 · ${1 + plan.sections.length}장${average ? ` · 관련성 평균 ${average}` : ''}`}>
          {canRebuild && (
            <div className="not-prose flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-ink-3">{rebuildArmed ? '한 번 더 누르면 새 계획으로 모든 이미지를 다시 만듭니다 (이미지 생성 비용 발생).' : '글 내용과 맞지 않으면 이미지 세트를 통째로 다시 만들 수 있습니다.'}</p>
              <Button size="sm" variant={rebuildArmed ? 'danger' : undefined} onClick={handleRebuild} onBlur={() => setRebuildArmed(false)} disabled={rebuilding || regenerating !== null} icon={<RotateCw size={12} className={rebuilding ? 'animate-spin' : ''} />}>
                {rebuilding ? '다시 만드는 중...' : rebuildArmed ? '정말 다시 만들기' : '이미지 세트 다시 만들기'}
              </Button>
            </div>
          )}
          <ImagePlanList plan={plan} regenerating={regenerating} busy={rebuilding} onRegenerate={handleRegenerate} />
        </Section>
      )}
      {post.polishNotes && (
        <Section title="문체 교정 전 → 후">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.polishNotes}</ReactMarkdown>
        </Section>
      )}
    </div>
  );
}
