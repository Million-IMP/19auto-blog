import { Rss, Plus, X, Trash2 } from 'lucide-react';
import type { RssChannels } from './useRssChannels';

type Props = {
  channels: RssChannels;
  onClose: () => void;
};

export function RssChannelModal({ channels, onClose }: Props) {
  const {
    rssFeeds, channelCategories, feedDrafts, libraryMaterials, libraryRules,
    newRssName, setNewRssName, newRssUrl, setNewRssUrl, newRssCategory, setNewRssCategory,
    newMaterialIds, setNewMaterialIds, newRuleIds, setNewRuleIds,
    handleAddRss, handleToggleRss, handleDeleteRss, handleSaveFeedWriting,
    changeFeedDraft, toggleFeedMaterial, toggleFeedRule,
  } = channels;

  return (
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onMouseDown={() => onClose()}
      >
        <div
          className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Rss size={18} className="text-orange-400" />
              <h3 className="font-bold text-base">RSS 수집 채널 관리</h3>
            </div>
            <button onClick={() => onClose()} className="text-slate-400 hover:text-white transition">
              <X size={18} />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            {/* 새 채널 등록 폼 */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Plus size={14} className="text-orange-500" /> 새 RSS 채널 등록
              </h4>
              <form onSubmit={handleAddRss} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input 
                    type="text" 
                    value={newRssName} 
                    onChange={(e) => setNewRssName(e.target.value)}
                    placeholder="채널명 (예: GeekNews)" 
                    className="text-xs p-2.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:border-orange-500 font-semibold"
                  />
                  <select
                    value={newRssCategory}
                    onChange={(e) => setNewRssCategory(e.target.value)}
                    className="text-xs p-2.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:border-orange-500 text-slate-700"
                  >
                    <option value="IT/테크">IT / 테크</option>
                    <option value="개발/기술">개발 / 기술</option>
                    <option value="스타트업/비즈니스">스타트업 / 비즈니스</option>
                    <option value="일반 트렌드">일반 트렌드</option>
                  </select>
                  <input 
                    type="text" 
                    value={newRssUrl} 
                    onChange={(e) => setNewRssUrl(e.target.value)}
                    placeholder="RSS URL (https://.../feed)" 
                    className="text-xs p-2.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:border-orange-500 col-span-1 sm:col-span-3 font-mono"
                  />
                </div>
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2">
                  <p className="text-[11px] font-semibold text-emerald-700 mb-2">재료 베이스</p>
                  <div className="flex flex-wrap gap-2">
                    {libraryMaterials.length === 0 ? (
                      <p className="text-[11px] text-emerald-700/70">등록된 재료 베이스가 없습니다. 고르지 않으면 기본 글쓰기를 씁니다.</p>
                    ) : libraryMaterials.map((item) => (
                      <label key={item.id} className={`text-[11px] px-2 py-1 rounded border cursor-pointer ${newMaterialIds.includes(item.id) ? 'bg-emerald-200 border-emerald-500 text-emerald-950' : 'bg-white border-emerald-200 text-emerald-800'}`}>
                        <input
                          type="checkbox"
                          className="mr-1 accent-emerald-600"
                          checked={newMaterialIds.includes(item.id)}
                          onChange={() => setNewMaterialIds((prev) => prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id])}
                        />
                        {item.title || `재료 #${item.id}`}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-orange-300 bg-orange-50 p-2">
                  <p className="text-[11px] font-semibold text-orange-700 mb-2">규칙</p>
                  <div className="flex flex-wrap gap-2">
                    {libraryRules.length === 0 ? (
                      <p className="text-[11px] text-orange-700/70">등록된 규칙이 없습니다.</p>
                    ) : libraryRules.map((rule) => (
                      <label key={rule.id} className={`text-[11px] px-2 py-1 rounded border cursor-pointer ${newRuleIds.includes(rule.id) ? 'bg-orange-200 border-orange-500 text-orange-950' : 'bg-white border-orange-200 text-orange-800'}`}>
                        <input
                          type="checkbox"
                          className="mr-1 accent-orange-600"
                          checked={newRuleIds.includes(rule.id)}
                          onChange={() => setNewRuleIds((prev) => prev.includes(rule.id) ? prev.filter((id) => id !== rule.id) : [...prev, rule.id])}
                        />
                        {rule.title}
                      </label>
                    ))}
                  </div>
                </div>
                <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2 rounded-md text-xs font-bold transition shadow-sm">
                  + RSS 채널 등록하기
                </button>
              </form>
            </div>

            {/* 등록된 RSS 목록 */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">등록된 채널 목록 ({rssFeeds.length})</h4>
              <div className="space-y-2">
                {rssFeeds.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">등록된 RSS 채널이 없습니다.</p>
                ) : (
                  rssFeeds.map(feed => {
                    const draft = feedDrafts[feed.id] || { name: feed.name || '', url: feed.url || '', category: feed.category || 'IT/테크', materialIds: [] as number[], ruleIds: [] as number[] };
                    const categories = draft.category && !channelCategories.includes(draft.category)
                      ? [draft.category, ...channelCategories]
                      : channelCategories;
                    return (
                    <div key={feed.id} className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={draft.name}
                            onChange={(e) => changeFeedDraft(feed.id, { name: e.target.value })}
                            className="text-xs p-2 border border-slate-300 rounded-md bg-slate-50 font-semibold"
                            aria-label={`${feed.name} 채널명`}
                          />
                          <select
                            value={draft.category}
                            onChange={(e) => changeFeedDraft(feed.id, { category: e.target.value })}
                            className="text-xs p-2 border border-slate-300 rounded-md bg-slate-50"
                            aria-label={`${feed.name} 분류`}
                          >
                            {categories.map((category) => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={draft.url}
                            onChange={(e) => changeFeedDraft(feed.id, { url: e.target.value })}
                            className="text-xs p-2 border border-slate-300 rounded-md bg-slate-50 font-mono sm:col-span-3"
                            aria-label={`${feed.name} RSS URL`}
                          />
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleRss(feed.id)}
                            className={`px-2.5 py-1 rounded text-xs font-bold border transition ${feed.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}
                          >
                            {feed.isActive ? '자동수집 켜짐' : '꺼짐'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRss(feed.id)}
                            className="text-slate-300 hover:text-red-500 p-1 rounded transition"
                            title="채널 삭제"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2">
                          <p className="text-[11px] font-semibold text-emerald-700 mb-2">재료 베이스</p>
                          <div className="flex flex-wrap gap-2">
                            {libraryMaterials.length === 0 ? (
                              <p className="text-[11px] text-emerald-700/70">등록된 재료 베이스가 없습니다.</p>
                            ) : libraryMaterials.map((item) => (
                              <label key={item.id} className={`text-[11px] px-2 py-1 rounded border cursor-pointer ${draft.materialIds.includes(item.id) ? 'bg-emerald-200 border-emerald-500 text-emerald-950' : 'bg-white border-emerald-200 text-emerald-800'}`}>
                                <input
                                  type="checkbox"
                                  className="mr-1 accent-emerald-600"
                                  checked={draft.materialIds.includes(item.id)}
                                  onChange={() => toggleFeedMaterial(feed.id, item.id)}
                                />
                                {item.title || `재료 #${item.id}`}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-md border border-orange-300 bg-orange-50 p-2">
                          <p className="text-[11px] font-semibold text-orange-700 mb-2">규칙</p>
                          <div className="flex flex-wrap gap-2">
                            {libraryRules.length === 0 ? (
                              <p className="text-[11px] text-orange-700/70">등록된 규칙이 없습니다.</p>
                            ) : libraryRules.map((rule) => (
                              <label key={rule.id} className={`text-[11px] px-2 py-1 rounded border cursor-pointer ${draft.ruleIds.includes(rule.id) ? 'bg-orange-200 border-orange-500 text-orange-950' : 'bg-white border-orange-200 text-orange-800'}`}>
                                <input
                                  type="checkbox"
                                  className="mr-1 accent-orange-600"
                                  checked={draft.ruleIds.includes(rule.id)}
                                  onChange={() => toggleFeedRule(feed.id, rule.id)}
                                />
                                {rule.title}
                              </label>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSaveFeedWriting(feed.id)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-md bg-slate-800 text-white"
                        >
                          수정 저장
                        </button>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-right">
            <button onClick={() => onClose()} className="text-xs bg-white border border-slate-300 px-4 py-2 rounded-md font-semibold text-slate-700 hover:bg-slate-100 transition shadow-sm">
              닫기
            </button>
          </div>
        </div>
      </div>
  );
}
