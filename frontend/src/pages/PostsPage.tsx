import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { PenTool, CheckCircle, Copy, Trash2, Link2, Video, Image as ImageIcon, MessageCircle, Eye, EyeOff, Edit3, Save, X, BarChart2, FileCheck, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PipelinePanel } from '../components/PipelinePanel';
import { Badge, Button, Card, CardHeader, EmptyState, Field, IconButton, Input, Notice, Page, PageHeader, Segmented, StageBadge, StatusBadge, Textarea, cn } from '../components/ui';

const API_URL = '/api';

function apiErrorMessage(error: unknown, fallback: string) {
  const body = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return body || fallback;
}

type PublishCheck = { checkedAt: string; ok: boolean; titleFound: boolean; imageCount: number; expectedImages: number; note: string };

// 발행 처리 ≠ 공개 확인. 실제 공개 화면에서 제목과 이미지가 보이는지 확인한 결과를 보여준다.
function PublishCheckBadge({ raw, verifying, onVerify }: { raw: string | null; verifying: boolean; onVerify: () => void }) {
  let check: PublishCheck | null = null;
  try {
    check = raw ? JSON.parse(raw) : null;
  } catch {
    check = null;
  }
  return (
    <div className="flex items-center gap-2">
      {check ? (
        <Badge tone={check.ok ? 'published' : 'danger'} title={`${new Date(check.checkedAt).toLocaleString()} · ${check.note}`}>
          {check.ok ? `공개 확인됨 · 이미지 ${check.imageCount}/${check.expectedImages}` : `확인 실패 · ${check.note}`}
        </Badge>
      ) : (
        <Badge tone="draft">공개 미확인</Badge>
      )}
      <Button size="sm" onClick={onVerify} disabled={verifying}>
        {verifying ? '확인 중...' : check ? '다시 확인' : '공개 확인'}
      </Button>
    </div>
  );
}

const PLATFORM: Record<string, string> = { NAVER_BLOG: '네이버 블로그', INSTA: '인스타그램', SHORTS: '유튜브 숏츠', THREADS: '스레드' };

