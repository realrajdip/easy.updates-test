import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Search, Layers, ClipboardList, GraduationCap, CornerDownRight, X, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStaleData } from '../hooks/useStaleData';
import { API_URL } from '../config';

const SearchModal = ({ open, onClose, onSelectResult }) => {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const resultsContainerRef = useRef(null);

  // Fetchers for SWR cache - these reuse the same cache entries populated by the tabs
  const updatesFetcher = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/updates`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Failed to fetch updates');
    return res.json();
  }, [token]);

  const tasksFetcher = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/tasks`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Failed to fetch tasks');
    return res.json();
  }, [token]);

  const coursesFetcher = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/courses`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Failed to fetch courses');
    return res.json();
  }, [token]);

  const { data: updates, loading: loadingU } = useStaleData('updates', updatesFetcher);
  const { data: tasks, loading: loadingT } = useStaleData('tasks', tasksFetcher);
  const { data: courses, loading: loadingC } = useStaleData('courses', coursesFetcher);

  const loading = loadingU || loadingT || loadingC;

  const safeUpdates = updates || [];
  const safeTasks = tasks || [];
  const safeCourses = courses || [];

  // Focus input on mount
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Compute filtered items
  const results = useMemo(() => {
    if (!query.trim()) return { updates: [], tasks: [], courses: [], flat: [] };
    const q = query.toLowerCase();

    const matchedUpdates = safeUpdates.filter((u) => {
      const title = (u.title || '').toLowerCase();
      const content = (u.content || '').toLowerCase();
      const category = (u.category || '').toLowerCase();
      const creator = (u.creator?.username || '').toLowerCase();
      return title.includes(q) || content.includes(q) || category.includes(q) || creator.includes(q);
    }).slice(0, 5);

    const matchedTasks = safeTasks.filter((t) => {
      const title = (t.title || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const creator = (t.creator?.username || '').toLowerCase();
      const assignees = (t.assignedTo || []).map(a => (a?.username || '')).join(' ').toLowerCase();
      return title.includes(q) || desc.includes(q) || creator.includes(q) || assignees.includes(q);
    }).slice(0, 5);

    const matchedCourses = safeCourses.filter((c) => {
      const title = (c.title || '').toLowerCase();
      const desc = (c.description || '').toLowerCase();
      const tags = (c.tags || []).join(' ').toLowerCase();
      return title.includes(q) || desc.includes(q) || tags.includes(q);
    }).slice(0, 5);

    const flat = [
      ...matchedUpdates.map(u => ({ id: u._id, title: u.title, sub: u.content, type: 'updates', category: u.category })),
      ...matchedTasks.map(t => ({ id: t._id, title: t.title, sub: t.description, type: 'tasks', status: t.status })),
      ...matchedCourses.map(c => ({ id: c._id, title: c.title, sub: c.description, type: 'courses' })),
    ];

    return {
      updates: matchedUpdates,
      tasks: matchedTasks,
      courses: matchedCourses,
      flat,
    };
  }, [query, safeUpdates, safeTasks, safeCourses]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    const flatCount = results.flat.length;
    if (flatCount === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % flatCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flatCount) % flatCount);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selectedItem = results.flat[selectedIndex];
      if (selectedItem) {
        onSelectResult(selectedItem.type, selectedItem.id);
        onClose();
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const activeEl = resultsContainerRef.current?.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[10vh] px-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Search box container */}
      <div className="relative w-full max-w-xl bg-[#141414] border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col max-h-[70vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Input area */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06]">
          <Search className="h-5 w-5 text-ink-dim" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search updates, tasks, tracks..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-[15px] text-ink placeholder-ink-dim outline-none border-none"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-ink-dim" />}
          <button onClick={onClose} className="p-1 hover:bg-white/5 rounded-lg text-ink-dim hover:text-ink transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results area */}
        <div ref={resultsContainerRef} className="flex-1 overflow-y-auto p-2 min-h-[100px]">
          {query.trim() === '' ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center select-none">
              <Search className="h-8 w-8 text-ink-dim opacity-40 mb-3" />
              <p className="text-[13px] text-ink font-medium tracking-tight">Search for updates, tasks, and tracks</p>
              <p className="text-[11px] text-ink-dim mt-1 max-w-[280px]">
                Search matches keywords in titles, content details, categories, creators, and assignees.
              </p>
            </div>
          ) : results.flat.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center select-none">
              <p className="text-[13px] text-ink font-medium tracking-tight">No results found for "{query}"</p>
              <p className="text-[11px] text-ink-dim mt-1">Try searching for other keywords.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 py-1">
              {/* Categorized Render */}
              {results.flat.map((item, index) => {
                const isActive = index === selectedIndex;
                let Icon = Layers;
                let typeLabel = 'Update';
                let tagText = item.category;

                if (item.type === 'tasks') {
                  Icon = ClipboardList;
                  typeLabel = 'Task';
                  tagText = item.status?.replace('_', ' ');
                } else if (item.type === 'courses') {
                  Icon = GraduationCap;
                  typeLabel = 'Track';
                  tagText = '';
                }

                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    data-active={isActive}
                    onClick={() => {
                      onSelectResult(item.type, item.id);
                      onClose();
                    }}
                    className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer select-none transition-all ${
                      isActive
                        ? 'bg-accent/10 border border-accent/20'
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${isActive ? 'bg-accent/20 text-accent' : 'bg-white/5 text-ink-dim'}`}>
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] font-semibold text-accent/80 uppercase tracking-wider">{typeLabel}</span>
                        {tagText && (
                          <span className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/5 text-[9px] uppercase tracking-wider text-ink-dim font-medium">
                            {tagText}
                          </span>
                        )}
                      </div>
                      <h4 className="text-[13.5px] font-medium text-ink truncate">{item.title}</h4>
                      <p className="text-[11px] text-ink-dim truncate mt-0.5 max-w-[420px]">{item.sub}</p>
                    </div>

                    {isActive && (
                      <div className="self-center pr-2 text-accent/80">
                        <CornerDownRight className="h-4 w-4 animate-pulse" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-white/[0.02] border-t border-white/[0.04] flex items-center justify-between text-[10px] text-ink-dim select-none font-medium">
          <span>Navigate with <kbd className="font-mono bg-white/5 border border-white/10 px-1 py-0.5 rounded">↑↓</kbd> arrows</span>
          <span>Select with <kbd className="font-mono bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">Enter</kbd></span>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SearchModal;
