import { useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RotateCw, ChevronDown, ChevronRight } from 'lucide-react';

const STAGES = [
  { key: 'SOURCES', label: '자료 확인' },
  { key: 'OUTLINE', label: '목차' },
  { key: 'DRAFT', label: '본문' },
  { key: 'POLISH', label: '문체 교정' },
  { key: 'IMAGES', label: '이미지' },
  { key: 'READY', label: '완성' },
] as const;

type PipelinePost = {
  id: number;
  stage: string;
  stageError: string | null;
  sources: string | null;
  polishNotes: string | null;
  imagePlan: string | null;
};

type ImageScene = { h2?: string; point: string; scene: string; must: string; avoid: string; url?: string };
type ImagePlan = { style: string; provider?: string; cover: ImageScene; sections: ImageScene[] };

function readPlan(raw: string | null): ImagePlan | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function ImagePlanList({ plan, regenerating, onRegenerate }: { plan: ImagePlan; regenerating: number | null; onRegenerate: (index: number) => void }) {
  const scenes = [{ label: '표지', scene: plan.cover }, ...plan.sections.map((s) => ({ label: s.h2 || '', scene: s }))];
  return (
    <div className="not-prose space-y-2">
      <p className="text-slate-600">
        <b>스타일</b> {plan.style} {plan.provider && <span className="text-slate-400">· {plan.provider}</span>}
      </p>
      {scenes.map(({ label, scene }, index) => (
        <div key={index} className="flex gap-3 items-start bg-white border border-slate-200 rounded p-2">
          {scene.url ? <img src={scene.url} alt={scene.point} className="w-28 h-16 object-cover rounded shrink-0 bg-slate-100" /> : <div className="w-28 h-16 rounded bg-slate-100 shrink-0" />}
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="font-semibold text-slate-800 truncate">{label}</p>
            <p className="text-slate-600">{scene.scene}</p>
            <p className="text-slate-400">필수: {scene.must} · 제외: {scene.avoid}</p>
          </div>
          {scene.url && (
            <button
              onClick={() => onRegenerate(index)}
              disabled={regenerating !== null}
              className="shrink-0 border border-slate-300 rounded px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
            >
              <RotateCw size={11} className={regenerating === index ? 'animate-spin' : ''} /> 다시 생성
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-slate-100 pt-2">
      <button onClick={() => setOpen(!open)} className="text-xs font-semibold text-slate-600 flex items-center gap-1 hover:text-slate-900">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {title}
      </button>
      {open && (
        <div className="prose prose-xs prose-slate max-w-none text-xs mt-2 bg-slate-50 p-3 rounded border border-slate-200">
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
    <div className="mb-4 border border-slate-200 rounded-md p-3 space-y-2 bg-white">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {STAGES.map((s, i) => {
          const done = i < current || post.stage === 'READY';
          const active = i === current && post.stage !== 'READY';
          const style = done
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : active && failed
              ? 'bg-red-50 text-red-700 border-red-300'
              : active
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-slate-50 text-slate-400 border-slate-200';
          const mark = done ? '✓' : active ? (failed ? '✕' : '●') : '';
          return (
            <span key={s.key} className={`px-2 py-0.5 rounded border font-semibold ${style}`}>
              {mark} {s.label}
            </span>
          );
        })}
      </div>

      {failed && (
        <div className="flex items-start justify-between gap-3 bg-red-50 border border-red-200 rounded p-2">
          <p className="text-xs text-red-700 break-all">{post.stageError}</p>
          <button
            onClick={onResume}
            disabled={resuming}
            className="text-xs bg-white border border-red-300 text-red-700 px-2.5 py-1 rounded font-semibold hover:bg-red-100 flex items-center gap-1 shrink-0 disabled:opacity-50"
          >
            <RotateCw size={12} className={resuming ? 'animate-spin' : ''} /> {resuming ? '진행 중...' : '이어하기'}
          </button>
        </div>
      )}
      {!failed && post.stage !== 'READY' && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-blue-700">다음 실행에서 이어서 진행합니다.</p>
          <button onClick={onResume} disabled={resuming} className="text-xs border border-blue-300 text-blue-700 px-2.5 py-1 rounded font-semibold hover:bg-blue-50 disabled:opacity-50">
            {resuming ? '진행 중...' : '지금 진행'}
          </button>
        </div>
      )}

      {post.sources && (
        <Section title="출처 · 확인일">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.sources}</ReactMarkdown>
        </Section>
      )}
      {plan && (
        <Section title={`이미지 계획 · ${1 + plan.sections.length}장`}>
          <ImagePlanList plan={plan} regenerating={regenerating} onRegenerate={handleRegenerate} />
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
