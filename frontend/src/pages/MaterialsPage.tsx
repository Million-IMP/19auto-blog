import { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import { Trash2, PenTool, Link as LinkIcon, Wand2 } from 'lucide-react';

export function MaterialsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  
  const [extractUrl, setExtractUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [viewReady, setViewReady] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const requestSeq = useRef(0);

  const loadMaterials = () => {
    const seq = ++requestSeq.current;
    setLoadError('');
    axios.get('/api/materials')
      .then((res) => {
        if (seq !== requestSeq.current) return;
        setItems(res.data);
        setViewReady(true);
      })
      .catch((e) => {
        if (seq === requestSeq.current) {
          setLoadError(e.response?.data?.error || '재료 목록을 불러오지 못했습니다.');
        }
      });
  };

  useEffect(() => {
    loadMaterials();
  }, []);

  const handleExtract = async () => {
    if (!extractUrl.trim()) return alert("URL을 입력해주세요.");
    setIsExtracting(true);
    try {
      const res = await axios.post('/api/materials/extract', { url: extractUrl });
      setTitle(res.data.title);
      setContent(res.data.content);
      alert("구조 추출이 완료되었습니다. 내용을 확인하고 '템플릿 추가하기'를 눌러 저장하세요.");
      setExtractUrl('');
    } catch (e: any) {
      alert(e.response?.data?.error || "구조 추출 중 오류가 발생했습니다.");
    }
    setIsExtracting(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      await axios.post('/api/materials', {
        title: title.trim() || "기본 글감 구조",
        content: content,
      });
      setTitle('');
      setContent('');
      loadMaterials();
    } catch (e: any) {
      alert(e.response?.data?.error || "추가 중 오류가 발생했습니다.");
    }
  };

  const handleToggleActive = async (id: number) => {
    try {
      await axios.put(`/api/materials/${id}/toggle`);
      loadMaterials();
    } catch (e: any) {
      alert(e.response?.data?.error || '기본 적용을 바꾸지 못했습니다.');
    }
  };

  const startEdit = (item: { id: number; title?: string | null; content?: string | null }) => {
    setEditingId(item.id);
    setEditTitle(item.title || '');
    setEditContent(item.content || '');
  };

  const handleSaveEdit = async () => {
    if (editingId == null) return;
    if (!editContent.trim()) return alert('내용을 입력해주세요.');
    try {
      await axios.put(`/api/materials/${editingId}`, {
        title: editTitle.trim() || '기본 글감 구조',
        content: editContent,
      });
      setEditingId(null);
      loadMaterials();
    } catch (e: any) {
      alert(e.response?.data?.error || '수정 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("이 템플릿을 삭제하시겠습니까?")) return;
    try {
      await axios.delete(`/api/materials/${id}`);
      loadMaterials();
    } catch (e: any) {
      alert(e.response?.data?.error || "삭제 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-end mb-6 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">1 재료 베이스 (글감 구조)</h1>
          <p className="text-sm text-slate-500 mt-1">블로그 글 작성 시 기본 뼈대가 될 '목차'나 '글의 흐름(템플릿)'을 관리합니다.</p>
        </div>
      </div>
      
      <div className="bg-white border border-slate-200 rounded-lg p-5 mb-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2"><PenTool size={16} className="text-emerald-500"/> 새 글감 템플릿 등록</h3>
        
        {/* 벤치마킹 URL 추출부 */}
        <div className="mb-4 p-4 bg-emerald-50 rounded-md border border-emerald-100 flex flex-col md:flex-row gap-3 items-start md:items-center">
          <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm shrink-0">
            <LinkIcon size={16} /> URL로 구조 벤치마킹
          </div>
          <div className="flex-1 flex gap-2 w-full">
            <input 
              type="text" 
              value={extractUrl}
              onChange={(e) => setExtractUrl(e.target.value)}
              placeholder="참고하고 싶은 잘 쓰인 블로그 글의 URL을 붙여넣으세요"
              className="flex-1 p-2 text-sm border border-emerald-200 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white"
            />
            <button 
              type="button" 
              onClick={handleExtract}
              disabled={isExtracting}
              className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-emerald-700 transition shadow-sm flex items-center gap-1.5 disabled:opacity-50 shrink-0"
            >
              {isExtracting ? <span className="animate-pulse">분석 중...</span> : <><Wand2 size={14} /> AI 뼈대 추출</>}
            </button>
          </div>
        </div>

        <form onSubmit={handleAdd} className="flex flex-col gap-3">
          <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="템플릿 이름 (예: IT 제품 리뷰 기본 구조)"
            className="w-full p-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-slate-50 font-semibold"
          />
          <textarea 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="템플릿 내용 (예: 1. 첫인상 및 스펙 요약 2. 실사용 장점 3가지 3. 아쉬운 점 1가지 4. 구매를 추천하는 대상과 총평)"
            rows={4}
            className="w-full p-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-slate-50 resize-y"
          />
          <button type="submit" className="self-end bg-slate-800 text-white px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-slate-900 transition shadow-sm">
            직접 작성 / 추출된 템플릿 저장하기
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loadError && (
          <div className="col-span-full py-8 text-center bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{loadError}</div>
        )}
        {!loadError && !viewReady && (
          <div className="col-span-full py-12 text-center text-slate-400 text-sm">불러오는 중...</div>
        )}
        {!loadError && viewReady && items.length === 0 && (
          <div className="col-span-full py-12 text-center bg-white border border-dashed border-slate-300 rounded-lg text-slate-500 text-sm">
            <>등록된 재료 템플릿이 없습니다.<br/>위에서 자주 쓰는 글의 구조를 등록해보세요!</>
          </div>
        )}
        {viewReady && items.map(item => {
          const editing = editingId === item.id;
          return (
          <div key={item.id} className={`bg-white p-5 rounded-lg shadow-sm border transition flex flex-col min-h-[140px] ${item.isActive ? 'border-orange-300 ring-1 ring-orange-300' : 'border-slate-200'}`}>
            <div className="flex-1">
              {editing ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full p-2 text-sm border border-emerald-300 rounded-md font-semibold"
                    aria-label="재료 이름"
                  />
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={5}
                    className="w-full p-2 text-sm border border-emerald-300 rounded-md resize-y"
                    aria-label="재료 내용"
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <h3 className="text-sm font-bold text-slate-800">{item.title || "글감 템플릿"}</h3>
                  </div>
                  <p className={`text-sm leading-relaxed whitespace-pre-wrap ${item.isActive ? 'text-slate-700' : 'text-slate-500'}`}>{item.content}</p>
                </>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className={`w-10 h-5 rounded-full p-1 flex items-center transition-colors duration-200 ease-in-out ${item.isActive ? 'bg-orange-500' : 'bg-slate-300'}`}>
                  <div className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${item.isActive ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </div>
                <input type="checkbox" className="hidden" checked={!!item.isActive} onChange={() => handleToggleActive(item.id)} />
                <span className={`text-xs font-semibold ${item.isActive ? 'text-orange-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                  {item.isActive ? '발행 대기열 기본 적용 중' : '기본 적용 안함'}
                </span>
              </label>
              <div className="flex gap-2">
                {editing ? (
                  <>
                    <button type="button" onClick={handleSaveEdit} className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 rounded-md">저장</button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs font-semibold text-slate-600 bg-white px-2.5 py-1.5 rounded-md border border-slate-300">취소</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => startEdit(item)} className="text-xs font-semibold text-slate-700 bg-white hover:bg-emerald-50 px-2.5 py-1.5 rounded-md border border-slate-300">수정</button>
                    <button type="button" onClick={() => handleDelete(item.id)} className="text-xs font-semibold text-red-600 bg-white hover:bg-red-50 px-2.5 py-1.5 rounded-md border border-red-200 inline-flex items-center gap-1">
                      <Trash2 size={14} /> 삭제
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
