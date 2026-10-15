import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { PenTool, CheckCircle, Copy, Trash2, Link2, Video, Image as ImageIcon, MessageCircle, Eye, EyeOff, Edit3, Save, X, BarChart2, FileCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PipelinePanel } from '../components/PipelinePanel';

const API_URL = '/api';

function apiErrorMessage(error: unknown, fallback: string) {
  const body = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return body || fallback;
}

export function PostsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') === 'published'
    ? 'published'
    : searchParams.get('status') === 'draft'
      ? 'draft'
      : 'all';
  const [inboxes, setInboxes] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  
  const [posts, setPosts] = useState<any[]>([]);
  
  const [selectedInboxIds, setSelectedInboxIds] = useState<number[]>([]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<number[]>([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState<number[]>([]);
  
  const [keyword, setKeyword] = useState('');
  const [generating, setGenerating] = useState(false);
  
  const [osmuLoading, setOsmuLoading] = useState<number | null>(null);
  const [resumingId, setResumingId] = useState<number | null>(null);
  const [publishUrls, setPublishUrls] = useState<{[key: number]: string}>({});
  const [rawViewIds, setRawViewIds] = useState<number[]>([]);

  // 인라인 수정 상태
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  const toggleRawView = (id: number) => {
    setRawViewIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  useEffect(() => {
    fetchFormData();
    fetchPosts();
  }, []);

  const fetchFormData = async () => {
    const [resInboxes, resMaterials, resRules] = await Promise.all([
      axios.get(`${API_URL}/inbox`),
      axios.get(`${API_URL}/materials`),
      axios.get(`${API_URL}/rules`),
    ]);
    // 처리 안된 수집함 데이터만 보여줌
    setInboxes(resInboxes.data.filter((i: any) => !i.processed));
    setMaterials(resMaterials.data);
    setRules(resRules.data);
  };

  const fetchPosts = () => {
    axios.get(`${API_URL}/posts`).then(res => setPosts(res.data)).catch((e) => {
      alert(apiErrorMessage(e, "초안 목록을 불러오지 못했습니다."));
    });
  }

  const visiblePosts = posts.filter((post) => {
    if (statusFilter === 'draft') return post.status === 'DRAFT';
    if (statusFilter === 'published') return post.status === 'PUBLISHED';
    return true;
  });

  const setStatusFilter = (next: 'all' | 'draft' | 'published') => {
    if (next === 'all') setSearchParams({});
    else setSearchParams({ status: next });
  };

  const toggleSelectInbox = (id: number) => setSelectedInboxIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const toggleSelectMaterial = (id: number) => setSelectedMaterialIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const toggleSelectRule = (id: number) => setSelectedRuleIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const handleGenerate = async () => {
    // keyword가 비어있어도 진행 (AI가 알아서 최적화)
    
    setGenerating(true);
    try {
      const res = await axios.post(`${API_URL}/posts/generate`, {
        keyword,
        inboxIds: selectedInboxIds,
        materialIds: selectedMaterialIds,
        ruleIds: selectedRuleIds
      });
      if (res.data?.stageError) {
        alert(`초안 작성이 멈췄습니다: ${res.data.stageError}\n글 카드의 '이어하기'로 멈춘 단계부터 다시 시작할 수 있습니다.`);
      }
      fetchPosts();
      await fetchFormData(); // 수집함 및 규칙 상태 갱신 (await 추가)
      setKeyword('');
      setSelectedInboxIds([]);
      setSelectedMaterialIds([]);
      setSelectedRuleIds([]);
    } catch (e) {
      alert(apiErrorMessage(e, "글 생성 중 오류가 발생했습니다."));
    }
    setGenerating(false);
  };

  const handlePublish = async (id: number) => {
    const url = publishUrls[id];
    if (!url) return alert("발행된 URL을 입력해주세요.");
    try {
      await axios.put(`${API_URL}/posts/${id}/publish`, { publishedUrl: url });
      alert("발행 완료 처리되었습니다.");
      fetchPosts();
    } catch (e) {
      alert(apiErrorMessage(e, "처리 중 오류가 발생했습니다."));
    }
  };

  const handleOSMU = async (id: number, platform: string) => {
    setOsmuLoading(id);
    try {
      await axios.post(`${API_URL}/posts/${id}/osmu`, { platform });
      alert(`${platform}용 콘텐츠가 생성되었습니다!`);
      fetchPosts();
    } catch (e) {
      alert(apiErrorMessage(e, "OSMU 변환 중 오류가 발생했습니다."));
    }
    setOsmuLoading(null);
  };

  const handleResume = async (id: number) => {
    setResumingId(id);
    try {
      const res = await axios.post(`${API_URL}/posts/${id}/resume`);
      if (res.data?.stageError) alert(`다시 멈췄습니다: ${res.data.stageError}`);
      fetchPosts();
    } catch (e) {
      alert(apiErrorMessage(e, "이어하기 중 오류가 발생했습니다."));
    }
    setResumingId(null);
  };

  const handleStartEdit = (post: any) => {
    setEditingPostId(post.id);
    setEditTitle(post.title);
    setEditContent(post.content);
  };

  const handleCancelEdit = () => {
    setEditingPostId(null);
    setEditTitle('');
    setEditContent('');
  };

  const handleSaveEdit = async (id: number) => {
    try {
      await axios.put(`${API_URL}/posts/${id}`, {
        title: editTitle,
        content: editContent
      });
      alert("수정 내용이 저장되었습니다.");
      setEditingPostId(null);
      fetchPosts();
    } catch (e) {
      alert(apiErrorMessage(e, "수정 저장 중 오류가 발생했습니다."));
    }
  };

  // 실시간 SEO 통계 계산
  const getSeoStats = (content: string, keyword: string | null) => {
    const cleanContent = content.replace(/!\[.*?\]\(.*?\)/g, '').replace(/https?:\/\/[^\s]+/g, '');
    const charCount = cleanContent.replace(/\s/g, '').length;
    const readingMinutes = Math.max(1, Math.ceil(charCount / 500));
    let keywordCount = 0;
    if (keyword && keyword.trim()) {
      const reg = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      keywordCount = (content.match(reg) || []).length;
    }
    const h2Count = (content.match(/^##\s+/gm) || []).length;
    const imgCount = (content.match(/!\[.*?\]\(.*?\)/g) || []).length;
    return { charCount, readingMinutes, keywordCount, h2Count, imgCount };
  };

  // 네이버 블로그 서식(HTML) 복사
  const handleCopyNaverHtml = async (postId: number) => {
    const el = document.getElementById(`post-preview-${postId}`);
    if (!el) return;
    try {
      const styledHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; font-size: 16px; line-height: 1.8; color: #222;">
          ${el.innerHTML}
        </div>
      `;
      const blobHtml = new Blob([styledHtml], { type: 'text/html' });
      const blobText = new Blob([el.innerText], { type: 'text/plain' });
      const item = new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobText
      });
      await navigator.clipboard.write([item]);
      alert("✅ 네이버 블로그 맞춤 서식(HTML)이 복사되었습니다!\n네이버 스마트에디터에 바로 붙여넣기(Ctrl+V) 하시면 소제목, 이미지 등이 그대로 유지됩니다.");
    } catch (e) {
      navigator.clipboard.writeText(el.innerText);
      alert("서식 복사가 일반 텍스트로 대체 복사되었습니다.");
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto h-[calc(100vh-1rem)] flex flex-col lg:flex-row gap-6 overflow-hidden">
      
      {/* Left: Generator Form */}
      <div className="w-full lg:w-[380px] flex flex-col h-full shrink-0">
        <div className="mb-4 pb-2 border-b border-slate-200">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">작업실</h1>
          <p className="text-sm text-slate-500 mt-1">자료와 규칙을 조합해 초안을 생성합니다.</p>
        </div>
        
        <div className="bg-white p-5 rounded-lg border border-slate-200 flex-1 overflow-auto flex flex-col shadow-sm">
          <div className="mb-5 shrink-0">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">타겟 키워드 (선택)</label>
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="비워두시면 AI가 자동 도출" className="w-full p-2.5 text-sm border border-slate-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-slate-50" />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">수집 자료의 RSS 채널에 규칙이 있으면 그 규칙을 먼저 씁니다. 키워드를 적으면 그 키워드를 따릅니다. 글감과 규칙을 고르지 않으면 기본 글쓰기로 진행합니다.</p>
          </div>
          
          <div className="space-y-6 overflow-y-auto pr-1 pb-2 flex-1 scrollbar-thin">
            
            {/* 1. 수집함 데이터 선택 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex justify-between items-center">
                <span>0. 수집된 원시 자료</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{inboxes.length}건</span>
              </label>
              <div className="space-y-2">
                {inboxes.length === 0 && <p className="text-xs text-slate-400 italic">처리할 수집 자료가 없습니다.</p>}
                {inboxes.map(item => (
                  <label key={item.id} className={`flex items-start gap-2 p-2.5 border rounded-md cursor-pointer transition ${selectedInboxIds.includes(item.id) ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-slate-200 hover:bg-slate-50 text-slate-700'}`}>
                    <input type="checkbox" checked={selectedInboxIds.includes(item.id)} onChange={() => toggleSelectInbox(item.id)} className="mt-0.5" />
                    <p className="text-xs leading-relaxed line-clamp-2">{item.content}</p>
                  </label>
                ))}
              </div>
            </div>

            {/* 2. 재료 템플릿 선택 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex justify-between items-center">
                <span>1. 글감 템플릿</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{materials.length}건</span>
              </label>
              <div className="space-y-2">
                {materials.length === 0 && <p className="text-xs text-slate-400 italic">등록된 글감 템플릿이 없습니다.</p>}
                {materials.map(m => (
                  <label key={m.id} className={`flex items-start gap-2 p-2.5 border rounded-md cursor-pointer transition ${selectedMaterialIds.includes(m.id) ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-slate-200 hover:bg-slate-50 text-slate-700'}`}>
                    <input type="checkbox" checked={selectedMaterialIds.includes(m.id)} onChange={() => toggleSelectMaterial(m.id)} className="mt-0.5" />
                    <p className="text-xs leading-relaxed line-clamp-2">{m.content}</p>
                  </label>
                ))}
              </div>
            </div>

            {/* 3. 규칙 템플릿 선택 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex justify-between items-center">
                <span>2. 규칙 템플릿</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{rules.length}건</span>
              </label>
              <div className="space-y-2">
                {rules.length === 0 && <p className="text-xs text-slate-400 italic">등록된 규칙이 없습니다.</p>}
                {rules.map(r => (
                  <label key={r.id} className={`flex items-start gap-2 p-2.5 border rounded-md cursor-pointer transition ${selectedRuleIds.includes(r.id) ? 'border-orange-500 bg-orange-50 text-orange-900' : 'border-slate-200 hover:bg-slate-50 text-slate-700'}`}>
                    <input type="checkbox" checked={selectedRuleIds.includes(r.id)} onChange={() => toggleSelectRule(r.id)} className="mt-0.5" />
                    <p className="text-xs leading-relaxed line-clamp-2">{r.content}</p>
                  </label>
                ))}
              </div>
            </div>

          </div>
        </div>
        <button onClick={handleGenerate} disabled={generating} className="mt-4 w-full bg-blue-600 text-white py-3 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 flex justify-center items-center gap-2 shrink-0 transition disabled:opacity-70 disabled:cursor-not-allowed">
          {generating ? <span className="animate-pulse flex items-center gap-2"><PenTool size={16}/> AI 초안 작성 중...</span> : <><PenTool size={16} /> 초안 생성 실행</>}
        </button>
      </div>

      {/* Right: Generated Posts List */}
      <div className="w-full lg:flex-1 flex flex-col h-full bg-slate-50 rounded-xl border border-slate-200 overflow-hidden shadow-inner">
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            3 발행 대기열 ({visiblePosts.length})
          </h2>
          <div className="flex gap-1">
            {([['all', '전체'], ['draft', '초안'], ['published', '발행']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${statusFilter === key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {visiblePosts.length === 0 && (
             <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3">
               <PenTool size={32} className="opacity-20" />
               <p className="text-sm">
                 {statusFilter === 'published' ? '발행된 글이 없습니다.' : statusFilter === 'draft' ? '대기 중인 초안이 없습니다.' : '생성된 초안이 없습니다. 왼쪽 패널에서 생성해보세요.'}
               </p>
             </div>
          )}
          {visiblePosts.map(post => {
            const seo = getSeoStats(post.content, post.keyword);
            const isEditing = editingPostId === post.id;

            return (
              <div key={post.id} className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                
                {/* Header */}
                <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-3">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2 mb-2">
                      {post.platform === 'NAVER_BLOG' && <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">네이버 블로그</span>}
                      {post.platform === 'INSTA' && <span className="bg-pink-100 text-pink-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">인스타그램</span>}
                      {post.platform === 'SHORTS' && <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">유튜브 쇼츠</span>}
                      {post.platform === 'THREADS' && <span className="bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">스레드</span>}
                      
                      {post.status === 'PUBLISHED' ? (
                        <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[10px] px-2 py-0.5 rounded font-bold flex items-center gap-1 uppercase tracking-wider"><Link2 size={10}/> 발행됨</span>
                      ) : (
                        <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">대기중</span>
                      )}
                    </div>

                    {isEditing ? (
                      <input 
                        type="text" 
                        value={editTitle} 
                        onChange={(e) => setEditTitle(e.target.value)} 
                        className="w-full text-lg font-bold text-slate-900 border border-blue-400 p-2 rounded-md focus:outline-none bg-blue-50/30"
                      />
                    ) : (
                      <h3 className="text-lg font-bold text-slate-900 leading-snug">{post.title}</h3>
                    )}

                    {post.keyword && (
                      <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                        <span className="text-slate-400">🎯 타겟 키워드:</span> 
                        <span className="font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">{post.keyword}</span>
                      </p>
                    )}
                  </div>

                  {/* Top action buttons */}
                  <div className="flex items-center gap-2 shrink-0 self-start">
                    {!isEditing && (
                      <>
                        <button onClick={() => toggleRawView(post.id)} className="text-xs bg-white text-slate-700 border border-slate-300 px-2.5 py-1.5 rounded-md font-semibold hover:bg-slate-50 flex items-center gap-1.5 transition shadow-sm">
                          {!rawViewIds.includes(post.id) ? <><EyeOff size={14} className="text-slate-500" /> 원문보기</> : <><Eye size={14} className="text-blue-500" /> 미리보기</>}
                        </button>
                        <button onClick={() => handleStartEdit(post)} className="text-xs bg-white text-blue-600 border border-blue-200 px-2.5 py-1.5 rounded-md font-semibold hover:bg-blue-50 flex items-center gap-1.5 transition shadow-sm" title="직접 본문 수정">
                          <Edit3 size={14} /> 수정
                        </button>
                      </>
                    )}
                    <button onClick={async () => {
                      if (confirm("이 초안을 삭제하시겠습니까?")) {
                        try {
                          await axios.delete(`${API_URL}/posts/${post.id}`);
                          fetchPosts();
                        } catch (e) {
                          alert(apiErrorMessage(e, "삭제 중 오류가 발생했습니다."));
                        }
                      }
                    }} className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition" title="삭제">
                      <Trash2 size={16}/>
                    </button>
                  </div>
                </div>

                {/* 실시간 SEO & GEO 스코어보드 */}
                <div className="mb-4 bg-slate-50 border border-slate-200 rounded-md p-2.5 flex flex-wrap gap-3 items-center text-xs">
                  <span className="font-bold text-slate-500 flex items-center gap-1 shrink-0"><BarChart2 size={13} className="text-blue-500"/> SEO 지표:</span>
                  <span className={`px-2 py-0.5 rounded font-semibold border ${seo.keywordCount >= 3 && seo.keywordCount <= 6 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    키워드 밀도: {seo.keywordCount}회 {seo.keywordCount >= 3 && seo.keywordCount <= 6 ? '✅ 적정' : '⚠️ 3~6회 권장'}
                  </span>
                  <span className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">
                    본문 분량: <strong>{seo.charCount.toLocaleString()}</strong>자 (약 {seo.readingMinutes}분 완독)
                  </span>
                  <span className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">
                    소제목: <strong>{seo.h2Count}</strong>개
                  </span>
                  <span className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">
                    시각 자료: <strong>{seo.imgCount}</strong>장
                  </span>
                </div>
                
                {post.brief && (
                  <PipelinePanel post={post} resuming={resumingId === post.id} onResume={() => handleResume(post.id)} onChanged={fetchPosts} />
                )}

                {/* Content body / Inline editor */}
                {isEditing ? (
                  <div className="space-y-3">
                    <textarea 
                      value={editContent} 
                      onChange={(e) => setEditContent(e.target.value)} 
                      rows={14} 
                      className="w-full p-4 text-sm font-mono border border-blue-400 rounded-md focus:outline-none bg-white leading-relaxed resize-y shadow-inner"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={handleCancelEdit} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-md font-semibold flex items-center gap-1 transition">
                        <X size={14}/> 취소
                      </button>
                      <button onClick={() => handleSaveEdit(post.id)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md font-semibold flex items-center gap-1 shadow-sm transition">
                        <Save size={14}/> 수정 저장 완료
                      </button>
                    </div>
                  </div>
                ) : (
                  <div 
                    id={`post-preview-${post.id}`} 
                    className={`prose prose-sm prose-slate max-w-none text-slate-800 bg-slate-50 p-4 rounded-md border border-slate-200 leading-relaxed text-sm ${!rawViewIds.includes(post.id) ? '' : 'whitespace-pre-wrap'}`}
                  >
                    {!rawViewIds.includes(post.id) ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {post.content}
                      </ReactMarkdown>
                    ) : (
                      post.content
                    )}
                  </div>
                )}
                
                {/* Bottom OSMU & Publish Action Bar */}
                <div className="mt-5 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                  <div className="flex gap-2 w-full xl:w-auto">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider self-center mr-1">OSMU 변환</span>
                    <button onClick={() => handleOSMU(post.id, 'INSTA')} disabled={osmuLoading === post.id} className="text-xs bg-white text-pink-600 px-3 py-1.5 rounded-md font-medium hover:bg-pink-50 flex items-center gap-1.5 transition border border-slate-200 hover:border-pink-200 shadow-sm">
                      <ImageIcon size={14}/> 인스타
                    </button>
                    <button onClick={() => handleOSMU(post.id, 'SHORTS')} disabled={osmuLoading === post.id} className="text-xs bg-white text-red-600 px-3 py-1.5 rounded-md font-medium hover:bg-red-50 flex items-center gap-1.5 transition border border-slate-200 hover:border-red-200 shadow-sm">
                      <Video size={14}/> 숏츠
                    </button>
                    <button onClick={() => handleOSMU(post.id, 'THREADS')} disabled={osmuLoading === post.id} className="text-xs bg-white text-slate-700 px-3 py-1.5 rounded-md font-medium hover:bg-slate-100 flex items-center gap-1.5 transition border border-slate-200 hover:border-slate-300 shadow-sm">
                      <MessageCircle size={14}/> 스레드
                    </button>
                    {osmuLoading === post.id && <span className="text-xs text-blue-500 animate-pulse self-center ml-2">변환 중...</span>}
                  </div>

                  <div className="flex flex-col xl:flex-row items-end xl:items-center gap-2 w-full xl:w-auto">
                    {post.status === 'DRAFT' && (
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="발행된 URL 입력" 
                          className="text-xs p-2 border border-slate-300 rounded-md focus:outline-none focus:border-blue-500 w-48 bg-slate-50"
                          value={publishUrls[post.id] || ''}
                          onChange={(e) => setPublishUrls({...publishUrls, [post.id]: e.target.value})}
                        />
                        <button onClick={() => handlePublish(post.id)} className="text-xs bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-md font-semibold hover:bg-slate-50 flex items-center gap-1.5 transition shadow-sm">
                          <CheckCircle size={14} className="text-green-600"/> 발행 처리
                        </button>
                      </div>
                    )}
                    {post.status === 'PUBLISHED' && post.publishedUrl && (
                      <a href={post.publishedUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mr-2 font-medium">
                        <Link2 size={14}/> 발행 링크 열기
                      </a>
                    )}
                    
                    {/* 네이버 스마트에디터 맞춤 서식 복사 버튼 */}
                    <button onClick={() => handleCopyNaverHtml(post.id)} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-md font-semibold flex items-center gap-1.5 transition shadow-sm" title="네이버 블로그 에디터에 붙여넣을 때 서식/이미지가 유지됩니다">
                      <FileCheck size={14}/> 네이버 서식 복사
                    </button>

                    <button onClick={() => {
                      navigator.clipboard.writeText(post.content);
                      alert("텍스트가 복사되었습니다!");
                    }} className="text-xs bg-slate-800 text-white px-3.5 py-2 rounded-md font-medium hover:bg-slate-900 flex items-center gap-1.5 transition shadow-sm">
                      <Copy size={14}/> 텍스트 복사
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
