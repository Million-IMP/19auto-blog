import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const API_URL = '/api';

function apiErrorMessage(error: unknown, fallback: string) {
  const body = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return body || fallback;
}

export type ChannelDraft = { name: string; url: string; category: string; materialIds: number[]; ruleIds: number[] };

const emptyChannelDraft: ChannelDraft = { name: '', url: '', category: 'IT/테크', materialIds: [], ruleIds: [] };

// RSS 채널 목록과 채널별 글쓰기 설정(재료·규칙). open일 때만 재료·규칙 목록을 불러온다.
export function useRssChannels(open: boolean) {
const [rssFeeds, setRssFeeds] = useState<any[]>([]);
const [newRssName, setNewRssName] = useState('');
const [newRssUrl, setNewRssUrl] = useState('');
const [newRssCategory, setNewRssCategory] = useState('IT/테크');
const [newMaterialIds, setNewMaterialIds] = useState<number[]>([]);
const [newRuleIds, setNewRuleIds] = useState<number[]>([]);
const [libraryMaterials, setLibraryMaterials] = useState<{ id: number; title: string | null }[]>([]);
const [libraryRules, setLibraryRules] = useState<{ id: number; title: string }[]>([]);
const [feedDrafts, setFeedDrafts] = useState<Record<number, ChannelDraft>>({});
const feedDraftsRef = useRef(feedDrafts);
const feedSaveSeq = useRef<Record<number, number>>({});
feedDraftsRef.current = feedDrafts;
const channelCategories = ['IT/테크', '개발/기술', '스타트업/비즈니스', '일반 트렌드'];

  useEffect(() => {
    fetchRssFeeds();
  }, []);

const fetchRssFeeds = async () => {
  try {
    const res = await axios.get(`${API_URL}/rss-feeds`);
    setRssFeeds(res.data);
    const nextDrafts = Object.fromEntries(res.data.map((feed: { id: number; name?: string; url?: string; category?: string | null; templateMaterialId?: number | null; materials?: { id: number }[]; rules?: { id: number }[] }) => [feed.id, {
      name: feed.name || '',
      url: feed.url || '',
      category: feed.category || 'IT/테크',
      materialIds: (feed.materials && feed.materials.length > 0)
        ? feed.materials.map((material) => material.id)
        : (feed.templateMaterialId ? [feed.templateMaterialId] : []),
      ruleIds: (feed.rules || []).map((rule) => rule.id),
    }]));
    feedDraftsRef.current = nextDrafts;
    setFeedDrafts(nextDrafts);
  } catch (e) {
    console.error(e);
  }
};

const fetchWritingLibrary = async () => {
  try {
    const [materialsRes, rulesRes] = await Promise.all([
      axios.get(`${API_URL}/materials`),
      axios.get(`${API_URL}/rules`),
    ]);
    setLibraryMaterials(materialsRes.data.map((item: { id: number; title: string | null }) => ({ id: item.id, title: item.title })));
    setLibraryRules(rulesRes.data.map((item: { id: number; title: string }) => ({ id: item.id, title: item.title })));
  } catch (e) {
    console.error(e);
  }
};

useEffect(() => {
  if (!open) return;
  fetchWritingLibrary();
}, [open]);

const handleAddRss = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newRssName.trim() || !newRssUrl.trim()) return alert("채널명과 RSS URL을 입력해주세요.");
  try {
    await axios.post(`${API_URL}/rss-feeds`, {
      name: newRssName.trim(),
      url: newRssUrl.trim(),
      category: newRssCategory,
      materialIds: newMaterialIds,
      ruleIds: newRuleIds,
    });
    setNewRssName('');
    setNewRssUrl('');
    setNewMaterialIds([]);
    setNewRuleIds([]);
    fetchRssFeeds();
    alert("새 RSS 채널이 등록되었습니다.");
  } catch (e) {
    alert("RSS 채널 등록 중 오류가 발생했습니다.");
  }
};

const handleToggleRss = async (id: number) => {
  try {
    await axios.put(`${API_URL}/rss-feeds/${id}/toggle`);
    fetchRssFeeds();
  } catch (e) {
    alert("상태 변경 중 오류가 발생했습니다.");
  }
};

