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

function Dashboard() { 
  const [stats, setStats] = useState({ inbox: 0, materials: 0, posts: 0 });

  useEffect(() => {
    // 임시로 Promise.all을 통해 실제 개수를 가져옵니다.
    Promise.all([
      fetch('http://localhost:3001/api/inbox').then(r => r.json()),
      fetch('http://localhost:3001/api/materials').then(r => r.json()),
      fetch('http://localhost:3001/api/posts').then(r => r.json())
    ]).then(([inboxes, materials, posts]) => {
      setStats({
        inbox: inboxes.filter((i: any) => !i.processed).length,
        materials: materials.length,
        posts: posts.length
      });
    }).catch(console.error);
  }, []);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">대시보드</h1>
          <p className="text-sm text-slate-500 mt-1">시스템 전반의 콘텐츠 수집 및 생성 현황을 파악합니다.</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Link to="/inbox" className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition cursor-pointer group">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-slate-600 group-hover:text-blue-600 transition">미처리 수집건</h3>
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition"><Inbox size={16} /></div>
          </div>
          <p className="text-3xl font-black text-slate-900">{stats.inbox}<span className="text-base font-semibold text-slate-400 ml-1">건</span></p>
          <div className="flex justify-between items-center mt-3">
            <p className="text-xs text-slate-500">오늘 새롭게 수집된 아이디어</p>
            <span className="text-xs font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition">이동하기 &rarr;</span>
          </div>
        </Link>
        <Link to="/materials" className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition cursor-pointer group">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-slate-600 group-hover:text-emerald-600 transition">활성 재료</h3>
            <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition"><Archive size={16} /></div>
          </div>
          <p className="text-3xl font-black text-slate-900">{stats.materials}<span className="text-base font-semibold text-slate-400 ml-1">개</span></p>
          <div className="flex justify-between items-center mt-3">
            <p className="text-xs text-slate-500">정제 완료된 콘텐츠 조각</p>
            <span className="text-xs font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition">이동하기 &rarr;</span>
          </div>
        </Link>
        <Link to="/posts" className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-md transition cursor-pointer group">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-slate-600 group-hover:text-indigo-600 transition">누적 발행 초안</h3>
            <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition"><FileText size={16} /></div>
          </div>
          <p className="text-3xl font-black text-slate-900">{stats.posts}<span className="text-base font-semibold text-slate-400 ml-1">건</span></p>
          <div className="flex justify-between items-center mt-3">
            <p className="text-xs text-slate-500">블로그 포스팅 준비 완료</p>
            <span className="text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition">이동하기 &rarr;</span>
          </div>
        </Link>
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
