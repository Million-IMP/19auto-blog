import { useState, useEffect } from 'react';
import axios from 'axios';
import { Trash2, PenTool, Link as LinkIcon, Wand2 } from 'lucide-react';

export function MaterialsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  
  const [extractUrl, setExtractUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  const fetchMaterials = () => {
    axios.get('http://localhost:3001/api/materials').then(res => setItems(res.data));
  };

  useEffect(() => {
    fetchMaterials();
  }, []);

  const handleExtract = async () => {
    if (!extractUrl.trim()) return alert("URL을 입력해주세요.");
    setIsExtracting(true);
    try {
      const res = await axios.post('http://localhost:3001/api/materials/extract', { url: extractUrl });
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
      await axios.post('http://localhost:3001/api/materials', {
        title: title.trim() || "기본 글감 구조",
        content: content,
      });
      setTitle('');
      setContent('');
      fetchMaterials();
    } catch (e) {
      alert("추가 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("이 템플릿을 삭제하시겠습니까?")) return;
    try {
      await axios.delete(`http://localhost:3001/api/materials/${id}`);
      fetchMaterials();
    } catch (e) {
      alert("삭제 중 오류가 발생했습니다.");
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
        {items.length === 0 && (
          <div className="col-span-full py-12 text-center bg-white border border-dashed border-slate-300 rounded-lg text-slate-500 text-sm">
            등록된 재료 템플릿이 없습니다.<br/>위에서 자주 쓰는 글의 구조를 등록해보세요!
          </div>
        )}
        {items.map(item => (
          <div key={item.id} className="bg-white p-5 rounded-lg shadow-sm border border-slate-200 hover:border-emerald-300 transition relative group flex flex-col min-h-[140px]">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <h3 className="text-sm font-bold text-slate-800">{item.title || "글감 템플릿"}</h3>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap pr-4">{item.content}</p>
            </div>
            <button 
              onClick={() => handleDelete(item.id)}
              className="absolute top-4 right-4 text-slate-300 hover:text-red-500 bg-white hover:bg-red-50 p-1.5 rounded transition opacity-0 group-hover:opacity-100 shadow-sm border border-transparent group-hover:border-red-100"
              title="삭제"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