const persistFeedSelection = async (feedId: number, draft: ChannelDraft, notify = false) => {
  if (!draft.name.trim() || !draft.url.trim()) {
    alert('채널명과 RSS URL을 입력해주세요.');
    fetchRssFeeds();
    return;
  }
  const seq = (feedSaveSeq.current[feedId] || 0) + 1;
  feedSaveSeq.current[feedId] = seq;
  try {
    const res = await axios.put(`${API_URL}/rss-feeds/${feedId}`, {
      name: draft.name.trim(),
      url: draft.url.trim(),
      category: draft.category,
      materialIds: draft.materialIds,
      ruleIds: draft.ruleIds,
    });
    if (feedSaveSeq.current[feedId] !== seq) return;
    const materialIds = (res.data.materials || []).map((material: { id: number }) => material.id);
    const ruleIds = (res.data.rules || []).map((rule: { id: number }) => rule.id);
    setRssFeeds((prev) => prev.map((feed) => feed.id === feedId ? { ...feed, materials: res.data.materials, rules: res.data.rules, templateMaterialId: res.data.templateMaterialId } : feed));
    const current = feedDraftsRef.current[feedId] || draft;
    const nextDraft: ChannelDraft = {
      ...current,
      materialIds,
      ruleIds,
      ...(notify ? {
        name: res.data.name || current.name,
        url: res.data.url || current.url,
        category: res.data.category || current.category,
      } : {}),
    };
    const next = { ...feedDraftsRef.current, [feedId]: nextDraft };
    feedDraftsRef.current = next;
    setFeedDrafts(next);
    if (notify) alert('채널 수정을 저장했습니다.');
  } catch (e) {
    if (feedSaveSeq.current[feedId] !== seq) return;
    alert(apiErrorMessage(e, '채널 설정을 저장하지 못했습니다.'));
    fetchRssFeeds();
  }
};

const handleSaveFeedWriting = (id: number) => {
  const draft = feedDraftsRef.current[id];
  if (!draft || !draft.name.trim() || !draft.url.trim()) return alert('채널명과 RSS URL을 입력해주세요.');
  persistFeedSelection(id, draft, true);
};

const changeFeedDraft = (feedId: number, patch: Partial<ChannelDraft>) => {
  const current = feedDraftsRef.current[feedId] || emptyChannelDraft;
  const next = { ...feedDraftsRef.current, [feedId]: { ...current, ...patch } };
  feedDraftsRef.current = next;
  setFeedDrafts(next);
};

const toggleFeedMaterial = (feedId: number, materialId: number) => {
  const current = feedDraftsRef.current[feedId] || emptyChannelDraft;
  const materialIds = current.materialIds.includes(materialId)
    ? current.materialIds.filter((id) => id !== materialId)
    : [...current.materialIds, materialId];
  const nextDraft = { ...current, materialIds };
  const next = { ...feedDraftsRef.current, [feedId]: nextDraft };
  feedDraftsRef.current = next;
  setFeedDrafts(next);
  persistFeedSelection(feedId, nextDraft);
};

const toggleFeedRule = (feedId: number, ruleId: number) => {
  const current = feedDraftsRef.current[feedId] || emptyChannelDraft;
  const ruleIds = current.ruleIds.includes(ruleId)
    ? current.ruleIds.filter((id) => id !== ruleId)
    : [...current.ruleIds, ruleId];
  const nextDraft = { ...current, ruleIds };
  const next = { ...feedDraftsRef.current, [feedId]: nextDraft };
  feedDraftsRef.current = next;
  setFeedDrafts(next);
  persistFeedSelection(feedId, nextDraft);
};

const handleDeleteRss = async (id: number) => {
  if (!confirm("이 RSS 채널을 삭제하시겠습니까?")) return;
  try {
    await axios.delete(`${API_URL}/rss-feeds/${id}`);
    fetchRssFeeds();
  } catch (e) {
    alert("삭제 중 오류가 발생했습니다.");
  }
};

  return {
    rssFeeds, channelCategories, feedDrafts, libraryMaterials, libraryRules,
    newRssName, setNewRssName, newRssUrl, setNewRssUrl, newRssCategory, setNewRssCategory,
    newMaterialIds, setNewMaterialIds, newRuleIds, setNewRuleIds,
    handleAddRss, handleToggleRss, handleDeleteRss, handleSaveFeedWriting,
    changeFeedDraft, toggleFeedMaterial, toggleFeedRule,
  };
}

export type RssChannels = ReturnType<typeof useRssChannels>;
