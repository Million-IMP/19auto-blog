import { useEffect, useState } from 'react';
import axios from 'axios';
import { UserCircle, ChevronDown, ChevronRight } from 'lucide-react';

const FIELDS = [
  { key: 'audience', label: '읽을 사람', placeholder: '예: 처음 매장을 여는 자영업자' },
  { key: 'purpose', label: '글의 목적', placeholder: '예: 바로 따라 할 수 있는 준비 순서 알려주기' },
  { key: 'tone', label: '말투', placeholder: '예: 상담하듯 존댓말, 짧은 문장' },
  { key: 'structure', label: '구성', placeholder: '예: 질문 → 답 → 사례 → 체크리스트' },
  { key: 'ctaText', label: '독자의 다음 행동', placeholder: '예: 체크리스트 내려받기' },
  { key: 'ctaUrl', label: '행동 연결 URL', placeholder: 'https://...' },
  { key: 'imageStyle', label: '이미지 스타일', placeholder: '예: 따뜻한 편집 일러스트, 글자 없음' },
  { key: 'bannedPhrases', label: '쓰지 않을 표현', placeholder: '예: 도모하다, 극대화, 꿀팁 대방출' },
] as const;

type Profile = Record<(typeof FIELDS)[number]['key'], string>;

export function BlogProfileForm() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get('/api/profile').then((res) => setProfile(res.data)).catch(() => {});
  }, []);

  const filled = FIELDS.filter((f) => profile[f.key]).length;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await axios.put('/api/profile', profile);
      setProfile(res.data);
      alert('블로그 프로필을 저장했습니다. 다음 초안부터 적용됩니다.');
    } catch (e: any) {
      alert(e.response?.data?.error || '저장 중 오류가 발생했습니다.');
    }
    setSaving(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 mb-6 shadow-sm">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <UserCircle size={16} className="text-blue-500" /> 블로그 프로필
          <span className="text-xs font-normal text-slate-500">모든 초안에 공통 적용 · {filled}/{FIELDS.length} 입력됨</span>
        </h3>
        {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-slate-500">빈 항목은 프롬프트에 넣지 않습니다. 이번 글에만 해당하는 사실은 여기 적지 마세요.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                {f.label}
                <input
                  type="text"
                  value={profile[f.key] || ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })}
                  className="p-2 text-sm font-normal border border-slate-300 rounded-md focus:outline-none focus:border-blue-500 bg-slate-50"
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={handleSave} disabled={saving} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-semibold disabled:opacity-50">
              {saving ? '저장 중...' : '프로필 저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
