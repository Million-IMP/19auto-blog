import { useState, useEffect } from 'react';
import axios from 'axios';
import { Trash2, AlertCircle } from 'lucide-react';

const RULE_TYPES = [
  { value: 'TONE', label: '말투/어조' },
  { value: 'FORMAT', label: '작성 형식' },
  { value: 'PROHIBITED', label: '금지사항' },
  { value: 'INSIGHT', label: '기타 인사이트' },
];

export function RulesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState('TONE');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editType, setEditType] = useState('TONE');

  const fetchRules = () => {
    axios.get('/api/rules').then(res => setItems(res.data));
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      await axios.post('/api/rules', {
        title: title.trim() || "새 규칙 템플릿",
        content: content,
        type: type
      });
      setTitle('');
      setContent('');
      setType('TONE');
      fetchRules();
    } catch (e) {
      alert("추가 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("이 규칙을 삭제하시겠습니까?")) return;
    try {
      await axios.delete(`/api/rules/${id}`);
      fetchRules();
    } catch (e) {
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  const handleToggleActive = async (id: number) => {
    try {
      await axios.put(`/api/rules/${id}/toggle`);
      fetchRules();
    } catch (e) {
      alert("상태 변경 중 오류가 발생했습니다.");
    }
  };

  const startEdit = (item: { id: number; title?: string | null; content?: string | null; type?: string | null }) => {
    setEditingId(item.id);
    setEditTitle(item.title || '');
    setEditContent(item.content || '');
    setEditType(item.type || 'TONE');
  };

  const handleSaveEdit = async () => {
    if (editingId == null) return;
    if (!editContent.trim()) return alert('내용을 입력해주세요.');
    try {
      await axios.put(`/api/rules/${editingId}`, {
        title: editTitle.trim() || '새 규칙 템플릿',
        content: editContent,
        type: editType,
      });
      setEditingId(null);
      fetchRules();
    } catch (e: any) {
      alert(e.response?.data?.error || '수정 중 오류가 발생했습니다.');
    }
  };

  const getTypeLabel = (t: string) => {
    if (t === 'TONE') return { label: '말투/어조', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' };
    if (t === 'FORMAT') return { label: '작성 형식', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    if (t === 'PROHIBITED') return { label: '금지사항', color: 'bg-red-100 text-red-700 border-red-200' };
    return { label: '인사이트', color: 'bg-slate-100 text-slate-700 border-slate-200' };
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-end mb-6 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">2 규칙 (프롬프트)</h1>
          <p className="text-sm text-slate-500 mt-1">AI가 글을 작성할 때 반드시 참고하는 나만의 톤앤매너, 금지어 등을 관리합니다.</p>
        </div>
      </div>
      
      <div className="bg-white border border-slate-200 rounded-lg p-5 mb-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2"><AlertCircle size={16} className="text-orange-500"/> 새 규칙(가이드) 등록</h3>
        <form onSubmit={handleAdd} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <select 
              value={type} 
              onChange={(e) => setType(e.target.value)}
              className="w-36 p-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-orange-500 bg-slate-50 font-semibold text-slate-700"
            >
              {RULE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <input 
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="규칙 이름 (예: 기본 톤앤매너 설정)"
              className="flex-1 p-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 bg-slate-50 font-semibold"
            />
          </div>
          <textarea 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="규칙 내용 (예: 친근한 '~해요' 체로 작성해서 독자와 소통하자. 과도한 이모티콘 사용은 자제할 것.)"
            rows={3}
            className="w-full p-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 bg-slate-50 resize-y"
          />
          <button type="submit" className="self-end bg-orange-600 text-white px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-orange-700 transition shadow-sm">
            규칙 추가하기
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.length === 0 && (
          <div className="col-span-full py-12 text-center bg-white border border-dashed border-slate-300 rounded-lg text-slate-500 text-sm">
            등록된 규칙이 없습니다.<br/>위에서 자주 쓰는 AI 지침을 등록해보세요!
          </div>
        )}
        {items.map(item => {
          const typeInfo = getTypeLabel(item.type);
          const editing = editingId === item.id;
          return (
            <div key={item.id} className={`bg-white p-5 rounded-lg shadow-sm border transition relative flex flex-col min-h-[140px] ${item.isActive ? 'border-orange-300 ring-1 ring-orange-300' : 'border-slate-200'}`}>
              <div className="flex-1">
                {editing ? (
                  <div className="flex flex-col gap-2">
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value)}
                      className="w-full p-2 text-sm border border-orange-300 rounded-md bg-white font-semibold"
                      aria-label="규칙 유형"
                    >
                      {RULE_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full p-2 text-sm border border-orange-300 rounded-md font-semibold"
                      aria-label="규칙 이름"
                    />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={5}
                      className="w-full p-2 text-sm border border-orange-300 rounded-md resize-y"
                      aria-label="규칙 내용"
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${typeInfo.color}`}>{typeInfo.label}</span>
                      <h3 className="text-sm font-bold text-slate-800">{item.title || "새 규칙 템플릿"}</h3>
                    </div>
                    <p className={`text-sm leading-relaxed whitespace-pre-wrap pr-4 ${item.isActive ? 'text-slate-700' : 'text-slate-400'}`}>{item.content}</p>
                  </>
                )}
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-10 h-5 rounded-full p-1 flex items-center transition-colors duration-200 ease-in-out ${item.isActive ? 'bg-orange-500' : 'bg-slate-300'}`}>
                    <div className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${item.isActive ? 'translate-x-5' : 'translate-x-0'}`}></div>
                  </div>
                  <input type="checkbox" className="hidden" checked={item.isActive} onChange={() => handleToggleActive(item.id)} />
                  <span className={`text-xs font-semibold ${item.isActive ? 'text-orange-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                    {item.isActive ? '발행 대기열 기본 적용 중' : '기본 적용 안함'}
                  </span>
                </label>
                <div className="flex gap-2">
                  {editing ? (
                    <>
                      <button type="button" onClick={handleSaveEdit} className="text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 px-2.5 py-1.5 rounded-md">저장</button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-xs font-semibold text-slate-600 bg-white px-2.5 py-1.5 rounded-md border border-slate-300">취소</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => startEdit(item)} className="text-xs font-semibold text-slate-700 bg-white hover:bg-orange-50 px-2.5 py-1.5 rounded-md border border-slate-300">수정</button>
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
