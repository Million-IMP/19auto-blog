import { Rss, Plus, X, Trash2 } from 'lucide-react';
import { buttonClass, cn, fieldClass } from '../ui';
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
        className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onMouseDown={() => onClose()}
      >
        <div
          className="bg-surface rounded-card shadow-pop max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-line animate-in fade-in zoom-in duration-150"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 bg-surface-3 text-ink flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Rss size={18} className="text-draft" />
              <h3 className="font-bold text-base">RSS 수집 채널 관리</h3>
            </div>
            <button type="button" onClick={() => onClose()} aria-label="닫기" title="닫기" className="text-ink-3 hover:text-ink transition">
              <X size={18} />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            {/* 새 채널 등록 폼 */}
            <div className="bg-surface-2 border border-line rounded-control p-4">
              <h4 className="text-xs font-bold text-ink-2 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Plus size={14} className="text-draft" /> 새 RSS 채널 등록
              </h4>
              <form onSubmit={handleAddRss} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input 
                    type="text" 
                    value={newRssName} 
                    onChange={(e) => setNewRssName(e.target.value)}
                    placeholder="채널명 (예: GeekNews)" 
                    className={cn(fieldClass, 'text-xs! font-semibold')}
                  />
                  <select
                    value={newRssCategory}
                    onChange={(e) => setNewRssCategory(e.target.value)}
                    className={cn(fieldClass, 'text-xs!')}
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
                    className={cn(fieldClass, 'text-xs! col-span-1 sm:col-span-3 font-mono')}
                  />
                </div>
                <div className="rounded-control border border-published/40 bg-published/10 p-2">
                  <p className="text-xs font-semibold text-published mb-2">재료 베이스</p>
                  <div className="flex flex-wrap gap-2">
                    {libraryMaterials.length === 0 ? (
                      <p className="text-xs text-published/70">등록된 재료 베이스가 없습니다. 고르지 않으면 기본 글쓰기를 씁니다.</p>
                    ) : libraryMaterials.map((item) => (
                      <label key={item.id} className={`text-xs px-2 py-1 rounded-control border cursor-pointer ${newMaterialIds.includes(item.id) ? 'bg-published/20 border-published text-published' : 'bg-surface border-line text-ink-2 hover:border-published/40'}`}>
                        <input
                          type="checkbox"
                          className="mr-1"
                          checked={newMaterialIds.includes(item.id)}
                          onChange={() => setNewMaterialIds((prev) => prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id])}
                        />
                        {item.title || `재료 #${item.id}`}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="rounded-control border border-draft/40 bg-draft/10 p-2">
                  <p className="text-xs font-semibold text-draft mb-2">규칙</p>
                  <div className="flex flex-wrap gap-2">
                    {libraryRules.length === 0 ? (
                      <p className="text-xs text-draft/70">등록된 규칙이 없습니다.</p>
                    ) : libraryRules.map((rule) => (
                      <label key={rule.id} className={`text-xs px-2 py-1 rounded-control border cursor-pointer ${newRuleIds.includes(rule.id) ? 'bg-draft/20 border-draft text-draft' : 'bg-surface border-line text-ink-2 hover:border-draft/40'}`}>
                        <input
                          type="checkbox"
                          className="mr-1"
                          checked={newRuleIds.includes(rule.id)}
                          onChange={() => setNewRuleIds((prev) => prev.includes(rule.id) ? prev.filter((id) => id !== rule.id) : [...prev, rule.id])}
                        />
                        {rule.title}
                      </label>
                    ))}
                  </div>
                </div>
                <button type="submit" className={buttonClass('primary', 'md', 'w-full')}>
                  + RSS 채널 등록하기
                </button>
              </form>
            </div>

            {/* 등록된 RSS 목록 */}
            <div>
              <h4 className="text-xs font-bold text-ink-2 uppercase tracking-wider mb-3">등록된 채널 목록 ({rssFeeds.length})</h4>
              <div className="space-y-2">
                {rssFeeds.length === 0 ? (
                  <p className="text-xs text-ink-3 py-6 text-center">등록된 RSS 채널이 없습니다.</p>
                ) : (
                  rssFeeds.map(feed => {
                    const draft = feedDrafts[feed.id] || { name: feed.name || '', url: feed.url || '', category: feed.category || 'IT/테크', materialIds: [] as number[], ruleIds: [] as number[] };
                    const categories = draft.category && !channelCategories.includes(draft.category)
                      ? [draft.category, ...channelCategories]
                      : channelCategories;
                    return (
                    <div key={feed.id} className="p-3 bg-surface border border-line rounded-control">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={draft.name}
                            onChange={(e) => changeFeedDraft(feed.id, { name: e.target.value })}
                            className={cn(fieldClass, 'text-xs! font-semibold')}
                            aria-label={`${feed.name} 채널명`}
                          />
                          <select
                            value={draft.category}
                            onChange={(e) => changeFeedDraft(feed.id, { category: e.target.value })}
                            className={cn(fieldClass, 'text-xs!')}
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
                            className={cn(fieldClass, 'text-xs! font-mono sm:col-span-3')}
                            aria-label={`${feed.name} RSS URL`}
                          />
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleRss(feed.id)}
                            className={`px-2.5 py-1 rounded-control text-xs font-bold border transition ${feed.isActive ? 'bg-published/10 text-published border-published/40' : 'bg-surface-2 text-ink-3 border-line'}`}
                          >
                            {feed.isActive ? '자동수집 켜짐' : '꺼짐'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRss(feed.id)}
                            className="text-ink-3 hover:text-danger p-1 rounded-control transition"
                            title="채널 삭제"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="rounded-control border border-published/40 bg-published/10 p-2">
                          <p className="text-xs font-semibold text-published mb-2">재료 베이스</p>
                          <div className="flex flex-wrap gap-2">
                            {libraryMaterials.length === 0 ? (
                              <p className="text-xs text-published/70">등록된 재료 베이스가 없습니다.</p>
                            ) : libraryMaterials.map((item) => (
                              <label key={item.id} className={`text-xs px-2 py-1 rounded-control border cursor-pointer ${draft.materialIds.includes(item.id) ? 'bg-published/20 border-published text-published' : 'bg-surface border-line text-ink-2 hover:border-published/40'}`}>
                                <input
                                  type="checkbox"
                                  className="mr-1"
                                  checked={draft.materialIds.includes(item.id)}
                                  onChange={() => toggleFeedMaterial(feed.id, item.id)}
                                />
                                {item.title || `재료 #${item.id}`}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-control border border-draft/40 bg-draft/10 p-2">
                          <p className="text-xs font-semibold text-draft mb-2">규칙</p>
                          <div className="flex flex-wrap gap-2">
                            {libraryRules.length === 0 ? (
                              <p className="text-xs text-draft/70">등록된 규칙이 없습니다.</p>
                            ) : libraryRules.map((rule) => (
                              <label key={rule.id} className={`text-xs px-2 py-1 rounded-control border cursor-pointer ${draft.ruleIds.includes(rule.id) ? 'bg-draft/20 border-draft text-draft' : 'bg-surface border-line text-ink-2 hover:border-draft/40'}`}>
                                <input
                                  type="checkbox"
                                  className="mr-1"
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
                          className={buttonClass('primary', 'sm')}
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

          <div className="px-6 py-3 bg-surface-2 border-t border-line text-right">
            <button onClick={() => onClose()} className="text-xs bg-surface border border-line-strong px-4 py-2 rounded-control font-semibold text-ink-2 hover:bg-surface-2 transition">
              닫기
            </button>
          </div>
        </div>
      </div>
  );
}
