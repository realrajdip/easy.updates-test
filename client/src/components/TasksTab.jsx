import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import ReactDOM from 'react-dom';
import {
  Plus, ListTodo, Play, CheckCircle2, Clock, MessageSquare, X, Send,
  Loader2, Users, MoreHorizontal, Pencil, Trash2, Search, ChevronDown, Check,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { API_URL } from '../config';
import UserAvatar from './UserAvatar';
import Modal, { useModalTitleId } from './Modal';
import DateTimePicker from './DateTimePicker';
import ConfirmModal from './ConfirmModal';
import { useStaleData } from '../hooks/useStaleData';

/* ── Helper: normalise assignedTo to always be an array ─────────────────── */
const toArray = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return [v]; // legacy single populated object or ObjectId
};

const STATUS_META = {
  pending: {
    label: 'To do',
    icon: ListTodo,
    chipClass: 'border-hairline text-ink-muted bg-surface-2',
    laneAccent: 'text-ink-muted',
  },
  in_progress: {
    label: 'In progress',
    icon: Play,
    chipClass: 'border-accent/40 text-accent bg-accent/10',
    laneAccent: 'text-accent',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    chipClass: 'border-success/40 text-success bg-success/10',
    laneAccent: 'text-success',
  },
};

const COLUMNS = ['pending', 'in_progress', 'completed'];

