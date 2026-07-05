import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import {
  Pin, Calendar, RefreshCcw, Send, MessageSquare, Check, X, Plus,
  Users, Clock, Repeat2, Loader2, MoreHorizontal, Trash2, Edit2,
  Search, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { API_URL } from '../config';
import UserAvatar from './UserAvatar';
import Modal, { useModalTitleId } from './Modal';
import DateTimePicker from './DateTimePicker';
import Select from './Select';
import ConfirmModal from './ConfirmModal';
import { useStaleData } from '../hooks/useStaleData';

/* ── Helper: normalise assignedTo to always be an array ─────────────────── */
const toArray = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return [v]; // legacy single ObjectId / populated object
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pinned', label: 'Pinned' },
  { key: 'pending', label: 'Needs ack' },
  { key: 'mine', label: 'My posts' },
  { key: 'archive', label: 'Archive' },
];

const UpdatesTab = ({ onOpenThread, allUsers = [], highlightedUpdateId, clearHighlight }) => {
  const { token, user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState(null);

  const [activeMenuId, setActiveMenuId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [activeHighlightId, setActiveHighlightId] = useState(null);

  // Stale-while-revalidate: show cached data immediately, refresh silently
  const fetcher = useMemo(() => async () => {
    const res = await fetch(`${API_URL}/api/updates`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    return res.json();
  }, [token]);

  const {
    data: updates,
    loading,
    error: fetchError,
    refresh: refreshUpdates,
    setDataAndCache: setUpdates,
  } = useStaleData('updates', fetcher);

  useEffect(() => {
    if (fetchError) toast.error('Could not load updates. Check your connection.');
  }, [fetchError]); // eslint-disable-line

  // Close dropdown on outside click
  useEffect(() => {
    const handleGlobalClick = () => setActiveMenuId(null);
    if (activeMenuId) window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [activeMenuId]);

  // Handle scrolling and temporary highlight when highlightedUpdateId is provided
  useEffect(() => {
    if (highlightedUpdateId) {
      setFilter('all');
      setActiveHighlightId(highlightedUpdateId);

      const scrollTimer = setTimeout(() => {
        const element = document.getElementById(`update-${highlightedUpdateId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);

      const timer = setTimeout(() => {
        setActiveHighlightId(null);
        if (clearHighlight) clearHighlight();
      }, 3000);

      return () => {
        clearTimeout(scrollTimer);
        clearTimeout(timer);
      };
    }
  }, [highlightedUpdateId]); // eslint-disable-line

  useEffect(() => {
    if (!socket) return;
    const onNew = (newUpdate) =>
      setUpdates((prev) => {
        if (!prev) return [{ ...newUpdate, isJustAdded: true }];
        if (prev.some((u) => u._id === newUpdate._id)) return prev;
        const next = [{ ...newUpdate, isJustAdded: true }, ...prev];
        return next.sort((a, b) => {
          if (a.isPinned && b.isPinned) return new Date(b.createdAt) - new Date(a.createdAt);
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
      });
    const onAck = (u) =>
      setUpdates((prev) => (prev || []).map((x) => (x._id === u._id ? u : x)));

    const onEdited = (editedUpdate) => {
      setUpdates((prev) => {
        const next = (prev || []).map((x) => (x._id === editedUpdate._id ? editedUpdate : x));
        return next.sort((a, b) => {
          if (a.isPinned && b.isPinned) return new Date(b.createdAt) - new Date(a.createdAt);
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
      });
    };

    const onDeleted = ({ id }) => {
      setUpdates((prev) => (prev || []).filter((u) => u._id !== id));
    };

    socket.on('update:new', onNew);
    socket.on('update:acknowledged', onAck);
    socket.on('update:edited', onEdited);
    socket.on('update:deleted', onDeleted);
    return () => {
      socket.off('update:new', onNew);
      socket.off('update:acknowledged', onAck);
      socket.off('update:edited', onEdited);
      socket.off('update:deleted', onDeleted);
    };
  }, [socket]);

  /* ── Optimistic acknowledge ───────────────────────────────────────── */
  const handleAcknowledge = async (e, updateId) => {
    e.stopPropagation();
    const currentUserId = user?.id || user?._id;
    if (!currentUserId) return;

    const optimisticAck = {
      _id: currentUserId,
      username: user?.username,
      avatarColor: user?.avatarColor,
    };
    let snapshot;
    setUpdates((prev) => {
      snapshot = prev;
      return (prev || []).map((u) => {
        if (u._id !== updateId) return u;
        if (u.acknowledgedBy.some((a) => (a._id || a) === currentUserId)) return u;
        return { ...u, acknowledgedBy: [...u.acknowledgedBy, optimisticAck] };
      });
    });

    try {
      const res = await fetch(`${API_URL}/api/updates/${updateId}/acknowledge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const updated = await res.json();
      setUpdates((prev) => (prev || []).map((u) => (u._id === updateId ? updated : u)));
      toast.success('Update acknowledged!');
    } catch (err) {
      console.error(err);
      if (snapshot != null) setUpdates(snapshot);
      toast.error('Acknowledge failed — please try again.');
    }
  };

  /* ── Pin, Edit, Delete Handlers ───────────────────────────────────── */
  const handleTogglePin = async (updateId) => {
    try {
      const res = await fetch(`${API_URL}/api/updates/${updateId}/pin`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Toggle pin failed');
    } catch (err) {
      console.error(err);
      toast.error('Could not toggle pin.');
    }
  };

  const handleDelete = async (updateId) => {
    try {
      const res = await fetch(`${API_URL}/api/updates/${updateId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Update deleted');
    } catch (err) {
      console.error(err);
      toast.error('Could not delete update.');
    } finally {
      setDeleteConfirmId(null);
    }
  };

  /* ── isRelevantToMe: true when update is for whole team OR I am assigned ── */
  const isRelevantToMe = (u) => {
    const currentUserId = user?.id || user?._id;
    const assignees = toArray(u.assignedTo);
    if (assignees.length === 0) return true; // whole team
    return assignees.some((a) => (a._id || a) === currentUserId);
  };

  const isFullyAcknowledged = (u) => {
    const assignees = toArray(u.assignedTo);
    const ackIds = u.acknowledgedBy.map((a) => (a._id || a));
    if (assignees.length > 0) {
      return assignees.every((assignee) => {
        const assigneeId = assignee._id || assignee;
        return ackIds.includes(assigneeId);
      });
    } else {
      if (allUsers.length === 0) return false;
      return allUsers.every((user) => {
        const userId = user._id || user;
        return ackIds.includes(userId);
      });
    }
  };

  const safeUpdates = updates || [];

  const filtered = safeUpdates.filter((u) => {
    const currentUserId = user?.id || user?._id;
    const isArchived = isFullyAcknowledged(u);
    if (filter === 'archive') {
      return isArchived;
    }
    if (isArchived) return false;

    if (filter === 'pinned') return u.isPinned;
    if (filter === 'pending') {
      const creatorId = u.creator?._id || u.creator;
      return (
        creatorId !== currentUserId &&
        isRelevantToMe(u) &&
        !u.acknowledgedBy.some((a) => (a._id || a) === currentUserId)
      );
    }
    if (filter === 'mine') {
      const creatorId = u.creator?._id || u.creator;
      return creatorId === currentUserId;
    }
    return true;
  });

  const pendingCount = safeUpdates.filter((u) => {
    const currentUserId = user?.id || user?._id;
    const creatorId = u.creator?._id || u.creator;
    return (
      creatorId !== currentUserId &&
      isRelevantToMe(u) &&
      !u.acknowledgedBy.some((a) => (a._id || a) === currentUserId)
    );
  }).length;

  return (
    <div className="w-full flex flex-col gap-8 animate-fade-in">
      {/* Hero band */}
      <section className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <div className="flex flex-col gap-5 py-2">
          <p className="text-[12px] uppercase tracking-[0.18em] text-ink-dim">Feed</p>
          <h1 className="display-lg">
            What happened
            <br />
            on shift.
          </h1>
          <p className="text-[15px] text-ink-muted max-w-md tracking-tight">
            {pendingCount > 0
              ? `${pendingCount} update${pendingCount > 1 ? 's' : ''} waiting for your acknowledgment.`
              : "You're caught up on every shift handover."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setEditingUpdate(null); setShowModal(true); }} className="btn btn-primary">
              <Plus className="h-4 w-4" />
              New update
            </button>
            <button onClick={fetchUpdates} className="btn btn-secondary">
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>

        <div className="spotlight spotlight-violet flex flex-col justify-between min-h-[200px] !p-6">
          <div>
            <p className="text-[12px] uppercase tracking-[0.18em] opacity-80">Live feed</p>
            <p className="font-display font-medium text-[20px] sm:text-[24px] xl:text-[28px] 2xl:text-[32px] mt-2 leading-tight whitespace-nowrap">
              {pendingCount} update{pendingCount === 1 ? '' : 's'} to acknowledge.
            </p>
            <p className="text-[12px] opacity-70 mt-1 font-medium tracking-tight">
              {updates.length} total update{updates.length === 1 ? '' : 's'} on record
            </p>
          </div>
          <p className="text-[13px] opacity-80 tracking-tight">
            Pin critical items so the next shift sees them first.
          </p>
        </div>
      </section>

      {/* Filter pill row */}
      <div
        role="tablist"
        aria-label="Filter updates"
        className="flex items-center gap-1 surface-1 self-start p-1 rounded-pill border border-hairline-soft"
      >
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`pill-tab ${filter === f.key ? 'is-active has-motion' : ''} relative z-10`}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {filter === f.key && (
              <motion.span
                layoutId="updates-filter-bg"
                className="absolute inset-0 bg-surface-2 rounded-pill -z-10"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            {f.label}
            {f.key === 'pending' && pendingCount > 0 && (
              <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="loader-ring" />
            <span className="text-[12px] text-ink-muted tracking-[0.16em] uppercase">
              Loading feed
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed border-hairline bg-surface-1/10 text-center animate-fade-in select-none">
            <p className="text-[13px] text-ink font-medium tracking-tight">No updates here yet</p>
            <p className="text-[11px] text-ink-muted mt-1.5 max-w-[240px] leading-relaxed">
              When shift updates or handovers are published, they will appear in this feed.
            </p>
          </div>
        ) : (
          filtered.map((u) => {
            const currentUserId = user?.id || user?._id;
            const creatorId = u.creator?._id || u.creator;
            const assignees = toArray(u.assignedTo);
            const hasAck =
              creatorId === currentUserId ||
              u.acknowledgedBy.some((a) => (a._id || a) === currentUserId);
            return (
              <article
                key={u._id}
                id={`update-${u._id}`}
                className={`card flex flex-col gap-4 transition-all duration-200 border ${
                  u._id === activeHighlightId
                    ? 'border-accent shadow-[0_0_0_3px_rgba(0,153,255,0.25)] ring-2 ring-accent'
                    : u.isJustAdded ? 'animate-approach ' : ''
                }${u.isPinned && u._id !== activeHighlightId
                    ? 'border-accent/45 bg-surface-1 shadow-[0_4px_20px_rgba(0,153,255,0.06)]'
                    : u._id === activeHighlightId
                      ? 'bg-surface-1'
                      : !hasAck
                        ? 'border-hairline bg-surface-1'
                        : 'border-transparent bg-surface-1/40 opacity-60'
                }`}
              >
                <header className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar user={u.creator} size="sm" />
                    <div className="min-w-0">
                      <p className="text-[13px] text-ink tracking-tight font-medium truncate">
                        @{u.creator.username}
                      </p>
                      <p className="text-[11px] text-ink-muted tracking-tight">
                        {new Date(u.createdAt).toLocaleDateString()} ·{' '}
                        {new Date(u.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 relative">
                    {u.isPinned && (
                      <span className="chip chip-accent">
                        <Pin className="h-3 w-3" />
                        Pinned
                      </span>
                    )}
                    {u.isRecurring && (
                      <span className="chip">
                        <RefreshCcw className="h-3 w-3" />
                        {u.recurrenceRule}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === u._id ? null : u._id);
                      }}
                      className="btn-icon h-7 w-7 opacity-60 hover:opacity-100"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {activeMenuId === u._id && (
                      <div
                        className="absolute right-0 top-full mt-1 w-40 bg-surface-2 border border-hairline rounded-md shadow-[0_12px_32px_rgba(0,0,0,0.4)] z-10 py-1 overflow-hidden animate-fade-in"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            setActiveMenuId(null);
                            handleTogglePin(u._id);
                          }}
                          className="w-full text-left px-3 py-2 text-[13px] text-ink hover:bg-surface-3 flex items-center gap-2 transition-colors"
                        >
                          <Pin className="h-3.5 w-3.5 text-ink-muted" />
                          {u.isPinned ? 'Unpin update' : 'Pin to top'}
                        </button>
                        {creatorId === currentUserId && (
                          <>
                            <button
                              onClick={() => {
                                setActiveMenuId(null);
                                setEditingUpdate(u);
                                setShowModal(true);
                              }}
                              className="w-full text-left px-3 py-2 text-[13px] text-ink hover:bg-surface-3 flex items-center gap-2 transition-colors"
                            >
                              <Edit2 className="h-3.5 w-3.5 text-ink-muted" />
                              Edit update
                            </button>
                            <button
                              onClick={() => {
                                setActiveMenuId(null);
                                setDeleteConfirmId(u._id);
                              }}
                              className="w-full text-left px-3 py-2 text-[13px] text-danger hover:bg-danger/10 flex items-center gap-2 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-danger/70" />
                              Delete update
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </header>

                <p className="text-[15px] text-ink leading-relaxed tracking-tight whitespace-pre-wrap">
                  {u.description}
                </p>

                {/* Assignee indicator */}
                {assignees.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-ink-dim">For</span>
                    <div className="flex items-center gap-1.5">
                      <AvatarStack users={assignees} max={4} />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="chip">
                      <Users className="h-3 w-3" />
                      Whole team
                    </span>
                  </div>
                )}

                <footer className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-hairline-soft">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenThread({ type: 'acks', id: u._id });
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      <Check className="h-3.5 w-3.5 text-success" />
                      <span>{u.acknowledgedBy.length} acknowledged</span>
                    </button>
                    {u.eta && (
                      <span className="flex items-center gap-1 text-[12px] text-accent tracking-tight">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(u.eta).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenThread({ type: 'discussion_update', id: u._id });
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Discuss
                    </button>
                    {!hasAck ? (
                      <button
                        onClick={(e) => handleAcknowledge(e, u._id)}
                        className="btn btn-primary btn-sm"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Acknowledge
                      </button>
                    ) : (
                      <span className="btn btn-secondary btn-sm text-success border-success/35 select-none cursor-default">
                        <Check className="h-3.5 w-3.5" />
                        Acknowledged
                      </span>
                    )}
                  </div>
                </footer>
              </article>
            );
          })
        )}
      </div>

      {/* Compose modal */}
      <ComposeUpdateModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingUpdate(null); }}
        initialUpdate={editingUpdate}
        allUsers={allUsers}
        onPublished={(savedUpdate) => {
          if (savedUpdate) {
            setUpdates((prev) => {
              if (editingUpdate) {
                return prev.map(u => u._id === savedUpdate._id ? savedUpdate : u);
              }
              return prev.some((u) => u._id === savedUpdate._id) ? prev : [savedUpdate, ...prev];
            });
          }
          toast.success(editingUpdate ? 'Update edited.' : 'Update published.');
        }}
        onFailed={() => toast.error('Could not save — please try again.')}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        maxWidth={400}
        align="center"
      >
        <div className="p-6 flex flex-col gap-6">
          <div>
            <h3 className="text-lg font-bold text-ink">
              Delete Update
            </h3>
            <p className="text-[13px] text-ink-muted mt-2 leading-relaxed">
              Are you sure you want to permanently delete this update? This action cannot be undone and will remove all associated comments.
            </p>
          </div>
          <div className="flex items-center gap-3 justify-end">
            <button
              className="px-4 py-2 rounded-pill bg-surface-2 text-ink hover:bg-white/10 transition-colors text-[13px] font-medium border border-transparent hover:border-hairline"
              onClick={() => setDeleteConfirmId(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary bg-danger text-white border-transparent hover:bg-danger/80"
              onClick={() => handleDelete(deleteConfirmId)}
            >
              Delete permanently
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

/* ─── Avatar stack (null-safe) ──────────────────────────────────────────── */
const AvatarStack = ({ users = [], max = 4 }) => {
  const valid = users.filter(Boolean);
  const shown = valid.slice(0, max);
  const extra = valid.length - max;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((u, i) => (
        <div key={u._id || i} className="ring-2 ring-surface-1 rounded-full" title={`@${u.username}`}>
          <UserAvatar user={u} size="xs" noTooltip />
        </div>
      ))}
      {extra > 0 && (
        <div
          className="w-5 h-5 rounded-full bg-surface-3 ring-2 ring-surface-1 flex items-center justify-center text-[9px] font-bold text-ink-muted"
          title={`+${extra} more`}
        >
          +{extra}
        </div>
      )}
    </div>
  );
};

/* ─── Multi-member picker ───────────────────────────────────────────────── */
const MemberPicker = ({ value = [], onChange, allUsers, label = 'Assign to' }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState({});
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  // Compute dropdown position from trigger rect so it escapes overflow clipping
  const reposition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropH = 280; // approx max dropdown height
    const openBelow = spaceBelow >= dropH || spaceBelow >= 160;
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 99999,
      ...(openBelow
        ? { top: rect.bottom + 4 }
        : { bottom: window.innerHeight - rect.top + 4 }),
    });
  }, []);

  // Open / close
  const handleToggle = () => {
    if (!open) reposition();
    setOpen((v) => !v);
    if (open) setSearch('');
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        !e.target.closest('[data-member-picker-portal]')
      ) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reposition on scroll / resize while open
  useEffect(() => {
    if (!open) return;
    const handle = () => reposition();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [open, reposition]);

  const toggle = (userId) => {
    if (value.includes(userId)) {
      onChange(value.filter((id) => id !== userId));
    } else {
      onChange([...value, userId]);
    }
  };

  const remove = (userId, e) => {
    e.stopPropagation();
    onChange(value.filter((id) => id !== userId));
  };

  const filtered = allUsers.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  const selectedUsers = value.map((id) => allUsers.find((u) => u._id === id)).filter(Boolean);

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-ink-dim">
        <Users className="h-3 w-3" />
        {label}
      </label>

      {/* Selected chips */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {selectedUsers.map((u) => (
            <span
              key={u._id}
              className="flex items-center gap-1 bg-accent/10 border border-accent/30 text-accent rounded-pill px-2 py-0.5 text-[11px] font-medium"
            >
              <span
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
                style={{ backgroundColor: u.avatarColor || '#0099ff' }}
              >
                {u.username.slice(0, 1).toUpperCase()}
              </span>
              @{u.username}
              <button
                type="button"
                onClick={(e) => remove(u._id, e)}
                className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                aria-label={`Remove @${u.username}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="input flex items-center justify-between text-left"
      >
        <span className={selectedUsers.length === 0 ? 'text-ink-dim' : 'text-ink'}>
          {selectedUsers.length === 0 ? 'Whole team (no specific assignee)' : `${selectedUsers.length} member${selectedUsers.length > 1 ? 's' : ''} selected`}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-ink-dim transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown — portalled to body so it escapes overflow clipping */}
      {open && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          data-member-picker-portal
          style={dropdownStyle}
          className="bg-surface-2 border border-hairline rounded-lg shadow-[0_12px_32px_rgba(0,0,0,0.6)] overflow-hidden animate-fade-in"
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-hairline-soft">
            <Search className="h-3 w-3 text-ink-dim shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members…"
              className="bg-transparent text-[12px] text-ink placeholder:text-ink-dim outline-none flex-1"
            />
          </div>

          {/* Options list */}
          <div className="max-h-[180px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-[12px] text-ink-dim text-center py-4">No members found</p>
            ) : (
              filtered.map((u) => {
                const selected = value.includes(u._id);
                return (
                  <button
                    key={u._id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()} // prevent losing focus from search input
                    onClick={() => toggle(u._id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors ${selected ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-surface-3'
                      }`}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                      style={{ backgroundColor: u.avatarColor || '#0099ff' }}
                    >
                      {u.username.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="flex-1 text-left tracking-tight">@{u.username}</span>
                    {selected && <Check className="h-3 w-3 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Clear all */}
          {value.length > 0 && (
            <div className="border-t border-hairline-soft px-3 py-2">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange([])}
                className="text-[11px] text-ink-dim hover:text-danger transition-colors"
              >
                Clear selection (assign to whole team)
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

/* ─── Compose modal ─────────────────────────────────────────────────────── */
const ComposeUpdateModal = ({ open, onClose, allUsers, onPublished, onFailed, initialUpdate }) => {
  const { token } = useAuth();
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState([]); // array of user IDs
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState('shift');
  const [eta, setEta] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const textareaRef = useRef(null);
  const minEta = nowDatetimeLocal();

  // Derive initial assignedTo IDs from initialUpdate
  const initialAssignedIds = React.useMemo(() => {
    if (!initialUpdate) return [];
    return toArray(initialUpdate.assignedTo)
      .filter(Boolean)
      .map((u) => (typeof u === 'string' ? u : u._id));
  }, [initialUpdate]);

  useEffect(() => {
    if (open) {
      if (initialUpdate) {
        setDescription(initialUpdate.description || '');
        setAssignedTo(initialAssignedIds);
        setIsRecurring(initialUpdate.isRecurring || false);
        setRecurrenceRule(
          initialUpdate.recurrenceRule && initialUpdate.recurrenceRule !== 'none'
            ? initialUpdate.recurrenceRule
            : 'shift'
        );
        setEta(initialUpdate.eta ? new Date(initialUpdate.eta).toISOString().slice(0, 16) : '');
        setIsPinned(initialUpdate.isPinned || false);
      } else {
        reset();
      }
    }
  }, [open, initialUpdate]); // eslint-disable-line

  const reset = () => {
    setDescription('');
    setAssignedTo([]);
    setIsRecurring(false);
    setRecurrenceRule('shift');
    setEta('');
    setIsPinned(false);
  };

  const arraysEqual = (a, b) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();

  const dirty =
    description.trim() !== (initialUpdate?.description || '') ||
    !arraysEqual(assignedTo, initialAssignedIds) ||
    isRecurring !== (initialUpdate?.isRecurring || false) ||
    eta !== (initialUpdate?.eta ? new Date(initialUpdate.eta).toISOString().slice(0, 16) : '') ||
    isPinned !== (initialUpdate?.isPinned || false);

  const handleClose = () => {
    if (isSubmitting) return;
    if (dirty) {
      setShowDiscardConfirm(true);
      return;
    }
    reset();
    onClose?.();
  };

  const forceClose = () => {
    setShowDiscardConfirm(false);
    reset();
    onClose?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const url = initialUpdate ? `${API_URL}/api/updates/${initialUpdate._id}` : `${API_URL}/api/updates`;
      const method = initialUpdate ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          description,
          assignedTo, // array — empty means whole team
          isRecurring,
          recurrenceRule: isRecurring ? recurrenceRule : 'none',
          eta: eta || null,
          isPinned,
        }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const savedUpdate = await res.json().catch(() => null);
      reset();
      onClose?.();
      onPublished?.(savedUpdate);
    } catch (err) {
      console.error(err);
      onFailed?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        open={open && !showDiscardConfirm}
        onClose={handleClose}
        maxWidth={600}
        align="bottom-sheet"
        initialFocus={textareaRef}
      >
        <ComposeForm
          textareaRef={textareaRef}
          description={description}
          setDescription={setDescription}
          assignedTo={assignedTo}
          setAssignedTo={setAssignedTo}
          isRecurring={isRecurring}
          setIsRecurring={setIsRecurring}
          recurrenceRule={recurrenceRule}
          setRecurrenceRule={setRecurrenceRule}
          eta={eta}
          setEta={setEta}
          minEta={minEta}
          isPinned={isPinned}
          setIsPinned={setIsPinned}
          isSubmitting={isSubmitting}
          allUsers={allUsers}
          isEditing={!!initialUpdate}
          onSubmit={handleSubmit}
          onClose={handleClose}
        />
      </Modal>

      {/* Discard Confirmation — separate portal so Escape only closes this */}
      <ConfirmModal
        open={showDiscardConfirm}
        title="Discard Changes?"
        message="You have unsaved changes. Are you sure you want to discard them?"
        confirmText="Discard"
        cancelText="Keep editing"
        onConfirm={forceClose}
        onCancel={() => setShowDiscardConfirm(false)}
        isDanger={false}
      />
    </>
  );
};

const ComposeForm = ({
  textareaRef,
  description,
  setDescription,
  assignedTo,
  setAssignedTo,
  isRecurring,
  setIsRecurring,
  recurrenceRule,
  setRecurrenceRule,
  eta,
  setEta,
  minEta,
  isPinned,
  setIsPinned,
  isSubmitting,
  allUsers,
  isEditing,
  onSubmit,
  onClose,
}) => {
  const titleId = useModalTitleId();
  const remaining = 800 - description.length;
  return (
    <form onSubmit={onSubmit}>
      {/* Sticky header — stays at top as content scrolls */}
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-hairline-soft bg-surface-1">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">
            {isEditing ? 'Edit' : 'Compose'}
          </p>
          <h2 id={titleId} className="display-md mt-0.5">
            {isEditing ? 'Edit shift update' : 'New shift update'}
          </h2>
          <p className="text-[12px] text-ink-muted mt-1 tracking-tight">
            {isEditing ? 'Make changes to your update record.' : 'Share what happened — your team will see this at handover.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn-icon"
          aria-label="Close compose dialog"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Scrollable body — just normal flow, panel handles scrolling */}
      <div className="flex flex-col gap-4 px-6 py-5">
        <Field
          label="What happened on shift?"
          meta={`${remaining} chars left`}
          metaTone={remaining < 0 ? 'text-danger' : 'text-ink-dim'}
        >
          <textarea
            ref={textareaRef}
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 800))}
            placeholder="Key incidents, blockers, things to watch tonight…"
            className="input min-h-[120px]"
            required
          />
        </Field>

        {/* Full-width member picker */}
        <MemberPicker
          value={assignedTo}
          onChange={setAssignedTo}
          allUsers={allUsers}
          label="Assign to (optional — leave empty for whole team)"
        />

        <Field label="Target closure" optional icon={Clock}>
          <DateTimePicker
            value={eta}
            onChange={setEta}
            min={minEta}
            optional
          />
        </Field>

        <div className="surface-2 rounded-md overflow-hidden border border-hairline-soft">
          <ComposeToggle
            icon={<Repeat2 className="h-4 w-4" />}
            label="Recurring at handover"
            hint="Repeats so each shift sees it"
            checked={isRecurring}
            onChange={setIsRecurring}
          />
          {isRecurring && (
            <div className="px-4 pb-4 pt-2 border-t border-hairline-soft">
              <Field label="Interval">
                <Select
                  value={recurrenceRule}
                  onChange={setRecurrenceRule}
                  options={[
                    { value: 'shift', label: 'Every shift handover' },
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' }
                  ]}
                />
              </Field>
            </div>
          )}
          <div className="border-t border-hairline-soft">
            <ComposeToggle
              icon={<Pin className="h-4 w-4" />}
              label="Pin to top"
              hint="Surface above the regular feed"
              checked={isPinned}
              onChange={setIsPinned}
            />
          </div>
        </div>
      </div>

      {/* Sticky footer — stays at bottom as content scrolls */}
      <div className="sticky bottom-0 z-10 flex gap-3 px-6 py-4 border-t border-hairline-soft bg-surface-1">
        <button
          type="button"
          onClick={onClose}
          className="btn btn-secondary flex-1"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary flex-1"
          disabled={isSubmitting || !description.trim()}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Publishing…
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              {isEditing ? 'Save changes' : 'Publish'}
            </>
          )}
        </button>
      </div>
    </form>
  );
};


const Field = ({ label, children, icon: Icon, optional, meta, metaTone }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center justify-between">
      <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-ink-dim">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
        {optional && (
          <span className="text-[10px] normal-case tracking-tight text-ink-dim/80">(optional)</span>
        )}
      </label>
      {meta && <span className={`text-[10px] tracking-tight ${metaTone || 'text-ink-dim'}`}>{meta}</span>}
    </div>
    {children}
  </div>
);

const ComposeToggle = ({ icon, label, hint, checked, onChange }) => (
  <label className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-surface-3 transition-colors">
    <span className="flex items-center gap-3 min-w-0">
      <span
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-accent/15 text-accent' : 'surface-1 text-ink-muted'
          }`}
      >
        {icon}
      </span>
      <span className="flex flex-col min-w-0">
        <span className="text-[14px] text-ink tracking-tight">{label}</span>
        <span className="text-[11px] text-ink-muted tracking-tight">{hint}</span>
      </span>
    </span>
    <span
      role="switch"
      aria-checked={checked}
      className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-surface-3'
        }`}
    >
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
      />
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="opacity-0 absolute inset-0 cursor-pointer"
      />
    </span>
  </label>
);

function nowDatetimeLocal() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export default UpdatesTab;