// 작업실 왼쪽: 고를 수 있는 자료 묶음 하나
function PickGroup({ title, hint, items, selected, onToggle, empty, emptyLink }: {
  title: string; hint: string; items: any[]; selected: number[]; onToggle: (id: number) => void; empty: string; emptyLink: string;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold text-ink-2">{title} <span className="font-normal text-ink-3">{hint}</span></h3>
        <span className="text-xs tabular-nums text-ink-3">{selected.length > 0 ? `${selected.length}개 선택 / ` : ''}{items.length}건</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-ink-3">{empty} <Link to={emptyLink} className="text-accent hover:text-accent-strong">추가하러 가기 →</Link></p>
      ) : (
        <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {items.map((item) => {
            const on = selected.includes(item.id);
            return (
              <label key={item.id} className={cn('flex cursor-pointer items-start gap-2 rounded-control border p-2.5 transition', on ? 'border-accent/50 bg-accent/10 text-ink' : 'border-line text-ink-2 hover:bg-surface-2')}>
                <input type="checkbox" checked={on} onChange={() => onToggle(item.id)} className="mt-0.5" />
                <span className="line-clamp-2 text-xs leading-relaxed">{item.title ? <b className="text-ink">{item.title} · </b> : null}{item.content}</span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
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
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
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

  // 대시보드 04/05 열에서 들어오면 ?stage=writing(작성 중) / ?stage=ready(발행 대기)로 한 번 더 거른다
  const stageParam = searchParams.get('stage');
  const stageFilter = stageParam === 'writing' || stageParam === 'ready' ? stageParam : null;

  const visiblePosts = posts.filter((post) => {
    if (statusFilter === 'draft' && post.status !== 'DRAFT') return false;
    if (statusFilter === 'published' && post.status !== 'PUBLISHED') return false;
    if (stageFilter === 'writing') return post.platform === 'NAVER_BLOG' && post.stage !== 'READY';
    if (stageFilter === 'ready') return post.platform === 'NAVER_BLOG' && post.stage === 'READY';
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

  const handleVerify = async (id: number) => {
    setVerifyingId(id);
    try {
      await axios.post(`${API_URL}/posts/${id}/verify`);
      fetchPosts();
    } catch (e) {
      alert(apiErrorMessage(e, "공개 확인 중 오류가 발생했습니다."));
    }
    setVerifyingId(null);
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

  const emptyText = statusFilter === 'published'
    ? { title: '발행한 글이 없습니다.', description: '초안 아래에 발행 URL을 적고 "발행 처리"를 누르면 여기로 옮겨집니다.' }
    : statusFilter === 'draft'
      ? { title: '대기 중인 초안이 없습니다.', description: '왼쪽 작업실에서 자료를 골라 초안을 만들거나, 글감 보드에서 바로 초안을 만들 수 있습니다.' }
      : { title: '아직 만든 초안이 없습니다.', description: '왼쪽 작업실에서 수집 자료·재료·규칙을 골라 "초안 만들기"를 눌러 보세요.' };

  return (
    <Page wide className="lg:flex lg:h-full lg:gap-6 lg:overflow-hidden">
      {/* 왼쪽: 작업실 (자료 고르기 → 초안 만들기) */}
      <aside className="mb-section flex flex-col lg:mb-0 lg:h-full lg:w-[360px] lg:shrink-0">
        <PageHeader step="04" title="초안 · 발행 대기" description="자료와 규칙을 골라 초안을 만들고, 완성된 글을 발행합니다." />

        <Card className="flex flex-col lg:min-h-0 lg:flex-1">
          <CardHeader title={<><PenTool size={15} className="text-accent" /> 작업실</>} description="아무것도 고르지 않으면 기본 글쓰기로 진행합니다." />
          <div className="space-y-5 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <Field label="타겟 키워드 (선택)" hint="수집 자료의 RSS 채널에 규칙이 있으면 그 규칙을 먼저 씁니다. 키워드를 적으면 그 키워드를 따릅니다.">
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="비워두면 AI가 자동 도출" />
            </Field>
            <PickGroup title="수집 자료" hint="01" items={inboxes} selected={selectedInboxIds} onToggle={toggleSelectInbox} empty="처리할 수집 자료가 없습니다." emptyLink="/inbox" />
            <PickGroup title="재료" hint="03" items={materials} selected={selectedMaterialIds} onToggle={toggleSelectMaterial} empty="등록된 재료가 없습니다." emptyLink="/materials" />
            <PickGroup title="규칙" hint="03" items={rules} selected={selectedRuleIds} onToggle={toggleSelectRule} empty="등록된 규칙이 없습니다." emptyLink="/rules" />
          </div>
          <div className="border-t border-line p-3">
            <Button variant="primary" icon={<PenTool size={15} />} onClick={handleGenerate} disabled={generating} size="lg" className="w-full">
              {generating ? 'AI 초안 작성 중...' : '초안 만들기'}
            </Button>
          </div>
        </Card>
      </aside>

      {/* 오른쪽: 초안 · 발행 대기열 */}
      <section className="flex min-w-0 flex-col lg:h-full lg:flex-1">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            발행 대기열 <span className="tabular-nums text-ink-3">{visiblePosts.length}</span>
          </h2>
          <Segmented
            options={[{ value: 'all', label: '전체' }, { value: 'draft', label: '초안' }, { value: 'published', label: '발행' }] as const}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        {stageFilter && (
          <Notice tone="info" className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span>{stageFilter === 'ready' ? '완성되어 발행을 기다리는 블로그 글만 보는 중입니다.' : '아직 작성 단계가 남은 블로그 초안만 보는 중입니다.'}</span>
            <button type="button" onClick={() => setStatusFilter('draft')} className="text-xs font-semibold text-accent hover:text-accent-strong">초안 전체 보기</button>
          </Notice>
        )}

        <div className="space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          {visiblePosts.length === 0 && (
            <EmptyState icon={<FileText size={28} />} title={emptyText.title} description={emptyText.description} />
          )}
          {visiblePosts.map(post => {
            const seo = getSeoStats(post.content, post.keyword);
            const isEditing = editingPostId === post.id;
            const keywordOk = seo.keywordCount >= 3 && seo.keywordCount <= 6;

            return (
              <Card key={post.id} className="p-4">
                {/* 머리: 플랫폼·상태·제목 + 보기/수정/삭제 */}
                <div className="mb-3 flex flex-col gap-3 border-b border-line pb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <Badge>{PLATFORM[post.platform] || post.platform}</Badge>
                      <StatusBadge status={post.status} />
                      {post.isPipeline && post.status === 'DRAFT' && <StageBadge stage={post.stage} failed={Boolean(post.stageError)} />}
                    </div>
                    {isEditing ? (
                      <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="text-base! font-bold" aria-label="제목" />
                    ) : (
                      <h3 className="text-base font-bold leading-snug text-ink sm:text-lg">{post.title}</h3>
                    )}
                    {post.keyword && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
                        타겟 키워드 <Badge tone="accent">{post.keyword}</Badge>
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {!isEditing && (
                      <>
                        <Button size="sm" variant="ghost" icon={rawViewIds.includes(post.id) ? <Eye size={14} /> : <EyeOff size={14} />} onClick={() => toggleRawView(post.id)}>
                          {rawViewIds.includes(post.id) ? '미리보기' : '원문보기'}
                        </Button>
                        <Button size="sm" icon={<Edit3 size={14} />} onClick={() => handleStartEdit(post)} title="직접 본문 수정">수정</Button>
                      </>
                    )}
                    <IconButton
                      title="삭제"
                      variant="ghostDanger"
                      onClick={async () => {
                        if (confirm("이 초안을 삭제하시겠습니까?")) {
                          try {
                            await axios.delete(`${API_URL}/posts/${post.id}`);
                            fetchPosts();
                          } catch (e) {
                            alert(apiErrorMessage(e, "삭제 중 오류가 발생했습니다."));
                          }
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </div>

                {/* SEO 지표 */}
                <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="mr-1 flex items-center gap-1 font-semibold text-ink-3"><BarChart2 size={13} /> SEO</span>
                  <Badge tone={keywordOk ? 'published' : 'draft'}>키워드 {seo.keywordCount}회 {keywordOk ? '· 적정' : '· 3~6회 권장'}</Badge>
                  <Badge>{seo.charCount.toLocaleString()}자 · 약 {seo.readingMinutes}분</Badge>
                  <Badge>소제목 {seo.h2Count}개</Badge>
                  <Badge>이미지 {seo.imgCount}장</Badge>
                </div>

                {post.isPipeline && (
                  <PipelinePanel post={post} resuming={resumingId === post.id} onResume={() => handleResume(post.id)} onChanged={fetchPosts} />
                )}

                {/* 본문 / 인라인 수정 */}
                {isEditing ? (
                  <div className="space-y-3">
                    <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={14} className="font-mono" aria-label="본문" />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" icon={<X size={14} />} onClick={handleCancelEdit}>취소</Button>
                      <Button variant="primary" icon={<Save size={14} />} onClick={() => handleSaveEdit(post.id)}>수정 저장</Button>
                    </div>
                  </div>
                ) : (
                  <div
                    id={`post-preview-${post.id}`}
                    className={cn('prose prose-sm prose-invert max-w-none [overflow-wrap:anywhere] rounded-control border border-line bg-surface-2 p-4 text-sm leading-relaxed text-ink', rawViewIds.includes(post.id) && 'whitespace-pre-wrap')}
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

                {/* 아래: 파생 글 만들기 · 발행 · 복사 */}
                <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs font-semibold text-ink-3">파생 글</span>
                    <Button size="sm" variant="ghost" icon={<ImageIcon size={14} />} onClick={() => handleOSMU(post.id, 'INSTA')} disabled={osmuLoading === post.id}>인스타</Button>
                    <Button size="sm" variant="ghost" icon={<Video size={14} />} onClick={() => handleOSMU(post.id, 'SHORTS')} disabled={osmuLoading === post.id}>숏츠</Button>
                    <Button size="sm" variant="ghost" icon={<MessageCircle size={14} />} onClick={() => handleOSMU(post.id, 'THREADS')} disabled={osmuLoading === post.id}>스레드</Button>
                    {osmuLoading === post.id && <span className="ml-1 animate-pulse text-xs text-accent">변환 중...</span>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    {post.status === 'DRAFT' && (
                      <div className="flex w-full gap-2 sm:w-auto">
                        <Input
                          placeholder="발행된 URL 입력"
                          className="h-8 py-1! text-xs! sm:w-52"
                          value={publishUrls[post.id] || ''}
                          onChange={(e) => setPublishUrls({...publishUrls, [post.id]: e.target.value})}
                          aria-label="발행된 URL"
                        />
                        <Button size="sm" icon={<CheckCircle size={14} />} onClick={() => handlePublish(post.id)}>발행 처리</Button>
                      </div>
                    )}
                    {post.status === 'PUBLISHED' && post.publishedUrl && (
                      <a href={post.publishedUrl} target="_blank" rel="noreferrer" className="mr-1 flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-strong">
                        <Link2 size={14}/> 발행 링크 열기
                      </a>
                    )}
                    {post.status === 'PUBLISHED' && post.publishedUrl && (
                      <PublishCheckBadge raw={post.publishCheck} verifying={verifyingId === post.id} onVerify={() => handleVerify(post.id)} />
                    )}
                    <Button size="sm" variant="primary" icon={<FileCheck size={14} />} onClick={() => handleCopyNaverHtml(post.id)} title="네이버 블로그 에디터에 붙여넣을 때 서식/이미지가 유지됩니다">
                      네이버 서식 복사
                    </Button>
                    <Button size="sm" icon={<Copy size={14} />} onClick={() => {
                      navigator.clipboard.writeText(post.content);
                      alert("텍스트가 복사되었습니다!");
                    }}>
                      텍스트 복사
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </Page>
  );
}
