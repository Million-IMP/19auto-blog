import { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import { Trash2, PenTool, Link as LinkIcon, Wand2, Archive } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, EmptyState, Field, IconButton, Input, Notice, Page, PageHeader, Switch, Textarea, cn } from '../components/ui';

const MAX_BENCHMARK_URLS = 5;

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

  const extractUrls = [...new Set(extractUrl.split(/\s+/).map((u) => u.trim()).filter(Boolean))];
  const tooManyUrls = extractUrls.length > MAX_BENCHMARK_URLS;

  const handleExtract = async () => {
    if (extractUrls.length === 0) return alert("URL을 입력해주세요.");
    if (tooManyUrls) return alert(`URL은 최대 ${MAX_BENCHMARK_URLS}개까지 비교할 수 있습니다.`);
    setIsExtracting(true);
    try {
      const res = await axios.post('/api/materials/extract', { urls: extractUrls });
      setTitle(res.data.title);
      setContent(res.data.content);
      const failed: string[] = res.data.failed || [];
      const summary = res.data.analyzed > 1 ? `${res.data.analyzed}개 글을 비교 분석했습니다.` : '구조 추출이 완료되었습니다.';
      const failedNote = failed.length > 0 ? `\n\n읽지 못해 제외한 URL:\n${failed.join('\n')}` : '';
      alert(`${summary} 내용을 확인하고 '재료 저장'을 눌러 저장하세요.${failedNote}`);
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
    <Page>
      <PageHeader
        step="03"
        title="재료 베이스"
        description="초안의 뼈대가 될 목차·글 흐름(템플릿)을 모아 둡니다. '기본 적용'을 켠 재료는 초안을 만들 때 자동으로 들어갑니다."
      />

      <Card className="mb-section">
        <CardHeader title={<><PenTool size={15} className="text-accent" /> 새 재료 등록</>} description="잘 쓴 글의 URL로 구조를 뽑거나, 직접 적어서 저장합니다." />
        <CardBody className="space-y-4">
          {/* 벤치마킹 URL 추출부 */}
          <div className="rounded-control border border-line bg-surface-2 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <LinkIcon size={15} className="text-accent" /> URL로 구조 벤치마킹
              </p>
              <span className={cn('text-xs font-semibold tabular-nums', tooManyUrls ? 'text-danger' : 'text-ink-3')}>
                {extractUrls.length}/{MAX_BENCHMARK_URLS}개
              </span>
            </div>
            <p className="text-xs text-ink-3">여러 개를 넣으면 공통 패턴과 차별화 기회까지 비교합니다.</p>
            <div className="flex flex-col gap-2 md:flex-row">
              <Textarea
                value={extractUrl}
                onChange={(e) => setExtractUrl(e.target.value)}
                placeholder={'URL을 한 줄에 하나씩 (최대 5개)\nhttps://blog.naver.com/...\nhttps://...'}
                rows={3}
                className="flex-1"
              />
              <Button variant="primary" icon={<Wand2 size={14} />} onClick={handleExtract} disabled={isExtracting || tooManyUrls} className="md:self-start">
                {isExtracting ? '분석 중...' : extractUrls.length > 1 ? `${extractUrls.length}개 비교 분석` : 'AI 뼈대 추출'}
              </Button>
            </div>
          </div>

          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <Field label="재료 이름">
              <Input id="material-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: IT 제품 리뷰 기본 구조" />
            </Field>
            <Field label="재료 내용">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="예: 1. 첫인상 및 스펙 요약 2. 실사용 장점 3가지 3. 아쉬운 점 1가지 4. 구매를 추천하는 대상과 총평"
                rows={4}
              />
            </Field>
            <Button type="submit" className="self-end" disabled={!content.trim()}>재료 저장</Button>
          </form>
        </CardBody>
      </Card>

      {loadError && <Notice tone="danger" className="mb-4">{loadError}</Notice>}
      {!loadError && !viewReady && <p className="py-12 text-center text-sm text-ink-3">불러오는 중...</p>}
      {!loadError && viewReady && items.length === 0 && (
        <EmptyState
          icon={<Archive size={28} />}
          title="등록된 재료가 없습니다."
          description="자주 쓰는 글의 구조를 위에서 등록해 보세요. 재료가 없으면 기본 글쓰기로 초안을 만듭니다."
          action={<Button size="sm" onClick={() => document.getElementById('material-title')?.focus()}>재료 등록하기</Button>}
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {viewReady && items.map((item) => {
          const editing = editingId === item.id;
          return (
            <article key={item.id} className={cn('flex min-h-[140px] flex-col rounded-card border bg-surface p-4 shadow-card', item.isActive ? 'border-accent/50' : 'border-line')}>
              <div className="flex-1">
                {editing ? (
                  <div className="flex flex-col gap-2">
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} aria-label="재료 이름" />
                    <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={5} aria-label="재료 내용" />
                  </div>
                ) : (
                  <>
                    <h3 className="mb-2 text-sm font-bold text-ink">{item.title || '글감 템플릿'}</h3>
                    <p className={cn('whitespace-pre-wrap text-sm leading-relaxed', item.isActive ? 'text-ink-2' : 'text-ink-3')}>{item.content}</p>
                  </>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                <Switch checked={!!item.isActive} onChange={() => handleToggleActive(item.id)} label={item.isActive ? '기본 적용 중' : '기본 적용 안 함'} />
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
