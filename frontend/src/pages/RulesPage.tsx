import { useState, useEffect } from 'react';
import axios from 'axios';
import { Trash2, AlertCircle, BookOpen } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, IconButton, Input, Notice, Page, PageHeader, Select, Switch, Textarea, cn, type BadgeTone } from '../components/ui';
import { BlogProfileForm } from '../components/BlogProfileForm';

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

  const [viewReady, setViewReady] = useState(false);
  const [loadError, setLoadError] = useState('');

  const fetchRules = () => {
    axios.get('/api/rules')
      .then((res) => {
        setItems(res.data);
        setLoadError('');
        setViewReady(true);
      })
      .catch((e) => setLoadError(e.response?.data?.error || '규칙 목록을 불러오지 못했습니다.'));
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

  const getTypeLabel = (t: string): { label: string; tone: BadgeTone } => {
    if (t === 'TONE') return { label: '말투/어조', tone: 'info' };
    if (t === 'FORMAT') return { label: '작성 형식', tone: 'accent' };
    if (t === 'PROHIBITED') return { label: '금지사항', tone: 'danger' };
    return { label: '인사이트', tone: 'neutral' };
  };

  return (
    <Page>
      <PageHeader
        step="03"
        title="규칙 (프롬프트)"
        description="AI가 초안을 쓸 때 반드시 지키는 말투·형식·금지어입니다. 켜 둔 규칙만 적용됩니다."
      />

      <BlogProfileForm />

      <Card className="mb-section">
        <CardHeader title={<><AlertCircle size={15} className="text-accent" /> 새 규칙 등록</>} />
        <CardBody>
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={type} onChange={(e) => setType(e.target.value)} className="sm:w-40" aria-label="규칙 유형">
                {RULE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
              <Input id="rule-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="규칙 이름 (예: 기본 톤앤매너)" className="flex-1" aria-label="규칙 이름" />
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="규칙 내용 (예: 친근한 '~해요' 체로 작성. 과도한 이모티콘은 자제.)"
              rows={3}
              aria-label="규칙 내용"
            />
            <Button type="submit" variant="primary" className="self-end" disabled={!content.trim()}>규칙 추가</Button>
          </form>
        </CardBody>
      </Card>

      {loadError && <Notice tone="danger" className="mb-4">{loadError}</Notice>}
      {!loadError && !viewReady && <p className="py-12 text-center text-sm text-ink-3">불러오는 중...</p>}
      {!loadError && viewReady && items.length === 0 && (
        <EmptyState
          icon={<BookOpen size={28} />}
          title="등록된 규칙이 없습니다."
          description="자주 쓰는 AI 지침(말투, 금지 표현 등)을 위에서 등록해 보세요."
          action={<Button size="sm" onClick={() => document.getElementById('rule-title')?.focus()}>규칙 등록하기</Button>}
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const typeInfo = getTypeLabel(item.type);
          const editing = editingId === item.id;
          return (
            <article key={item.id} className={cn('flex min-h-[140px] flex-col rounded-card border bg-surface p-4 shadow-card', item.isActive ? 'border-accent/50' : 'border-line')}>
              <div className="flex-1">
                {editing ? (
                  <div className="flex flex-col gap-2">
                    <Select value={editType} onChange={(e) => setEditType(e.target.value)} aria-label="규칙 유형">
                      {RULE_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} aria-label="규칙 이름" />
                    <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={5} aria-label="규칙 내용" />
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <Badge tone={typeInfo.tone}>{typeInfo.label}</Badge>
                      <h3 className="truncate text-sm font-bold text-ink">{item.title || '새 규칙 템플릿'}</h3>
                    </div>
                    <p className={cn('whitespace-pre-wrap text-sm leading-relaxed', item.isActive ? 'text-ink-2' : 'text-ink-3')}>{item.content}</p>
                  </>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                <Switch checked={item.isActive} onChange={() => handleToggleActive(item.id)} label={item.isActive ? '적용 중' : '적용 안 함'} />
                <div className="flex gap-1.5">
                  {editing ? (
                    <>
                      <Button size="sm" variant="primary" onClick={handleSaveEdit}>저장</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>취소</Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => startEdit(item)}>수정</Button>
                      <IconButton title="삭제" onClick={() => handleDelete(item.id)} variant="ghostDanger"><Trash2 size={15} /></IconButton>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </Page>
  );
}