const TasksTab = ({ onOpenThread, allUsers = [], highlightedTaskId, clearHighlight }) => {
  const { token, user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const [activeMenuId, setActiveMenuId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [activeHighlightId, setActiveHighlightId] = useState(null);
  const [activeStatusTab, setActiveStatusTab] = useState('pending');

  // Stale-while-revalidate: show cached data immediately, refresh silently
  const fetcher = useMemo(() => async () => {
    const res = await fetch(`${API_URL}/api/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    return res.json();
  }, [token]);

  const {
    data: tasks,
    loading,
    error: fetchError,
    setDataAndCache: setTasks,
  } = useStaleData('tasks', fetcher);

  const safeTasks = tasks || [];

  useEffect(() => {
    if (fetchError) toast.error('Could not load tasks. Check your connection.');
  }, [fetchError]); // eslint-disable-line

  useEffect(() => {
    if (highlightedTaskId && safeTasks.length > 0) {
      const targetTask = safeTasks.find(t => String(t._id) === String(highlightedTaskId));
      if (targetTask && targetTask.status) {
        setActiveStatusTab(targetTask.status);
      }
    }
  }, [highlightedTaskId, tasks]);

  useEffect(() => {
    const handleGlobalClick = () => setActiveMenuId(null);
    if (activeMenuId) window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [activeMenuId]);

  // Handle scrolling and temporary highlight when highlightedTaskId is provided
  useEffect(() => {
    if (highlightedTaskId) {
      setActiveHighlightId(highlightedTaskId);

      const scrollTimer = setTimeout(() => {
        const element = document.getElementById(`task-${highlightedTaskId}`);
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
  }, [highlightedTaskId]); // eslint-disable-line

  useEffect(() => {
    if (!socket) return;
    const onNew = (t) =>
      setTasks((prev) => {
        const p = prev || [];
        return p.some((x) => x._id === t._id) ? p : [t, ...p];
      });
    const onStatus = (t) =>
      setTasks((prev) => (prev || []).map((x) => (x._id === t._id ? t : x)));
    const onDeleted = (id) =>
      setTasks((prev) => (prev || []).filter((x) => x._id !== id));

    socket.on('task:new', onNew);
    socket.on('task:status_changed', onStatus);
    socket.on('task:updated', onStatus);
    socket.on('task:deleted', onDeleted);

    return () => {
      socket.off('task:new', onNew);
      socket.off('task:status_changed', onStatus);
      socket.off('task:updated', onStatus);
      socket.off('task:deleted', onDeleted);
    };
  }, [socket]);

  /* ── Optimistic status change ─────────────────────────────────────── */
  const updateStatus = async (e, taskId, currentStatus, direction) => {
    e.stopPropagation();
    let newStatus = 'pending';
    if (currentStatus === 'pending') newStatus = 'in_progress';
    else if (currentStatus === 'in_progress')
      newStatus = direction === 'back' ? 'pending' : 'completed';
    else if (currentStatus === 'completed') newStatus = 'in_progress';

    let snapshot;
    setTasks((prev) => {
      snapshot = prev;
      return prev.map((t) => (t._id === taskId ? { ...t, status: newStatus } : t));
    });

    try {
      const res = await fetch(`${API_URL}/api/tasks/${taskId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t._id === taskId ? updated : t)));
    } catch (err) {
      console.error(err);
      setTasks(snapshot);
      toast.error('Could not update status — reverted.');
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteConfirmId) return;
    try {
      const res = await fetch(`${API_URL}/api/tasks/${deleteConfirmId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setTasks(prev => prev.filter(t => t._id !== deleteConfirmId));
      toast.success('Task deleted');
    } catch (e) {
      console.error(e);
      toast.error('Could not delete task');
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const byStatus = {
    pending: safeTasks.filter((t) => t.status === 'pending'),
    in_progress: safeTasks.filter((t) => t.status === 'in_progress'),
    completed: safeTasks.filter((t) => t.status === 'completed'),
  };

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      {/* Hero */}
      <section className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <div className="flex flex-col gap-5 py-2">
          <p className="text-[12px] uppercase tracking-[0.18em] text-ink-dim">Board</p>
          <h1 className="display-lg">
            Tasks moving
            <br />
            forward.
          </h1>
          <p className="text-[15px] text-ink-muted max-w-md tracking-tight">
            {safeTasks.length === 0
              ? 'Assign the first task to get the board moving.'
              : `${byStatus.in_progress.length} active · ${byStatus.pending.length} to do · ${byStatus.completed.length} done.`}
          </p>
          <div>
            <button onClick={() => setShowModal(true)} className="btn btn-primary">
              <Plus className="h-4 w-4" />
              Assign task
            </button>
          </div>
        </div>

        <div className="spotlight spotlight-orange flex flex-col justify-between min-h-[200px]">
          <div>
            <p className="text-[12px] uppercase tracking-[0.18em] opacity-80">Throughput</p>
            <p className="display-md mt-2 leading-tight">
              {byStatus.completed.length} done.
            </p>
          </div>
          <p className="text-[13px] opacity-80 tracking-tight">
            Move work forward as it advances.
          </p>
        </div>
      </section>

      {/* Board */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="loader-ring" />
          <span className="text-[12px] text-ink-muted tracking-[0.16em] uppercase">
            Loading board
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-5 px-5 md:mx-0 md:px-0 no-scrollbar">
            <div className="flex items-center gap-1 surface-1 rounded-pill p-1 border border-hairline-soft w-fit">
              {COLUMNS.map((col) => {
                const meta = STATUS_META[col];
                const Icon = meta.icon;
                const count = byStatus[col].length;
                return (
                  <button
                    key={col}
                    onClick={() => setActiveStatusTab(col)}
                    className={`pill-tab ${activeStatusTab === col ? 'is-active has-motion' : ''} relative z-10`}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    {activeStatusTab === col && (
                      <motion.span
                        layoutId="tasks-filter-bg"
                        className="absolute inset-0 bg-surface-2 rounded-pill -z-10"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                    <span className="text-[10px] text-ink-dim ml-1.5 tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {byStatus[activeStatusTab].length === 0 ? (
            <div className="surface-1 border border-hairline-soft rounded-xl p-10 text-[13px] text-ink-muted italic text-center">
              No tasks in {STATUS_META[activeStatusTab].label.toLowerCase()} yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {byStatus[activeStatusTab].map((t, idx) => (
                  <motion.div
                    key={t._id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.2, delay: Math.min(idx * 0.04, 0.28), ease: 'easeOut' }}
                  >
                    <TaskCard
                      task={t}
                      col={activeStatusTab}
                      meta={STATUS_META[activeStatusTab]}
                      currentUser={user}
                      activeMenuId={activeMenuId}
                      setActiveMenuId={setActiveMenuId}
                      onEdit={() => setEditingTask(t)}
                      onDelete={() => setDeleteConfirmId(t._id)}
                      allUsers={allUsers}
                      onDiscuss={() => onOpenThread({ type: 'discussion_task', id: t._id })}
                      onAdvance={(e) => updateStatus(e, t._id, activeStatusTab, 'forward')}
                      onBack={(e) => updateStatus(e, t._id, activeStatusTab, 'back')}
                      isHighlighted={t._id === activeHighlightId}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      <ComposeTaskModal
        open={showModal}
        onClose={() => setShowModal(false)}
        allUsers={allUsers}
        onCreated={(t) => {
          if (t) setTasks((prev) => ((prev || []).some((x) => x._id === t._id) ? (prev || []) : [t, ...(prev || [])]));
          toast.success('Task assigned.');
        }}
        onFailed={() => toast.error('Could not assign task — please try again.')}
      />

      <ComposeTaskModal
        open={!!editingTask}
        initialData={editingTask}
        onClose={() => setEditingTask(null)}
        allUsers={allUsers}
        onCreated={(t) => {
          if (t) setTasks((prev) => (prev || []).map(x => x._id === t._id ? t : x));
          toast.success('Task updated.');
        }}
        onFailed={() => toast.error('Could not update task — please try again.')}
      />

      <Modal open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} maxWidth={400}>
        <div className="p-6 flex flex-col gap-5 text-center items-center">
          <div className="h-12 w-12 rounded-full bg-danger/10 flex items-center justify-center text-danger mb-2">
            <Trash2 className="h-6 w-6" />
          </div>
          <h3 className="text-[16px] font-bold text-ink">Delete this task?</h3>
          <p className="text-[13px] text-ink-muted leading-relaxed max-w-[280px]">
            This action cannot be undone. All comments and history will be permanently deleted.
          </p>
          <div className="flex items-center gap-3 w-full mt-2">
            <button className="btn btn-secondary flex-1" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
            <button className="btn btn-primary bg-danger text-white border-transparent hover:bg-danger/80 flex-1" onClick={handleDeleteTask}>
              Delete Task
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

/* ─── Avatar stack (null-safe) ──────────────────────────────────────────── */
const AvatarStack = ({ users = [], max = 3 }) => {
  const valid = users.filter(Boolean);
  const shown = valid.slice(0, max);
  const extra = valid.length - max;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((u, i) => (
        <div key={u._id || i} className="ring-2 ring-surface-2 rounded-full" title={`@${u.username}`}>
          <UserAvatar user={u} size="xs" noTooltip />
        </div>
      ))}
      {extra > 0 && (
        <div
          className="w-4 h-4 rounded-full bg-surface-3 ring-2 ring-surface-2 flex items-center justify-center text-[8px] font-bold text-ink-muted"
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

  const reposition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openBelow = spaceBelow >= 240 || spaceBelow >= 160;
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

  const handleToggle = () => {
    if (!open) reposition();
    setOpen((v) => !v);
    if (open) setSearch('');
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        !e.target.closest('[data-task-picker-portal]')
      ) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

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

      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="input flex items-center justify-between text-left"
      >
        <span className={selectedUsers.length === 0 ? 'text-ink-dim' : 'text-ink'}>
          {selectedUsers.length === 0
            ? 'Whole team (no specific assignee)'
            : `${selectedUsers.length} member${selectedUsers.length > 1 ? 's' : ''} selected`}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-ink-dim transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          data-task-picker-portal
          style={dropdownStyle}
          className="bg-surface-2 border border-hairline rounded-lg shadow-[0_12px_32px_rgba(0,0,0,0.6)] overflow-hidden animate-fade-in"
        >
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
                    onMouseDown={(e) => e.preventDefault()}
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

/* ─── Task card ─────────────────────────────────────────────────────────── */
const TaskCard = ({ task, col, meta, currentUser, activeMenuId, setActiveMenuId, onEdit, onDelete, allUsers, onDiscuss, onAdvance, onBack, isHighlighted }) => {
  const StatusIcon = meta.icon;
  const isMenuOpen = activeMenuId === task._id;
  const canEdit = task.creator?._id === currentUser?.id || ['admin', 'super_user'].includes(currentUser?.role);
  const assignees = toArray(task.assignedTo);

  const isValidMention = (word) => {
    if (!word.startsWith('@')) return false;
    const username = word.slice(1).toLowerCase();
    return username === 'everyone' || allUsers.some(u => u.username.toLowerCase() === username);
  };

  const parseMentions = (text) => {
    if (!text) return null;
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, i) =>
      isValidMention(part) ? (
        <span key={i} className="text-accent bg-accent/10 rounded-sm px-0.5">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  return (
    <article
      id={`task-${task._id}`}
      className={`surface-2 rounded-lg p-3 flex flex-col gap-3 hover:bg-surface-3 transition-colors relative border ${
        isHighlighted
          ? 'border-accent shadow-[0_0_0_3px_rgba(0,153,255,0.25)] ring-2 ring-accent'
          : 'border-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[14px] text-ink tracking-tight font-medium leading-snug min-w-0 flex-1 pr-6">
          {task.title}
        </h3>

        {canEdit && (
          <div className="absolute top-2 right-2">
            <button
              className="p-1 text-ink-muted hover:text-ink rounded-md hover:bg-surface-1 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenuId(isMenuOpen ? null : task._id);
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {isMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-32 surface-0 border border-hairline-soft rounded-lg shadow-lg py-1 z-10 animate-fade-in"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="w-full text-left px-3 py-1.5 text-[12px] text-ink hover:bg-surface-2 transition-colors flex items-center gap-2"
                  onClick={() => { setActiveMenuId(null); onEdit(); }}
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-[12px] text-danger hover:bg-danger/10 transition-colors flex items-center gap-2"
                  onClick={() => { setActiveMenuId(null); onDelete(); }}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>



      <p className="text-[12px] text-ink-muted line-clamp-2 leading-relaxed tracking-tight break-words">
        {parseMentions(task.description)}
      </p>

      <div className="flex items-center justify-between text-[11px] text-ink-muted">
        {/* Assignee display — avatar stack or "Team" chip */}
        {assignees.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <AvatarStack users={assignees} max={3} />
            {assignees.length === 1 && (
              <span className="tracking-tight text-[11px]">@{assignees[0]?.username}</span>
            )}
          </div>
        ) : (
          <span className="chip">
            <Users className="h-2.5 w-2.5" />
            Team
          </span>
        )}

        {task.eta && (() => {
          const now = new Date();
          const etaDate = new Date(task.eta);
          const isOverdue = now > etaDate && task.status !== 'completed';
          const isDueSoon = !isOverdue && task.status !== 'completed' && (etaDate - now < 24 * 60 * 60 * 1000);
          
          if (task.status === 'completed') {
            return (
              <span className="flex items-center gap-1 text-success bg-success/10 border border-success/20 rounded-pill px-2 py-0.5 text-[10px] tracking-tight font-medium shrink-0">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Done: {etaDate.toLocaleDateString()}
              </span>
            );
          }
          if (isOverdue) {
            return (
              <span className="flex items-center gap-1 text-danger bg-danger/10 border border-danger/20 rounded-pill px-2 py-0.5 text-[10px] tracking-tight font-medium shrink-0 animate-pulse">
                <AlertTriangle className="h-2.5 w-2.5" />
                Overdue: {etaDate.toLocaleDateString()}
              </span>
            );
          }
          if (isDueSoon) {
            return (
              <span className="flex items-center gap-1 text-warning bg-warning/10 border border-warning/20 rounded-pill px-2 py-0.5 text-[10px] tracking-tight font-medium shrink-0">
                <Clock className="h-2.5 w-2.5" />
                Due soon: {etaDate.toLocaleDateString()}
              </span>
            );
          }
          return (
            <span className="flex items-center gap-1 text-ink-muted bg-surface-2 border border-hairline-soft rounded-pill px-2 py-0.5 text-[10px] tracking-tight font-medium shrink-0">
              <Clock className="h-2.5 w-2.5" />
              Due: {etaDate.toLocaleDateString()}
            </span>
          );
        })()}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-hairline-soft">
        <button onClick={onDiscuss} className="btn btn-secondary btn-xs">
          <MessageSquare className="h-3 w-3" />
          Discuss
        </button>

        <div className="flex items-center gap-1.5">
          {col === 'in_progress' && (
            <button onClick={onBack} className="btn btn-secondary btn-xs">
              Back
            </button>
          )}
          <button onClick={onAdvance} className="btn btn-primary btn-xs">
            {col === 'pending' ? 'Start' : col === 'in_progress' ? 'Complete' : 'Reopen'}
          </button>
        </div>
      </div>
    </article>
  );
};

/* ─── Compose task modal ───────────────────────────────────────────────── */
const ComposeTaskModal = ({ open, onClose, allUsers, onCreated, onFailed, initialData }) => {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState([]); // array of user IDs
  const [eta, setEta] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const titleRef = useRef(null);
  const minEta = nowDatetimeLocal();

  // Derive initial assignedTo IDs from initialData
  const initialAssignedIds = React.useMemo(() => {
    if (!initialData) return [];
    return toArray(initialData.assignedTo)
      .filter(Boolean)
      .map((u) => (typeof u === 'string' ? u : u._id));
  }, [initialData]);

  useEffect(() => {
    if (open) {
      if (initialData) {
        setTitle(initialData.title || '');
        setDescription(initialData.description || '');
        setAssignedTo(initialAssignedIds);
        setEta(initialData.eta ? new Date(initialData.eta).toISOString().slice(0, 16) : '');
      } else {
        reset();
      }
    }
  }, [open, initialData]); // eslint-disable-line

  const reset = () => {
    setTitle('');
    setDescription('');
    setAssignedTo([]);
    setEta('');
  };

  // Compare against actual initial values (not just truthiness)
  const arraysEqual = (a, b) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();

  const dirty = initialData
    ? title.trim() !== (initialData.title || '') ||
    description.trim() !== (initialData.description || '') ||
    !arraysEqual(assignedTo, initialAssignedIds) ||
    eta !== (initialData.eta ? new Date(initialData.eta).toISOString().slice(0, 16) : '')
    : !!(title.trim() || description.trim() || assignedTo.length > 0 || eta);

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
    if (!title.trim() || !description.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const url = initialData ? `${API_URL}/api/tasks/${initialData._id}` : `${API_URL}/api/tasks`;
      const method = initialData ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title,
          description,
          assignedTo, // array — empty means whole team
          eta: eta || null,
        }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const created = await res.json().catch(() => null);
      reset();
      onClose?.();
      onCreated?.(created);
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
        initialFocus={titleRef}
      >
        <ComposeBody
          titleRef={titleRef}
          title={title}
          setTitle={setTitle}
          description={description}
          setDescription={setDescription}
          assignedTo={assignedTo}
          setAssignedTo={setAssignedTo}
          eta={eta}
          setEta={setEta}
          minEta={minEta}
          isSubmitting={isSubmitting}
          allUsers={allUsers}
          onSubmit={handleSubmit}
          onClose={handleClose}
          initialData={initialData}
        />
      </Modal>

      {/* Discard Confirmation — separate portal so Escape only closes this */}
      <ConfirmModal
        open={showDiscardConfirm}
        title="Discard Task?"
        message="You have unsaved changes. Are you sure you want to discard this task assignment?"
        confirmText="Discard"
        cancelText="Keep editing"
        onConfirm={forceClose}
        onCancel={() => setShowDiscardConfirm(false)}
        isDanger={false}
      />
    </>
  );
};

const ComposeBody = ({
  titleRef,
  title, setTitle,
  description, setDescription,
  assignedTo, setAssignedTo,
  eta, setEta, minEta,
  isSubmitting, allUsers,
  onSubmit, onClose,
  initialData
}) => {
  const titleId = useModalTitleId();
  const remaining = 600 - description.length;
  return (
    <form onSubmit={onSubmit}>
      {/* Sticky header — stays at top as content scrolls */}
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-hairline-soft bg-surface-1">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">
            {initialData ? 'Edit' : 'Assign'}
          </p>
          <h2 id={titleId} className="display-md mt-0.5">
            {initialData ? 'Edit task' : 'New task'}
          </h2>
        </div>
        <button type="button" onClick={onClose} className="btn-icon" aria-label="Close dialog">
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Scrollable body — just normal flow, panel handles scrolling */}
      <div className="flex flex-col gap-4 px-6 py-5">
        <Field label="Title">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short, scannable title"
            className="input"
            required
          />
        </Field>

        <Field
          label="Description"
          meta={`${remaining} chars left`}
          metaTone={remaining < 0 ? 'text-danger' : 'text-ink-dim'}
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 600))}
            placeholder="What needs to happen and why?"
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

        <Field label="Due" optional icon={Clock}>
          <DateTimePicker
            value={eta}
            onChange={setEta}
            min={minEta}
            optional
          />
        </Field>
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
          disabled={isSubmitting || !title.trim() || !description.trim()}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {initialData ? 'Saving…' : 'Assigning…'}
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              {initialData ? 'Save changes' : 'Assign task'}
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

function nowDatetimeLocal() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export default TasksTab;
