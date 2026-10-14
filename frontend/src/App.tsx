import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Home, Inbox, Archive, BookOpen, FileText, Bot } from 'lucide-react';
import { InboxPage } from './pages/InboxPage';
import { MaterialsPage } from './pages/MaterialsPage';
import { RulesPage } from './pages/RulesPage';
import { PostsPage } from './pages/PostsPage';

function Sidebar() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path ? 'bg-blue-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:bg-slate-800 hover:text-white';

  return (
    <div className="w-64 bg-slate-900 h-screen border-r border-slate-800 flex flex-col shrink-0">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <span className="text-white text-lg">A</span>
          </div>
          AUTO<span className="text-blue-500">BLOG</span>
        </h1>
        <p className="text-[11px] text-slate-500 mt-2 font-medium tracking-wide uppercase">콘텐츠 워크플로우 자동화</p>
      </div>
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        <Link to="/" className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition text-sm ${isActive('/')}`}>
          <Home size={18} />
          <span>대시보드</span>
        </Link>
        <div className="pt-6 pb-2">
          <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">데이터 수집</p>
        </div>
        <Link to="/inbox" className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition text-sm ${isActive('/inbox')}`}>
          <Inbox size={18} />
          <span>0 수집함</span>
        </Link>
        <div className="pt-6 pb-2">
          <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">자산 관리</p>
        </div>
        <Link to="/materials" className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition text-sm ${isActive('/materials')}`}>
          <Archive size={18} />
          <span>1 재료 베이스</span>
        </Link>
        <Link to="/rules" className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition text-sm ${isActive('/rules')}`}>
          <BookOpen size={18} />
          <span>2 규칙 (프롬프트)</span>
        </Link>
        <div className="pt-6 pb-2">
          <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">생산 및 배포</p>
        </div>
        <Link to="/posts" className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition text-sm ${isActive('/posts')}`}>
          <FileText size={18} />
          <span>3 발행 대기열</span>
        </Link>
      </nav>
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
            <span className="text-slate-300 text-xs font-bold">JK</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">JK님</p>
            <p className="text-xs text-slate-500">Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}

type DashboardStats = {
  inboxUnprocessed: number;
  materialsActive: number;
  drafts: number;
  published: number;
  activeRss: number;
  lastLog: { event: string; message: string; createdAt: string } | null;
};

type MaterialOption = { id: number; title: string | null };
type AutoConfig = {
  enabled: boolean;
  batchSize: number;
  autoOsmu: boolean;
  templateMaterialId: number | null;
  failedCount: number;
};

function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [auto, setAuto] = useState<AutoConfig | null>(null);
  const [autoMsg, setAutoMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const load = () => {
    fetch('http://localhost:3001/api/stats')
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || '집계를 불러오지 못했습니다.');
        setStats(body);
      })
      .catch((e: Error) => setError(e.message || '집계를 불러오지 못했습니다.'));

    fetch('http://localhost:3001/api/automation')
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || '자동 작성 설정을 불러오지 못했습니다.');
        setAuto(body);
      })
      .catch((e: Error) => setError(e.message || '자동 작성 설정을 불러오지 못했습니다.'));

    fetch('http://localhost:3001/api/materials')
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) return;
        setMaterials(body.map((item: MaterialOption) => ({ id: item.id, title: item.title })));
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
  }, []);

  const saveAuto = async () => {
    if (!auto) return;
    setSaving(true);
    setAutoMsg('');
    try {
      const r = await fetch('http://localhost:3001/api/automation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(auto),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || '설정을 저장하지 못했습니다.');
      setAuto(body);
      setAutoMsg('설정을 저장했습니다.');
    } catch (e) {
      setAutoMsg(e instanceof Error ? e.message : '설정을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const runAuto = async () => {
    setRunning(true);
    setAutoMsg('수집을 확인하고 초안을 작성하는 중입니다.');
    try {
      const r = await fetch('http://localhost:3001/api/automation/run', {
        method: 'POST',
        signal: AbortSignal.timeout(180000),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || '자동 작성에 실패했습니다.');
      const line = body.skipped
        ? (body.messages?.[0] || '이미 실행 중입니다.')
        : `수집 ${body.addedCount ?? 0}건. 초안 ${body.drafted}건, 분류 ${body.classified}건, 파생 ${body.osmu}건, 실패 ${body.failed}건. ${(body.messages || []).join(' / ')}`;
      setAutoMsg(line);
      load();
    } catch (e) {
      setAutoMsg(e instanceof Error ? e.message : '자동 작성에 실패했습니다.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">대시보드</h1>
          <p className="text-sm text-slate-500 mt-1">시스템 전반의 콘텐츠 수집 및 생성 현황을 파악합니다.</p>
        </div>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Link to="/inbox" className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition cursor-pointer group">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-slate-600 group-hover:text-blue-600 transition">미처리 수집</h3>
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition"><Inbox size={16} /></div>
          </div>
          <p className="text-3xl font-black text-slate-900">{stats?.inboxUnprocessed ?? '–'}<span className="text-base font-semibold text-slate-400 ml-1">건</span></p>
          <div className="flex justify-between items-center mt-3">
            <p className="text-xs text-slate-500">아직 분류하지 않은 수집함</p>
            <span className="text-xs font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition">이동하기 &rarr;</span>
          </div>
        </Link>
        <Link to="/materials" className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition cursor-pointer group">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-slate-600 group-hover:text-emerald-600 transition">활성 재료</h3>
            <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition"><Archive size={16} /></div>
          </div>
          <p className="text-3xl font-black text-slate-900">{stats?.materialsActive ?? '–'}<span className="text-base font-semibold text-slate-400 ml-1">개</span></p>
          <div className="flex justify-between items-center mt-3">
            <p className="text-xs text-slate-500">글 생성에 쓰는 템플릿</p>
            <span className="text-xs font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition">이동하기 &rarr;</span>
          </div>
        </Link>
        <Link to="/posts?status=draft" className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-md transition cursor-pointer group">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-slate-600 group-hover:text-indigo-600 transition">초안</h3>
            <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition"><FileText size={16} /></div>
          </div>
          <p className="text-3xl font-black text-slate-900">{stats?.drafts ?? '–'}<span className="text-base font-semibold text-slate-400 ml-1">건</span></p>
          <div className="flex justify-between items-center mt-3">
            <p className="text-xs text-slate-500">발행 전 대기 글</p>
            <span className="text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition">이동하기 &rarr;</span>
          </div>
        </Link>
        <Link to="/posts?status=published" className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-sky-400 hover:shadow-md transition cursor-pointer group">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-slate-600 group-hover:text-sky-600 transition">발행</h3>
            <div className="w-8 h-8 bg-sky-50 text-sky-600 rounded flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition"><FileText size={16} /></div>
          </div>
          <p className="text-3xl font-black text-slate-900">{stats?.published ?? '–'}<span className="text-base font-semibold text-slate-400 ml-1">건</span></p>
          <div className="flex justify-between items-center mt-3">
            <p className="text-xs text-slate-500">URL을 기록한 글</p>
            <span className="text-xs font-bold text-sky-600 opacity-0 group-hover:opacity-100 transition">이동하기 &rarr;</span>
          </div>
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3 mb-6">
        <div className="bg-slate-100 p-2 rounded-md"><Bot size={16} className="text-slate-600" /></div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">최근 봇 활동</h3>
          {stats?.lastLog ? (
            <p className="text-xs text-slate-500 mt-1">
              {new Date(stats.lastLog.createdAt).toLocaleString()} <span className="mx-2 text-slate-300">|</span> <span className="font-medium text-slate-700">{stats.lastLog.message}</span>
              <span className="ml-2 text-slate-400">활성 RSS {stats.activeRss}개</span>
            </p>
          ) : (
            <p className="text-xs text-slate-500 mt-1">{stats ? '아직 기록된 봇 활동이 없습니다.' : '집계를 불러오는 중입니다.'}</p>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">자동 작성</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              매시간 정각에 새 글을 모은 뒤, 아직 초안이 없는 최신 수집 항목을 네이버 블로그 초안으로 만듭니다.
              채널에 규칙이나 글감이 있으면 그것을 먼저 씁니다. 여기 글 뼈대는 채널에 글감이 없을 때의 기본입니다.
              한 번에 최대 3건입니다. 발행 URL은 발행 대기열에서 기록합니다.
            </p>
          </div>
          {auto && (
            <button
              type="button"
              onClick={() => setAuto({ ...auto, enabled: !auto.enabled })}
              className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-md border transition ${auto.enabled ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300'}`}
            >
              {auto.enabled ? '자동 작성 켜짐' : '자동 작성 꺼짐'}
            </button>
          )}
        </div>

        {auto && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs font-semibold text-slate-600">
              한 번에
              <select
                value={auto.batchSize}
                onChange={(e) => setAuto({ ...auto, batchSize: Number(e.target.value) })}
                className="mt-1 w-full p-2 text-sm border border-slate-300 rounded-md bg-slate-50"
              >
                <option value={1}>1건</option>
                <option value={2}>2건</option>
                <option value={3}>3건</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600 md:col-span-2">
              글 뼈대
              <select
                value={auto.templateMaterialId ?? ''}
                onChange={(e) => setAuto({ ...auto, templateMaterialId: e.target.value ? Number(e.target.value) : null })}
                className="mt-1 w-full p-2 text-sm border border-slate-300 rounded-md bg-slate-50"
              >
                <option value="">없음. 기본 글쓰기</option>
                {materials.map((item) => (
                  <option key={item.id} value={item.id}>{item.title || `재료 #${item.id}`}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {auto && (
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={auto.autoOsmu}
              onChange={(e) => setAuto({ ...auto, autoOsmu: e.target.checked })}
            />
            블로그 초안 뒤에 인스타, 숏츠, 스레드 글도 만들기
          </label>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveAuto}
            disabled={!auto || saving || running}
            className="bg-white text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '설정 저장'}
          </button>
          <button
            type="button"
            onClick={runAuto}
            disabled={running}
            className="bg-blue-600 text-white px-3.5 py-1.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? '작성 중...' : '지금 한 바퀴'}
          </button>
          {auto && auto.failedCount > 0 && (
            <span className="text-xs text-red-600">실패 {auto.failedCount}건은 수집함에서 다시 시도할 수 있습니다.</span>
          )}
        </div>
        {autoMsg && <p className="mt-3 text-xs text-slate-700 leading-relaxed">{autoMsg}</p>}
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-900 font-sans">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-slate-50">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/materials" element={<MaterialsPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/posts" element={<PostsPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
