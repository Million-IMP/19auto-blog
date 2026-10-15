import { useState } from 'react';
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
};

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

export function PipelinePanel({ post, resuming, onResume }: { post: PipelinePost; resuming: boolean; onResume: () => void }) {
  const current = STAGES.findIndex((s) => s.key === post.stage);
  const failed = Boolean(post.stageError);

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
      {post.polishNotes && (
        <Section title="문체 교정 전 → 후">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.polishNotes}</ReactMarkdown>
        </Section>
      )}
    </div>
  );
}
