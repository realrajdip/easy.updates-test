import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, GraduationCap, BookOpen, Users, CheckCircle2, Circle, ArrowLeft,
  Pencil, Trash2, Eye, EyeOff, X, ChevronRight, ChevronUp, ChevronDown,
  ListChecks, UserPlus, Crown, Shield as ShieldIcon, User as UserIcon,
  Send, Clock, Tag as TagIcon, Folder, Link2, ExternalLink, Activity
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { API_URL } from '../config';
import UserAvatar from './UserAvatar';
import Modal, { useModalTitleId } from './Modal';
import { BlockRenderer, BlockListEditor, Markdown } from './courses/Blocks';
import { TaskRunner, TaskTypeEditor, TASK_TYPES, taskTypeMeta } from './courses/TaskTypes';

/* ────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                */
/* ────────────────────────────────────────────────────────────────────── */

const ROLE_META = {
  owner:       { label: 'Owner',       icon: Crown,     chipClass: 'border-accent/40 text-accent bg-accent/10' },
  manager:     { label: 'Manager',     icon: ShieldIcon, chipClass: 'border-hairline text-ink bg-surface-2' },
  participant: { label: 'Participant', icon: UserIcon,  chipClass: 'border-hairline-soft text-ink-muted bg-surface-1' }
};

const useCourseApi = () => {
  const { token } = useAuth();
  const call = async (path, opts = {}) => {
    const res = await fetch(`${API_URL}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {})
      }
    });
    if (!res.ok) {
      let msg = `Server returned ${res.status}`;
      try { const j = await res.json(); if (j.message) msg = j.message; } catch (_) {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  };
  return call;
};

const fmtMinutes = (m) => {
  if (!m || !Number.isFinite(m) || m <= 0) return null;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

const courseTotalTime = (course) => {
  if (course?.estimatedMinutes) return course.estimatedMinutes;
  return (course?.lessons || []).reduce((n, l) => n + (Number(l.estimatedMinutes) || 0), 0);
};

const tagListFromString = (s) =>
  s.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12);

/* ────────────────────────────────────────────────────────────────────── */
/* Root tab                                                               */
/* ────────────────────────────────────────────────────────────────────── */

const CoursesTab = ({ allUsers = [] }) => {
  const { socket } = useSocket();
  const toast = useToast();
  const api = useCourseApi();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [filter, setFilter] = useState('all');

  const fetchCourses = async () => {
    setLoading(true);
    try { setCourses(await api('/api/courses')); }
    catch (e) { console.error(e); toast.error('Could not load tracks.'); }
    finally { setLoading(false); }
  };

  const handleInlineEnroll = async (course) => {
    try {
      await api(`/api/courses/${course._id}/enroll`, { method: 'POST' });
      toast.success(`Enrolled in "${course.title}".`);
      fetchCourses();
    } catch (e) {
      toast.error(e.message || 'Could not enroll.');
    }
  };

  useEffect(() => { fetchCourses(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchCourses();
    const onDeleted = (id) => {
      setCourses((prev) => prev.filter((c) => c._id !== id));
      if (activeId === id) setActiveId(null);
    };
    socket.on('course:new', refresh);
    socket.on('course:updated', refresh);
    socket.on('course:deleted', onDeleted);
    return () => {
      socket.off('course:new', refresh);
      socket.off('course:updated', refresh);
      socket.off('course:deleted', onDeleted);
    };
    // eslint-disable-next-line
  }, [socket, activeId]);

  if (activeId) {
    return (
      <CourseDetail
        id={activeId}
        allUsers={allUsers}
        onBack={() => setActiveId(null)}
        onDeleted={() => { setActiveId(null); fetchCourses(); }}
      />
    );
  }

  const mine = courses.filter((c) => c.myRole === 'owner');
  const managing = courses.filter((c) => c.myRole === 'manager');
  const enrolled = courses.filter((c) => c.myRole === 'participant');
  const discover = courses.filter((c) => !c.myRole);

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <section className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <div className="flex flex-col gap-5 py-2">
          <p className="text-[12px] uppercase tracking-[0.18em] text-ink-dim">Library</p>
          <h1 className="display-lg">
            Tracks for
            <br />
            shared craft.
          </h1>
          <p className="text-[15px] text-ink-muted max-w-md tracking-tight">
            {courses.length === 0
              ? 'No tracks yet. Build the first one — onboarding, SOP, or any text-led walkthrough.'
              : `${mine.length + managing.length} you steer · ${enrolled.length} you're in · ${discover.length} to discover.`}
          </p>
          <div>
            <button onClick={() => setShowCreate(true)} className="btn btn-primary">
              <Plus className="h-4 w-4" />
              New track
            </button>
          </div>
        </div>

        <div className="spotlight spotlight-violet flex flex-col justify-between min-h-[200px]">
          <div>
            <p className="text-[12px] uppercase tracking-[0.18em] opacity-80">Completed</p>
            <p className="display-md mt-2 leading-tight">
              {enrolled.filter((c) => c.progress?.isDone).length} done.
            </p>
          </div>
          <p className="text-[13px] opacity-80 tracking-tight">
            Text-only by design — blocks, link cards, quizzes. Fast to read, easy to grep.
          </p>
        </div>
      </section>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="loader-ring" />
          <span className="text-[12px] text-ink-muted tracking-[0.16em] uppercase">Loading tracks</span>
        </div>
      ) : (() => {
        const TABS = [
          { key: 'all',         label: 'All',        items: courses,  emptyHint: 'No tracks yet. Build the first one above.' },
          { key: 'owned',       label: 'Owned',      items: mine,     emptyHint: 'Tracks you author show up here.' },
          { key: 'managing',    label: 'Managing',   items: managing, emptyHint: 'An owner can invite you to manage a track.' },
          { key: 'enrolled',    label: 'Enrolled',   items: enrolled, emptyHint: "No tracks assigned to you yet." },
          { key: 'discover',    label: 'Discover',   items: discover, emptyHint: 'Published tracks from the team will appear here.' },
        ];
        const active = TABS.find((t) => t.key === filter) || TABS[0];
        return (
          <div className="flex flex-col gap-5">
            <div
              role="tablist"
              aria-label="Filter tracks"
              className="flex items-center gap-1 surface-1 self-start p-1 rounded-pill border border-hairline-soft flex-wrap"
            >
              {TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={filter === t.key}
                  onClick={() => setFilter(t.key)}
                  className={`pill-tab ${filter === t.key ? 'is-active' : ''}`}
                >
                  {t.label}
                  <span className="text-[10px] text-ink-dim ml-1 tabular-nums">{t.items.length}</span>
                </button>
              ))}
            </div>

            {active.items.length === 0 ? (
              <div className="surface-1 border border-hairline-soft rounded-xl p-10 text-[13px] text-ink-muted italic text-center">
                {active.emptyHint}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {active.items.map((c) => (
                  <CourseCard
                    key={c._id}
                    course={c}
                    onOpen={() => setActiveId(c._id)}
                    onEnroll={!c.myRole ? () => handleInlineEnroll(c) : null}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <ComposeCourseModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(c) => {
          setCourses((prev) => [c, ...prev]);
          setActiveId(c._id);
          toast.success('Track created.');
        }}
      />
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────── */
/* Course card                                                            */
/* ────────────────────────────────────────────────────────────────────── */

const CourseCard = ({ course, onOpen, onEnroll }) => {
  const role = course.myRole;
  const meta = role ? ROLE_META[role] : null;
  const RoleIcon = meta?.icon;
  const lessons = course.lessons?.length || 0;
  const totalTasks = (course.lessons || []).reduce((n, l) => n + (l.tasks?.length || 0), 0);
  const progress = course.progress?.required ? course.progress : null;
  const totalTime = fmtMinutes(courseTotalTime(course));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="card-interactive text-left flex flex-col gap-4 min-h-[200px] border border-hairline-soft hover:border-hairline cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-full bg-surface-2 flex items-center justify-center text-ink-muted shrink-0">
            <BookOpen className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink-dim">{course.category || 'Track'}</p>
            <p className="text-[10px] text-ink-muted truncate">
              {lessons} lesson{lessons === 1 ? '' : 's'} · {totalTasks} task{totalTasks === 1 ? '' : 's'}
              {totalTime && ` · ${totalTime}`}
            </p>
          </div>
        </div>
        {meta && (
          <span className={`chip ${meta.chipClass}`} title={meta.label}>
            {RoleIcon && <RoleIcon className="h-3 w-3" />}
            {meta.label}
          </span>
        )}
        {!meta && onEnroll && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEnroll(); }}
            className="btn btn-secondary btn-xs shrink-0"
            title="Enroll"
          >
            <GraduationCap className="h-3 w-3" />Enroll
          </button>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-[16px] font-semibold tracking-tight text-ink leading-snug line-clamp-2">
          {course.title}
        </h3>
        {course.summary && (
          <p className="mt-1.5 text-[13px] text-ink-muted leading-relaxed line-clamp-3">{course.summary}</p>
        )}
      </div>

      {course.tags?.length > 0 && (
        <div className="flex items-center flex-wrap gap-1">
          {course.tags.slice(0, 4).map((t) => (
            <span key={t} className="chip"><TagIcon className="h-3 w-3" />{t}</span>
          ))}
          {course.tags.length > 4 && (
            <span className="chip">+{course.tags.length - 4}</span>
          )}
        </div>
      )}

      {progress ? (
        <ProgressBar pct={progress.pct} isDone={progress.isDone} />
      ) : (
        <div className="flex items-center gap-2 text-[11px] text-ink-dim">
          <UserAvatar user={course.creator} size="xs" noTooltip />
          <span className="truncate">by @{course.creator?.username}</span>
        </div>
      )}
    </div>
  );
};

const ProgressBar = ({ pct, isDone, label }) => (
  <div className="flex flex-col gap-1.5">
    <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
      <div
        className={`h-full ${isDone ? 'bg-success' : 'bg-accent'} transition-all`}
        style={{ width: `${pct || 0}%` }}
      />
    </div>
    <div className="flex items-center justify-between text-[11px] text-ink-muted">
      <span>{label || `${pct || 0}% complete`}</span>
      {isDone && <span className="chip chip-success"><CheckCircle2 className="h-3 w-3" />Done</span>}
    </div>
  </div>
);

/* ────────────────────────────────────────────────────────────────────── */
/* Create modal — title, summary, category, tags, est minutes             */
/* ────────────────────────────────────────────────────────────────────── */

const ComposeCourseModal = ({ open, onClose, onCreated }) => {
  const api = useCourseApi();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const titleRef = useRef(null);
  const titleId = useModalTitleId();

  useEffect(() => {
    if (open) {
      setTitle(''); setSummary(''); setCategory(''); setTagsRaw(''); setMinutes(''); setBusy(false);
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const c = await api('/api/courses', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim(),
          category: category.trim(),
          tags: tagListFromString(tagsRaw),
          estimatedMinutes: minutes ? Number(minutes) : null
        })
      });
      onCreated?.(c);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Could not create track');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={560} initialFocus={titleRef}>
      <form onSubmit={submit} className="flex flex-col">
        <header className="px-6 py-4 border-b border-hairline-soft flex items-center justify-between">
          <h2 id={titleId} className="display-sm">New track</h2>
          <button type="button" onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
        </header>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Title</span>
            <input ref={titleRef} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Onboarding for new engineers" maxLength={140} required />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Summary</span>
            <textarea className="input" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What this track covers and who it's for." rows={3} maxLength={400} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Category</span>
              <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Onboarding · SOP · Training" maxLength={40} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Est. minutes</span>
              <input className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))} placeholder="30" />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Tags · comma-separated</span>
            <input className="input" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="incident, on-call, runbook" />
            {!!tagListFromString(tagsRaw).length && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {tagListFromString(tagsRaw).map((t) => <span key={t} className="chip"><TagIcon className="h-3 w-3" />{t}</span>)}
              </div>
            )}
          </label>

          <p className="text-[12px] text-ink-dim leading-relaxed">
            You'll be the <span className="text-ink">owner</span>. Add lessons, tasks, managers, and participants from the
            track page once it's created.
          </p>
        </div>

        <footer className="px-6 py-4 border-t border-hairline-soft flex items-center justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()} data-loading={busy ? 'true' : undefined}>
            <Send className="h-4 w-4" />
            Create track
          </button>
        </footer>
      </form>
    </Modal>
  );
};

/* ────────────────────────────────────────────────────────────────────── */
/* Detail view                                                            */
/* ────────────────────────────────────────────────────────────────────── */

const CourseDetail = ({ id, allUsers, onBack, onDeleted }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();
  const api = useCourseApi();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [view, setView] = useState('lessons');
  const [showLessonEditor, setShowLessonEditor] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [editTaskCtx, setEditTaskCtx] = useState(null);
  const [showMemberPicker, setShowMemberPicker] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmMember, setConfirmMember] = useState(null); // { user, isSelf }
  const [activityFor, setActivityFor] = useState(null);     // roster row to inspect
  const [submissionsFor, setSubmissionsFor] = useState(null); // { lessonTitle, task }
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const fetchRoster = async () => {
    setRosterLoading(true);
    try {
      const r = await api(`/api/courses/${id}/roster`);
      setRoster(r);
    } catch (e) {
      // Silent — the consumer surfaces the empty state
    } finally {
      setRosterLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const c = await api(`/api/courses/${id}`);
      setCourse(c);
      if (!activeLessonId && c.lessons?.[0]) setActiveLessonId(c.lessons[0]._id);
    } catch (e) {
      toast.error(e.message || 'Could not load track.');
      onBack?.();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  useEffect(() => {
    if (!socket) return;
    const onUpd = (payload) => { if (payload?._id === id) load(); };
    const onDel = (delId) => { if (delId === id) onDeleted?.(); };
    socket.on('course:updated', onUpd);
    socket.on('course:deleted', onDel);
    return () => {
      socket.off('course:updated', onUpd);
      socket.off('course:deleted', onDel);
    };
    // eslint-disable-next-line
  }, [socket, id]);

  // Roster powers Progress tab + Activity modal + per-task submissions
  useEffect(() => {
    const myRole = course?.myRole;
    const canEditNow = myRole === 'owner' || myRole === 'manager';
    if (!canEditNow) return;
    if (view === 'roster' || activityFor || submissionsFor) fetchRoster();
    // eslint-disable-next-line
  }, [view, activityFor, submissionsFor, course?.updatedAt, course?.myRole]);

  if (loading || !course) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <div className="loader-ring" />
        <span className="text-[12px] text-ink-muted tracking-[0.16em] uppercase">Loading track</span>
      </div>
    );
  }

  const role = course.myRole;
  const canEdit = role === 'owner' || role === 'manager';
  const isOwner = role === 'owner';
  const lesson = course.lessons.find((l) => l._id === activeLessonId) || course.lessons[0];

  const handleTaskSubmit = async (task, payload) => {
    try {
      const prog = await api(`/api/courses/${id}/progress`, {
        method: 'PUT',
        body: JSON.stringify({ taskId: task._id, ...payload })
      });
      setCourse((c) => ({ ...c, progress: { ...c.progress, ...prog } }));
      if (prog.quizFeedback) {
        if (prog.quizFeedback.isCorrect) toast.success('Correct!');
      }
    } catch (e) {
      toast.error(e.message || 'Could not save progress.');
    }
  };

  const handleDeleteCourse = async () => {
    try { await api(`/api/courses/${id}`, { method: 'DELETE' }); toast.success('Track deleted.'); onDeleted?.(); }
    catch (e) { toast.error(e.message || 'Could not delete.'); }
    finally { setConfirmDelete(null); }
  };

  const handleDeleteLesson = async (lessonId) => {
    try {
      const c = await api(`/api/courses/${id}/lessons/${lessonId}`, { method: 'DELETE' });
      setCourse(c);
      if (activeLessonId === lessonId) setActiveLessonId(c.lessons[0]?._id || null);
      toast.success('Lesson removed.');
    } catch (e) { toast.error(e.message || 'Could not delete lesson.'); }
    finally { setConfirmDelete(null); }
  };

  const handleReorderLesson = async (lessonId, direction) => {
    try {
      const c = await api(`/api/courses/${id}/lessons/${lessonId}/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ direction })
      });
      setCourse(c);
    } catch (e) { toast.error(e.message || 'Could not reorder.'); }
  };

  const handleReorderTask = async (lessonId, taskId, direction) => {
    try {
      const c = await api(`/api/courses/${id}/lessons/${lessonId}/tasks/${taskId}/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ direction })
      });
      setCourse(c);
    } catch (e) { toast.error(e.message || 'Could not reorder.'); }
  };

  const handleDeleteTask = async (lessonId, taskId) => {
    try {
      const c = await api(`/api/courses/${id}/lessons/${lessonId}/tasks/${taskId}`, { method: 'DELETE' });
      setCourse(c);
      toast.success('Task removed.');
    } catch (e) { toast.error(e.message || 'Could not delete task.'); }
    finally { setConfirmDelete(null); }
  };

  const handleRemoveMember = async (userId) => {
    try {
      const c = await api(`/api/courses/${id}/members/${userId}`, { method: 'DELETE' });
      setCourse(c);
      toast.success('Member removed.');
    } catch (e) { toast.error(e.message || 'Could not remove member.'); }
  };

  const handleEnroll = async () => {
    try {
      const c = await api(`/api/courses/${id}/enroll`, { method: 'POST' });
      setCourse((cur) => ({ ...cur, ...c, myRole: 'participant', progress: cur.progress }));
      toast.success('Enrolled. Your progress is now tracked.');
      // Refresh to pick up server-computed myRole + progress
      load();
    } catch (e) {
      toast.error(e.message || 'Could not enroll.');
    }
  };

  const totalTime = fmtMinutes(courseTotalTime(course));

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={onBack} className="btn btn-ghost btn-sm">
          <ArrowLeft className="h-4 w-4" />
          All tracks
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {role && (() => {
            const meta = ROLE_META[role]; const Icon = meta.icon;
            return <span className={`chip ${meta.chipClass}`}><Icon className="h-3 w-3" />{meta.label}</span>;
          })()}
          {course.isPublished
            ? <span className="chip chip-success"><Eye className="h-3 w-3" />Published</span>
            : <span className="chip"><EyeOff className="h-3 w-3" />Draft</span>}
          {isOwner && (
            <button onClick={() => setShowSettings(true)} className="btn btn-secondary btn-sm">Settings</button>
          )}
        </div>
      </div>

      <header className="flex flex-col gap-4">
        <h1 className="display-lg leading-[1.02] tracking-tight">{course.title}</h1>
        {course.summary && (
          <p className="text-[16px] text-ink-muted max-w-3xl tracking-tight leading-relaxed whitespace-pre-wrap">
            {course.summary}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
          {course.category && <span className="chip"><Folder className="h-3 w-3" />{course.category}</span>}
          {totalTime && <span className="chip"><Clock className="h-3 w-3" />{totalTime}</span>}
          <span className="chip"><BookOpen className="h-3 w-3" />{course.lessons.length} lesson{course.lessons.length === 1 ? '' : 's'}</span>
          {course.tags?.map((t) => <span key={t} className="chip"><TagIcon className="h-3 w-3" />{t}</span>)}
        </div>
        {course.progress?.required > 0 && role && (
          <div className="max-w-md">
            <ProgressBar
              pct={course.progress.pct}
              isDone={course.progress.isDone}
              label={`${course.progress.completed}/${course.progress.required} tasks done`}
            />
          </div>
        )}
      </header>

      {!role && course.isPublished && (
        <div className="surface-1 border border-accent/30 bg-accent/[0.06] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] text-ink font-medium tracking-tight">You're previewing this track.</p>
            <p className="text-[12px] text-ink-muted">Enroll to track your progress, save responses, and complete tasks.</p>
          </div>
          <button onClick={handleEnroll} className="btn btn-primary btn-sm shrink-0">
            <GraduationCap className="h-4 w-4" />Enroll
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 surface-1 rounded-pill p-1 border border-hairline-soft w-fit">
        <button onClick={() => setView('lessons')} className={`pill-tab ${view === 'lessons' ? 'is-active' : ''}`}>
          <BookOpen className="h-3.5 w-3.5" />Lessons
        </button>
        <button onClick={() => setView('members')} className={`pill-tab ${view === 'members' ? 'is-active' : ''}`}>
          <Users className="h-3.5 w-3.5" />Members
        </button>
        {canEdit && (
          <button onClick={() => setView('roster')} className={`pill-tab ${view === 'roster' ? 'is-active' : ''}`}>
            <ListChecks className="h-3.5 w-3.5" />Progress
          </button>
        )}
      </div>

      {view === 'lessons' && (
        <LessonsView
          course={course}
          lesson={lesson}
          activeLessonId={activeLessonId}
          setActiveLessonId={setActiveLessonId}
          canEdit={canEdit}
          role={role}
          onAddLesson={() => { setEditingLesson(null); setShowLessonEditor(true); }}
          onEditLesson={(l) => { setEditingLesson(l); setShowLessonEditor(true); }}
          onDeleteLesson={(l) => setConfirmDelete({ type: 'lesson', lesson: l })}
          onReorderLesson={handleReorderLesson}
          onAddTask={(lessonId) => setEditTaskCtx({ lessonId })}
          onEditTask={(lessonId, t) => setEditTaskCtx({ lessonId, task: t })}
          onDeleteTask={(lessonId, t) => setConfirmDelete({ type: 'task', lessonId, task: t })}
          onReorderTask={handleReorderTask}
          onSubmitTask={handleTaskSubmit}
          onOpenSubmissions={(lessonTitle, t) => setSubmissionsFor({ lessonTitle, task: t })}
        />
      )}

      {view === 'members' && (
        <MembersView
          course={course}
          isOwner={isOwner}
          canEdit={canEdit}
          onAddManager={() => setShowMemberPicker('manager')}
          onAddParticipant={() => setShowMemberPicker('participant')}
          onRequestRemove={(u) => setConfirmMember({ user: u, isSelf: (u._id === (user?.id || user?._id)) })}
          currentUserId={user?.id || user?._id}
        />
      )}

      {view === 'roster' && canEdit && (
        <RosterView
          rows={roster}
          loading={rosterLoading}
          onOpenActivity={setActivityFor}
        />
      )}

      <LessonEditorModal
        open={showLessonEditor}
        initial={editingLesson}
        courseId={id}
        onClose={() => { setShowLessonEditor(false); setEditingLesson(null); }}
        onSaved={(c, newLessonId) => {
          setCourse(c);
          if (newLessonId) setActiveLessonId(newLessonId);
        }}
      />

      <TaskEditorModal
        open={!!editTaskCtx}
        ctx={editTaskCtx}
        onClose={() => setEditTaskCtx(null)}
        onSaved={(c) => setCourse(c)}
        courseId={id}
      />

      <MemberPickerModal
        open={!!showMemberPicker}
        role={showMemberPicker}
        course={course}
        allUsers={allUsers}
        currentUserId={user?.id || user?._id}
        onClose={() => setShowMemberPicker(null)}
        onSaved={(c) => setCourse(c)}
        courseId={id}
      />

      <CourseSettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        course={course}
        courseId={id}
        onSaved={(c) => setCourse((cur) => ({ ...cur, ...c, progress: cur.progress, myRole: cur.myRole }))}
        onRequestDelete={() => { setShowSettings(false); setConfirmDelete({ type: 'course' }); }}
      />

      <ParticipantActivityModal
        open={!!activityFor}
        onClose={() => setActivityFor(null)}
        row={activityFor}
        course={course}
      />

      <TaskSubmissionsModal
        open={!!submissionsFor}
        onClose={() => setSubmissionsFor(null)}
        rows={roster}
        loading={rosterLoading}
        ctx={submissionsFor}
        onOpenActivity={(row) => { setSubmissionsFor(null); setActivityFor(row); }}
      />

      <Modal open={!!confirmMember} onClose={() => setConfirmMember(null)} maxWidth={400}>
        <div className="p-6 flex flex-col gap-5 text-center items-center">
          <div className="h-12 w-12 rounded-full bg-surface-2 flex items-center justify-center text-ink-muted mb-1">
            {confirmMember?.isSelf ? <ArrowLeft className="h-6 w-6" /> : <X className="h-6 w-6" />}
          </div>
          <h3 className="text-[16px] font-bold text-ink">
            {confirmMember?.isSelf ? 'Leave this track?' : `Remove @${confirmMember?.user?.username}?`}
          </h3>
          <p className="text-[13px] text-ink-muted leading-relaxed max-w-[280px]">
            {confirmMember?.isSelf
              ? "You'll lose access until re-added or you re-enroll (if published)."
              : 'They lose access to this track. Their progress is preserved if they rejoin.'}
          </p>
          <div className="flex items-center gap-3 w-full mt-1">
            <button className="btn btn-secondary flex-1" onClick={() => setConfirmMember(null)}>Cancel</button>
            <button
              className="btn btn-primary bg-danger text-white border-transparent hover:bg-danger/80 flex-1"
              onClick={async () => {
                const id = confirmMember.user._id;
                setConfirmMember(null);
                await handleRemoveMember(id);
              }}
            >
              {confirmMember?.isSelf ? 'Leave' : 'Remove'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth={400}>
        <div className="p-6 flex flex-col gap-5 text-center items-center">
          <div className="h-12 w-12 rounded-full bg-danger/10 flex items-center justify-center text-danger mb-1">
            <Trash2 className="h-6 w-6" />
          </div>
          <h3 className="text-[16px] font-bold text-ink">
            {confirmDelete?.type === 'course' && 'Delete this track?'}
            {confirmDelete?.type === 'lesson' && 'Delete this lesson?'}
            {confirmDelete?.type === 'task' && 'Delete this task?'}
          </h3>
          <p className="text-[13px] text-ink-muted leading-relaxed max-w-[280px]">
            This cannot be undone.
            {confirmDelete?.type !== 'course' && ' Member progress for it will be cleared.'}
          </p>
          <div className="flex items-center gap-3 w-full mt-1">
            <button className="btn btn-secondary flex-1" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button
              className="btn btn-primary bg-danger text-white border-transparent hover:bg-danger/80 flex-1"
              onClick={() => {
                if (confirmDelete?.type === 'course') handleDeleteCourse();
                if (confirmDelete?.type === 'lesson') handleDeleteLesson(confirmDelete.lesson._id);
                if (confirmDelete?.type === 'task') handleDeleteTask(confirmDelete.lessonId, confirmDelete.task._id);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────── */
/* Lessons view                                                           */
/* ────────────────────────────────────────────────────────────────────── */

const LessonsView = ({
  course, lesson, activeLessonId, setActiveLessonId, canEdit, role,
  onAddLesson, onEditLesson, onDeleteLesson, onReorderLesson,
  onAddTask, onEditTask, onDeleteTask, onReorderTask, onSubmitTask,
  onOpenSubmissions
}) => {
  if (!course.lessons.length) {
    return (
      <div className="surface-1 border border-hairline-soft rounded-xl p-10 text-center flex flex-col items-center gap-4">
        <GraduationCap className="h-8 w-8 text-ink-dim" />
        <div>
          <p className="text-[14px] text-ink font-medium">No lessons yet</p>
          <p className="text-[12px] text-ink-muted mt-1">
            {canEdit ? 'Add the first lesson to start the track.' : 'Check back once the owner adds content.'}
          </p>
        </div>
        {canEdit && (
          <button onClick={onAddLesson} className="btn btn-primary btn-sm">
            <Plus className="h-3.5 w-3.5" />Add lesson
          </button>
        )}
      </div>
    );
  }

  const completedSet = new Set((course.progress?.completedTaskIds || []).map(String));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
      <aside className="surface-1 rounded-xl border border-hairline-soft p-2 flex flex-col gap-0.5 self-start max-h-[640px] overflow-y-auto">
        {course.lessons.map((l, i) => {
          const active = l._id === activeLessonId;
          const requiredInLesson = l.tasks.filter((t) => t.required);
          const doneInLesson = requiredInLesson.filter((t) => completedSet.has(String(t._id))).length;
          const lessonDone = requiredInLesson.length > 0 && doneInLesson === requiredInLesson.length;
          const est = fmtMinutes(l.estimatedMinutes);
          return (
            <div key={l._id} className={`rounded-md border ${active ? 'border-hairline bg-surface-2' : 'border-transparent'} group/lesson`}>
              <div className="flex items-stretch">
                <button
                  onClick={() => setActiveLessonId(l._id)}
                  className={`flex-1 min-w-0 text-left rounded-md px-3 py-2.5 flex items-start gap-2 transition-colors ${
                    active ? 'text-ink' : 'text-ink-muted hover:text-ink hover:bg-surface-2/60'
                  }`}
                >
                  <span className="text-[10px] text-ink-dim mt-0.5 w-5 shrink-0 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] leading-snug tracking-tight truncate">{l.title}</span>
                    <span className="block text-[10px] text-ink-dim mt-0.5">
                      {l.tasks.length} task{l.tasks.length === 1 ? '' : 's'}
                      {role && requiredInLesson.length > 0 && ` · ${doneInLesson}/${requiredInLesson.length}`}
                      {est && ` · ${est}`}
                    </span>
                  </span>
                  {lessonDone && role && <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />}
                </button>
                {canEdit && (
                  <div className="flex flex-col items-center justify-center px-1 gap-0 opacity-60 group-hover/lesson:opacity-100 transition-opacity">
                    <button onClick={() => onReorderLesson(l._id, 'up')} disabled={i === 0} className="btn-icon h-5 w-5" title="Move up"><ChevronUp className="h-3 w-3" /></button>
                    <button onClick={() => onReorderLesson(l._id, 'down')} disabled={i === course.lessons.length - 1} className="btn-icon h-5 w-5" title="Move down"><ChevronDown className="h-3 w-3" /></button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {canEdit && (
          <button onClick={onAddLesson} className="btn btn-ghost btn-sm justify-start mt-1">
            <Plus className="h-3.5 w-3.5" />New lesson
          </button>
        )}
      </aside>

      <article className="surface-1 rounded-xl border border-hairline-soft p-6 flex flex-col gap-6 min-h-[400px]">
        <header className="flex items-start justify-between gap-3 border-b border-hairline-soft pb-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink-dim">Lesson · {(course.lessons.findIndex((l) => l._id === lesson._id) + 1)} of {course.lessons.length}</p>
            <h2 className="display-sm mt-1 leading-tight">{lesson.title}</h2>
            {lesson.summary && <p className="text-[13px] text-ink-muted mt-2 max-w-2xl leading-relaxed">{lesson.summary}</p>}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {fmtMinutes(lesson.estimatedMinutes) && (
                <span className="chip"><Clock className="h-3 w-3" />{fmtMinutes(lesson.estimatedMinutes)}</span>
              )}
              {lesson.tasks.length > 0 && (
                <span className="chip"><ListChecks className="h-3 w-3" />{lesson.tasks.length} task{lesson.tasks.length === 1 ? '' : 's'}</span>
              )}
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => onEditLesson(lesson)} className="btn-icon" title="Edit lesson"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => onDeleteLesson(lesson)} className="btn-icon hover:text-danger" title="Delete lesson"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </header>

        {/* Lesson body */}
        {lesson.blocks?.length > 0 ? (
          <BlockRenderer blocks={lesson.blocks} />
        ) : lesson.content ? (
          <p className="text-[15px] text-ink leading-relaxed whitespace-pre-wrap tracking-tight">
            <Markdown text={lesson.content} />
          </p>
        ) : (
          <p className="text-[13px] text-ink-dim italic">
            {canEdit ? 'No content yet. Edit the lesson to add blocks.' : 'No reading material — jump into the tasks below.'}
          </p>
        )}

        {/* Resources */}
        {lesson.resources?.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-ink-muted" />
              <span className="text-[13px] text-ink font-medium tracking-tight">Resources</span>
              <span className="text-[11px] text-ink-dim">{lesson.resources.length}</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {lesson.resources.map((r) => {
                const safe = /^https?:\/\//i.test(r.url || '');
                const inner = (
                  <div className="surface-2 rounded-lg border border-hairline-soft p-3 hover:border-hairline transition-colors flex items-start gap-2.5">
                    <ExternalLink className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[13px] text-ink tracking-tight font-medium truncate">{r.title}</p>
                      {r.description && <p className="text-[11px] text-ink-muted mt-0.5 line-clamp-2">{r.description}</p>}
                      <p className="text-[10px] text-ink-dim mt-1 truncate">{r.url}</p>
                    </div>
                  </div>
                );
                return safe
                  ? <a key={r._id || r.url} href={r.url} target="_blank" rel="noreferrer noopener">{inner}</a>
                  : <div key={r._id || r.url}>{inner}</div>;
              })}
            </div>
          </section>
        )}

        {/* Tasks */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-ink-muted" />
              <span className="text-[13px] text-ink font-medium tracking-tight">Tasks</span>
              <span className="text-[11px] text-ink-dim">{lesson.tasks.length}</span>
            </div>
            {canEdit && (
              <button onClick={() => onAddTask(lesson._id)} className="btn btn-secondary btn-xs">
                <Plus className="h-3 w-3" />Add task
              </button>
            )}
          </div>

          {lesson.tasks.length === 0 ? (
            <p className="text-[12px] text-ink-dim italic">No tasks in this lesson.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lesson.tasks.map((t, i) => (
                <TaskRunner
                  key={t._id}
                  task={t}
                  progress={course.progress}
                  role={role}
                  onSubmit={(payload) => onSubmitTask(t, payload)}
                  edit={canEdit ? (
                    <>
                      {(t.type === 'response' || t.type === 'quiz') && (
                        <button onClick={() => onOpenSubmissions?.(lesson.title, t)} className="btn-icon h-7 w-7" title="View submissions"><Users className="h-3 w-3" /></button>
                      )}
                      <button onClick={() => onReorderTask(lesson._id, t._id, 'up')} disabled={i === 0} className="btn-icon h-7 w-7" title="Move up"><ChevronUp className="h-3 w-3" /></button>
                      <button onClick={() => onReorderTask(lesson._id, t._id, 'down')} disabled={i === lesson.tasks.length - 1} className="btn-icon h-7 w-7" title="Move down"><ChevronDown className="h-3 w-3" /></button>
                      <button onClick={() => onEditTask(lesson._id, t)} className="btn-icon h-7 w-7" title="Edit"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => onDeleteTask(lesson._id, t)} className="btn-icon h-7 w-7 hover:text-danger" title="Delete"><Trash2 className="h-3 w-3" /></button>
                    </>
                  ) : null}
                />
              ))}
            </ul>
          )}
        </section>
      </article>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────── */
/* Members view                                                           */
/* ────────────────────────────────────────────────────────────────────── */

const MembersView = ({ course, isOwner, canEdit, onAddManager, onAddParticipant, onRequestRemove, currentUserId }) => {
  // Managers can remove participants (and themselves). Owner can remove anyone but themselves.
  const canRemove = (u, role) => {
    if (role === 'owner') return false;
    if (u._id === currentUserId) return true; // self-leave (for managers/participants)
    if (isOwner) return true;                  // owner removes anyone
    if (canEdit && role === 'participant') return true; // managers remove participants
    return false;
  };

  const Section = ({ title, hint, items, addLabel, onAdd, canAdd, role }) => (
    <section className="surface-1 rounded-xl border border-hairline-soft p-5 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-ink font-medium tracking-tight">{title}</p>
          <p className="text-[11px] text-ink-dim">{hint}</p>
        </div>
        {canAdd && (
          <button onClick={onAdd} className="btn btn-secondary btn-sm">
            <UserPlus className="h-3.5 w-3.5" />{addLabel}
          </button>
        )}
      </header>
      {items.length === 0 ? (
        <p className="text-[12px] text-ink-dim italic">No one yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((u) => (
            <li key={u._id} className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-surface-2 transition-colors">
              <div className="flex items-center gap-2.5 min-w-0">
                <UserAvatar user={u} size="sm" noTooltip />
                <span className="text-[13px] text-ink tracking-tight truncate">@{u.username}</span>
                {u._id === currentUserId && <span className="chip">You</span>}
              </div>
              {canRemove(u, role) && (
                <button
                  onClick={() => onRequestRemove(u)}
                  className="btn-icon h-7 w-7 hover:text-danger"
                  title={u._id === currentUserId ? 'Leave' : 'Remove'}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Section title="Owner" hint="Full control — only one." items={[course.creator]} role="owner" />
      <Section title="Managers" hint="Edit lessons & tasks, invite participants." items={course.managers} addLabel="Add manager" onAdd={onAddManager} canAdd={isOwner} role="manager" />
      <Section title="Participants" hint="Read lessons and complete tasks." items={course.participants} addLabel="Add participant" onAdd={onAddParticipant} canAdd={canEdit} role="participant" />
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────── */
/* Roster view + response drill-down                                      */
/* ────────────────────────────────────────────────────────────────────── */

const RosterView = ({ rows, loading, onOpenActivity }) => {
  const [filter, setFilter] = useState('all');

  if (loading) return <div className="py-10 flex justify-center"><div className="loader-ring" /></div>;
  if (!rows.length) {
    return (
      <div className="surface-1 border border-hairline-soft rounded-xl p-8 text-center text-[13px] text-ink-muted">
        No one is enrolled yet.
      </div>
    );
  }

  const counts = {
    all: rows.length,
    owner: rows.filter((r) => r.role === 'owner').length,
    manager: rows.filter((r) => r.role === 'manager').length,
    participant: rows.filter((r) => r.role === 'participant').length
  };
  const visible = filter === 'all' ? rows : rows.filter((r) => r.role === filter);

  const FILTERS = [
    { key: 'all', label: 'Everyone' },
    { key: 'owner', label: 'Owner' },
    { key: 'manager', label: 'Managers' },
    { key: 'participant', label: 'Participants' }
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1 surface-1 rounded-pill p-1 border border-hairline-soft w-fit flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`pill-tab ${filter === f.key ? 'is-active' : ''}`}
          >
            {f.label}
            <span className="text-[10px] text-ink-dim ml-1">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="surface-1 rounded-xl border border-hairline-soft overflow-x-auto">
        <table className="w-full text-left min-w-[720px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.16em] text-ink-dim">
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Progress</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Activity</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const meta = ROLE_META[r.role] || ROLE_META.participant;
              const RoleIcon = meta.icon;
              return (
                <tr
                  key={r.user._id}
                  className="border-t border-hairline-soft hover:bg-surface-2/40 cursor-pointer transition-colors"
                  onClick={() => onOpenActivity?.(r)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar user={r.user} size="sm" noTooltip />
                      <span className="text-[13px] text-ink tracking-tight">@{r.user.username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`chip ${meta.chipClass}`}>
                      <RoleIcon className="h-3 w-3" />{meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 min-w-[240px]">
                    {r.required > 0 ? (
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden">
                          <div className={`h-full ${r.isDone ? 'bg-success' : 'bg-accent'}`} style={{ width: `${r.pct || 0}%` }} />
                        </div>
                        <span className="text-[11px] text-ink-muted tabular-nums w-16 text-right">{r.completed}/{r.required}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-ink-dim">No required tasks</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.required === 0
                      ? <span className="chip">—</span>
                      : r.isDone
                        ? <span className="chip chip-success"><CheckCircle2 className="h-3 w-3" />Completed</span>
                        : r.completed > 0
                          ? <span className="chip">In progress</span>
                          : <span className="chip">Not started</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={(e) => { e.stopPropagation(); onOpenActivity?.(r); }}
                    >
                      <Activity className="h-3 w-3" />View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────── */
/* Participant activity modal — full per-user task breakdown              */
/* ────────────────────────────────────────────────────────────────────── */

const TaskActivityDetail = ({ task, response, done }) => {
  const fmt = (d) => d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';

  if (task.type === 'check') {
    return (
      <p className="text-[11px] text-ink-dim mt-1">
        {done ? 'Marked done' : 'Not done'}
      </p>
    );
  }
  if (task.type === 'link') {
    if (!response && !done) {
      return <p className="text-[11px] text-ink-dim mt-1">Not visited</p>;
    }
    return (
      <p className="text-[11px] text-ink-dim mt-1">
        Visited{response?.submittedAt ? ` · ${fmt(response.submittedAt)}` : ''}
      </p>
    );
  }
  if (task.type === 'response') {
    if (!response?.text) {
      return <p className="text-[11px] text-ink-dim mt-1">No response submitted</p>;
    }
    return (
      <div className="mt-2 flex flex-col gap-1">
        <div className="surface-2 rounded-md p-2.5 text-[13px] text-ink whitespace-pre-wrap leading-relaxed border border-hairline-soft">
          {response.text}
        </div>
        <p className="text-[10px] text-ink-dim">Submitted {fmt(response.submittedAt)}</p>
      </div>
    );
  }
  if (task.type === 'quiz') {
    if (!response) {
      return <p className="text-[11px] text-ink-dim mt-1">Not attempted</p>;
    }
    const picked = task.options?.[response.choiceIndex];
    return (
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-ink">
          Chose: <span className="font-medium">{picked ?? '—'}</span>
        </span>
        {response.isCorrect
          ? <span className="chip chip-success">Correct</span>
          : <span className="chip chip-danger">Wrong</span>}
        {response.attempts > 1 && <span className="text-[11px] text-ink-dim">{response.attempts} attempts</span>}
        <span className="text-[10px] text-ink-dim">· {fmt(response.submittedAt)}</span>
      </div>
    );
  }
  return null;
};

const ParticipantActivityModal = ({ open, onClose, row: rawRow, course }) => {
  const titleId = useModalTitleId();
  const [cachedRow, setCachedRow] = useState(null);

  useEffect(() => {
    if (rawRow) setCachedRow(rawRow);
  }, [rawRow]);

  const row = rawRow || cachedRow;
  if (!row) return <Modal open={false} onClose={onClose} />;

  const doneSet = new Set((row.completedTaskIds || []).map(String));
  const responseMap = new Map();
  for (const r of (row.responses || [])) responseMap.set(String(r.taskId), r);

  const fmt = (d) => d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const meta = ROLE_META[row.role] || ROLE_META.participant;
  const RoleIcon = meta.icon;

  // Last activity = max submittedAt across responses
  const lastActivity = (row.responses || []).reduce((max, r) => {
    const t = r.submittedAt ? new Date(r.submittedAt).getTime() : 0;
    return t > max ? t : max;
  }, 0);

  return (
    <Modal open={open} onClose={onClose} maxWidth={760}>
      <div className="flex flex-col">
        <header className="px-6 py-4 border-b border-hairline-soft flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <UserAvatar user={row.user} size="md" noTooltip />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id={titleId} className="display-sm">@{row.user.username}</h2>
                <span className={`chip ${meta.chipClass}`}><RoleIcon className="h-3 w-3" />{meta.label}</span>
              </div>
              <p className="text-[11px] text-ink-muted mt-1">
                {row.startedAt && `Started ${fmt(row.startedAt)}`}
                {lastActivity > 0 && ` · Last active ${fmt(new Date(lastActivity))}`}
                {row.isDone && row.completedAt && ` · Completed ${fmt(row.completedAt)}`}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-icon shrink-0"><X className="h-4 w-4" /></button>
        </header>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
          {row.required > 0 && (
            <div className="surface-2 border border-hairline-soft rounded-lg p-4">
              <ProgressBar
                pct={row.pct}
                isDone={row.isDone}
                label={`${row.completed}/${row.required} required tasks done`}
              />
            </div>
          )}

          {course.lessons.length === 0 && (
            <p className="text-[12px] text-ink-dim italic text-center py-6">This track has no lessons yet.</p>
          )}

          {course.lessons.map((l, i) => {
            const totalInLesson = l.tasks.length;
            const doneInLesson = l.tasks.filter((t) => doneSet.has(String(t._id))).length;
            return (
              <section key={l._id} className="surface-2 rounded-lg border border-hairline-soft p-4">
                <header className="flex items-center justify-between mb-3 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-ink-dim w-5 text-right tabular-nums shrink-0">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-[13px] text-ink font-medium tracking-tight truncate">{l.title}</span>
                  </div>
                  <span className="text-[11px] text-ink-muted shrink-0 tabular-nums">{doneInLesson}/{totalInLesson}</span>
                </header>
                {totalInLesson === 0 ? (
                  <p className="text-[12px] text-ink-dim italic">No tasks.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {l.tasks.map((t) => {
                      const done = doneSet.has(String(t._id));
                      const resp = responseMap.get(String(t._id));
                      const tmeta = taskTypeMeta(t.type);
                      const TIcon = tmeta.icon;
                      return (
                        <li
                          key={t._id}
                          className={`surface-1 rounded-md p-3 border ${done ? 'border-success/30' : 'border-hairline-soft'}`}
                        >
                          <div className="flex items-start gap-2.5">
                            {done
                              ? <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                              : <Circle className="h-4 w-4 text-ink-dim mt-0.5 shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[13px] tracking-tight ${done ? 'text-ink' : 'text-ink-muted'}`}>{t.title}</span>
                                <span className="chip"><TIcon className="h-3 w-3" />{tmeta.label}</span>
                                {!t.required && <span className="text-[10px] uppercase tracking-[0.16em] text-ink-dim">optional</span>}
                              </div>
                              <TaskActivityDetail task={t} response={resp} done={done} />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        <footer className="px-6 py-3 border-t border-hairline-soft flex items-center justify-end">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </footer>
      </div>
    </Modal>
  );
};

/* ────────────────────────────────────────────────────────────────────── */
/* Per-task submissions — every participant's answer for a single task   */
/* ────────────────────────────────────────────────────────────────────── */

const TaskSubmissionsModal = ({ open, onClose, rows, loading, ctx, onOpenActivity }) => {
  const titleId = useModalTitleId();
  const [cachedCtx, setCachedCtx] = useState(null);

  useEffect(() => {
    if (ctx) setCachedCtx(ctx);
  }, [ctx]);

  const activeCtx = ctx || cachedCtx;
  if (!activeCtx) return <Modal open={false} onClose={onClose} />;

  const { task, lessonTitle } = activeCtx;
  const tmeta = taskTypeMeta(task.type);
  const TIcon = tmeta.icon;

  // Build [{ user, role, response, done }] for everyone with a role
  const entries = (rows || []).map((row) => {
    const doneSet = new Set((row.completedTaskIds || []).map(String));
    const resp = (row.responses || []).find((r) => String(r.taskId) === String(task._id));
    return {
      user: row.user,
      role: row.role,
      done: doneSet.has(String(task._id)),
      response: resp,
      row
    };
  });

  const responded = entries.filter((e) => {
    if (task.type === 'check') return e.done;
    if (task.type === 'link')  return e.done || !!e.response;
    return !!e.response;
  });
  const notYet = entries.filter((e) => !responded.includes(e));

  return (
    <Modal open={open} onClose={onClose} maxWidth={720}>
      <div className="flex flex-col">
        <header className="px-6 py-4 border-b border-hairline-soft flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink-dim">{lessonTitle}</p>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <h2 id={titleId} className="display-sm">{task.title}</h2>
              <span className="chip"><TIcon className="h-3 w-3" />{tmeta.label}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-icon shrink-0"><X className="h-4 w-4" /></button>
        </header>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
          {loading ? (
            <div className="py-10 flex justify-center"><div className="loader-ring" /></div>
          ) : entries.length === 0 ? (
            <p className="text-[12px] text-ink-dim italic text-center py-6">No one is enrolled yet.</p>
          ) : (
            <>
              <div className="flex items-center gap-3 text-[11px] text-ink-muted">
                <span><span className="text-ink font-medium">{responded.length}</span> submitted</span>
                <span className="text-ink-dim">·</span>
                <span><span className="text-ink font-medium">{notYet.length}</span> pending</span>
              </div>

              {responded.length > 0 && (
                <section className="flex flex-col gap-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Submitted</p>
                  {responded.map((e) => (
                    <SubmissionRow key={e.user._id} entry={e} task={task} onOpenActivity={onOpenActivity} />
                  ))}
                </section>
              )}

              {notYet.length > 0 && (
                <section className="flex flex-col gap-1.5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Pending</p>
                  {notYet.map((e) => {
                    const meta = ROLE_META[e.role] || ROLE_META.participant;
                    return (
                      <button
                        key={e.user._id}
                        onClick={() => onOpenActivity?.(e.row)}
                        className="surface-2 rounded-md border border-hairline-soft p-2.5 flex items-center gap-3 hover:border-hairline transition-colors text-left"
                      >
                        <UserAvatar user={e.user} size="sm" noTooltip />
                        <span className="text-[13px] text-ink tracking-tight">@{e.user.username}</span>
                        <span className={`chip ${meta.chipClass} ml-auto`}>{meta.label}</span>
                      </button>
                    );
                  })}
                </section>
              )}
            </>
          )}
        </div>

        <footer className="px-6 py-3 border-t border-hairline-soft flex items-center justify-end">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </footer>
      </div>
    </Modal>
  );
};

const SubmissionRow = ({ entry, task, onOpenActivity }) => {
  const { user, role, response, done } = entry;
  const meta = ROLE_META[role] || ROLE_META.participant;
  const RoleIcon = meta.icon;
  const fmt = (d) => d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';

  return (
    <button
      onClick={() => onOpenActivity?.(entry.row)}
      className="surface-2 rounded-lg border border-hairline-soft p-3 hover:border-hairline transition-colors text-left flex flex-col gap-2"
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <UserAvatar user={user} size="sm" noTooltip />
        <span className="text-[13px] text-ink tracking-tight">@{user.username}</span>
        <span className={`chip ${meta.chipClass}`}><RoleIcon className="h-3 w-3" />{meta.label}</span>
        {done && <span className="chip chip-success ml-auto"><CheckCircle2 className="h-3 w-3" />Done</span>}
      </div>

      {task.type === 'response' && (
        <p className="text-[13px] text-ink whitespace-pre-wrap leading-relaxed line-clamp-4">
          {response?.text || <span className="italic text-ink-dim">No text submitted.</span>}
        </p>
      )}
      {task.type === 'quiz' && response && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] text-ink">Chose: <span className="font-medium">{task.options?.[response.choiceIndex] ?? '—'}</span></span>
          {response.isCorrect
            ? <span className="chip chip-success">Correct</span>
            : <span className="chip chip-danger">Wrong</span>}
          {response.attempts > 1 && <span className="text-[11px] text-ink-dim">{response.attempts} attempts</span>}
        </div>
      )}
      {task.type === 'link' && (
        <p className="text-[11px] text-ink-dim">Visited{response?.submittedAt ? ` · ${fmt(response.submittedAt)}` : ''}</p>
      )}
      {task.type === 'check' && (
        <p className="text-[11px] text-ink-dim">Marked done</p>
      )}
    </button>
  );
};

/* ────────────────────────────────────────────────────────────────────── */
/* Lesson editor — full blocks + resources + metadata                     */
/* ────────────────────────────────────────────────────────────────────── */

const ResourcesEditor = ({ resources, onChange }) => {
  const add = () => onChange([...resources, { title: '', url: '', description: '' }]);
  const update = (i, patch) => {
    const next = [...resources];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i) => onChange(resources.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-3">
      {resources.length === 0 && (
        <p className="text-[12px] text-ink-dim italic">No resources yet.</p>
      )}
      {resources.map((r, i) => (
        <div key={i} className="surface-2 border border-hairline-soft rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Resource {i + 1}</span>
            <button type="button" className="btn-icon h-7 w-7 hover:text-danger" onClick={() => remove(i)}><Trash2 className="h-3 w-3" /></button>
          </div>
          <input className="input" placeholder="Title" value={r.title} onChange={(e) => update(i, { title: e.target.value })} />
          <input className="input" placeholder="https://…" value={r.url} onChange={(e) => update(i, { url: e.target.value })} />
          <input className="input" placeholder="Short description (optional)" value={r.description} onChange={(e) => update(i, { description: e.target.value })} />
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-sm w-full justify-center" onClick={add}>
        <Plus className="h-3.5 w-3.5" />Add resource
      </button>
    </div>
  );
};

const LessonEditorModal = ({ open, initial, courseId, onClose, onSaved }) => {
  const api = useCourseApi();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [minutes, setMinutes] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [resources, setResources] = useState([]);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef(null);
  const titleId = useModalTitleId();

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title || '');
    setSummary(initial?.summary || '');
    setMinutes(initial?.estimatedMinutes != null ? String(initial.estimatedMinutes) : '');
    // Initialize blocks: prefer existing blocks; else convert legacy `content` to a single paragraph block
    if (initial?.blocks?.length) setBlocks(initial.blocks);
    else if (initial?.content) setBlocks([{ type: 'paragraph', text: initial.content }]);
    else setBlocks([]);
    setResources(initial?.resources || []);
    setBusy(false);
  }, [open, initial]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const body = JSON.stringify({
        title: title.trim(),
        summary,
        estimatedMinutes: minutes ? Number(minutes) : null,
        blocks,
        resources: resources.filter((r) => r.title?.trim() && r.url?.trim())
      });
      const c = initial
        ? await api(`/api/courses/${courseId}/lessons/${initial._id}`, { method: 'PUT', body })
        : await api(`/api/courses/${courseId}/lessons`, { method: 'POST', body });
      // Pass new lesson id back so the detail view can focus it
      let newLessonId = null;
      if (!initial && c?.lessons?.length) {
        newLessonId = c.lessons[c.lessons.length - 1]._id;
      }
      onSaved?.(c, newLessonId);
      onClose();
      toast.success(initial ? 'Lesson updated.' : 'Lesson added.');
    } catch (err) {
      toast.error(err.message || 'Could not save lesson');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={880} initialFocus={titleRef}>
      <form onSubmit={submit} className="flex flex-col">
        <header className="px-6 py-4 border-b border-hairline-soft flex items-center justify-between">
          <h2 id={titleId} className="display-sm">{initial ? 'Edit lesson' : 'New lesson'}</h2>
          <button type="button" onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
        </header>

        <div className="p-6 flex flex-col gap-6 overflow-y-auto">
          <section className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Title</span>
              <input ref={titleRef} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What this lesson covers" maxLength={140} required />
            </label>
            <div className="grid sm:grid-cols-[1fr_140px] gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Summary</span>
                <input className="input" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line summary shown in sidebar" maxLength={200} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Est. minutes</span>
                <input className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 10" />
              </label>
            </div>
          </section>

          <div className="divider" />

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] uppercase tracking-[0.18em] text-ink-dim">Content blocks</p>
              <span className="text-[11px] text-ink-dim">{blocks.length} block{blocks.length === 1 ? '' : 's'}</span>
            </div>
            <BlockListEditor blocks={blocks} onChange={setBlocks} />
          </section>

          <div className="divider" />

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] uppercase tracking-[0.18em] text-ink-dim">Resources · external links</p>
              <span className="text-[11px] text-ink-dim">{resources.length} link{resources.length === 1 ? '' : 's'}</span>
            </div>
            <ResourcesEditor resources={resources} onChange={setResources} />
          </section>
        </div>

        <footer className="px-6 py-4 border-t border-hairline-soft flex items-center justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()} data-loading={busy ? 'true' : undefined}>
            {initial ? 'Save changes' : 'Add lesson'}
          </button>
        </footer>
      </form>
    </Modal>
  );
};

/* ────────────────────────────────────────────────────────────────────── */
/* Task editor                                                            */
/* ────────────────────────────────────────────────────────────────────── */

const TaskEditorModal = ({ open, ctx, courseId, onClose, onSaved }) => {
  const api = useCourseApi();
  const toast = useToast();
  const [task, setTask] = useState({ type: 'check', title: '', instructions: '', required: true });
  const [busy, setBusy] = useState(false);
  const titleRef = useRef(null);
  const titleId = useModalTitleId();

  useEffect(() => {
    if (!open) return;
    const t = ctx?.task || {};
    setTask({
      type: t.type || 'check',
      title: t.title || '',
      instructions: t.instructions || '',
      required: t.required !== false,
      url: t.url || '',
      options: t.options?.length ? [...t.options] : ['', ''],
      correctIndex: Number.isInteger(t.correctIndex) ? t.correctIndex : 0
    });
    setBusy(false);
  }, [open, ctx]);

  const submit = async (e) => {
    e.preventDefault();
    if (!task.title?.trim() || !ctx?.lessonId || busy) return;
    setBusy(true);
    try {
      const payload = {
        title: task.title.trim(),
        instructions: task.instructions,
        required: !!task.required,
        type: task.type
      };
      if (task.type === 'link') payload.url = task.url || '';
      if (task.type === 'quiz') {
        payload.options = task.options || [];
        payload.correctIndex = task.correctIndex;
      }
      const body = JSON.stringify(payload);
      const url = ctx.task
        ? `/api/courses/${courseId}/lessons/${ctx.lessonId}/tasks/${ctx.task._id}`
        : `/api/courses/${courseId}/lessons/${ctx.lessonId}/tasks`;
      const c = await api(url, { method: ctx.task ? 'PUT' : 'POST', body });
      onSaved?.(c);
      onClose();
      toast.success(ctx.task ? 'Task updated.' : 'Task added.');
    } catch (err) {
      toast.error(err.message || 'Could not save task');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={560} initialFocus={titleRef}>
      <form onSubmit={submit} className="flex flex-col">
        <header className="px-6 py-4 border-b border-hairline-soft flex items-center justify-between">
          <h2 id={titleId} className="display-sm">{ctx?.task ? 'Edit task' : 'New task'}</h2>
          <button type="button" onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
        </header>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Type</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TASK_TYPES.map((t) => {
                const Icon = t.icon;
                const active = task.type === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTask((cur) => ({ ...cur, type: t.key }))}
                    className={`rounded-md p-3 border text-left flex flex-col gap-1 transition-colors ${
                      active ? 'border-accent/40 bg-accent/[0.06]' : 'border-hairline-soft bg-surface-1 hover:border-hairline'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-ink">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-[12px] tracking-tight font-medium">{t.label}</span>
                    </div>
                    <span className="text-[10px] text-ink-dim leading-snug">{t.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Title</span>
            <input ref={titleRef} className="input" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} placeholder="What the participant should do" maxLength={140} required />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Instructions · markdown-lite</span>
            <textarea className="input" value={task.instructions} onChange={(e) => setTask({ ...task, instructions: e.target.value })} placeholder="Steps, links, expected outcome…" rows={4} />
          </label>

          <TaskTypeEditor task={task} onChange={setTask} />

          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            <input type="checkbox" checked={task.required} onChange={(e) => setTask({ ...task, required: e.target.checked })} />
            Required for course completion
          </label>
        </div>

        <footer className="px-6 py-4 border-t border-hairline-soft flex items-center justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !task.title?.trim()} data-loading={busy ? 'true' : undefined}>
            {ctx?.task ? 'Save changes' : 'Add task'}
          </button>
        </footer>
      </form>
    </Modal>
  );
};

/* ────────────────────────────────────────────────────────────────────── */
/* Member picker                                                          */
/* ────────────────────────────────────────────────────────────────────── */

const MemberPickerModal = ({ open, role, course, allUsers, currentUserId, courseId, onClose, onSaved }) => {
  const api = useCourseApi();
  const toast = useToast();
  const [picked, setPicked] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const titleId = useModalTitleId();

  useEffect(() => {
    if (open) { setPicked(new Set()); setQuery(''); setBusy(false); }
  }, [open]);

  const taken = useMemo(() => {
    const ids = new Set();
    if (course?.creator) ids.add(course.creator._id);
    (course?.managers || []).forEach((m) => ids.add(m._id));
    if (role === 'participant') (course?.participants || []).forEach((p) => ids.add(p._id));
    return ids;
  }, [course, role]);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (allUsers || [])
      .filter((u) => !taken.has(u._id))
      .filter((u) => !q || u.username?.toLowerCase().includes(q));
  }, [allUsers, taken, query]);

  const toggle = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!picked.size || busy) return;
    setBusy(true);
    try {
      const c = await api(`/api/courses/${courseId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userIds: Array.from(picked), role })
      });
      onSaved?.(c);
      onClose();
      toast.success(`Added ${picked.size} ${role}${picked.size === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(err.message || 'Could not add members');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={520}>
      <div className="flex flex-col">
        <header className="px-6 py-4 border-b border-hairline-soft flex items-center justify-between">
          <h2 id={titleId} className="display-sm capitalize">Add {role}s</h2>
          <button type="button" onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
        </header>
        <div className="p-6 flex flex-col gap-4">
          <input className="input" placeholder="Search by username" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="surface-2 rounded-md border border-hairline-soft max-h-[320px] overflow-y-auto">
            {available.length === 0 ? (
              <p className="text-[12px] text-ink-dim italic text-center p-4">No matching users.</p>
            ) : (
              available.map((u) => {
                const on = picked.has(u._id);
                return (
                  <button
                    key={u._id}
                    type="button"
                    onClick={() => toggle(u._id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-hairline-soft last:border-0 transition-colors ${
                      on ? 'bg-accent/[0.08]' : 'hover:bg-surface-3'
                    }`}
                  >
                    <input type="checkbox" readOnly checked={on} />
                    <UserAvatar user={u} size="sm" noTooltip />
                    <span className="text-[13px] text-ink tracking-tight flex-1">@{u.username}</span>
                    {on && <ChevronRight className="h-3.5 w-3.5 text-accent" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
        <footer className="px-6 py-4 border-t border-hairline-soft flex items-center justify-between">
          <span className="text-[12px] text-ink-muted">{picked.size} selected</span>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!picked.size || busy} onClick={submit} data-loading={busy ? 'true' : undefined}>Add</button>
          </div>
        </footer>
      </div>
    </Modal>
  );
};

/* ────────────────────────────────────────────────────────────────────── */
/* Course settings — title/summary/category/tags/time/publish/delete      */
/* ────────────────────────────────────────────────────────────────────── */

const CourseSettingsModal = ({ open, onClose, course, courseId, onSaved, onRequestDelete }) => {
  const api = useCourseApi();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [minutes, setMinutes] = useState('');
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleId = useModalTitleId();

  useEffect(() => {
    if (!open || !course) return;
    setTitle(course.title || '');
    setSummary(course.summary || '');
    setCategory(course.category || '');
    setTagsRaw((course.tags || []).join(', '));
    setMinutes(course.estimatedMinutes != null ? String(course.estimatedMinutes) : '');
    setPublished(!!course.isPublished);
    setBusy(false);
  }, [open, course]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const c = await api(`/api/courses/${courseId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: title.trim(),
          summary,
          category: category.trim(),
          tags: tagListFromString(tagsRaw),
          estimatedMinutes: minutes ? Number(minutes) : null,
          isPublished: published
        })
      });
      onSaved?.(c);
      onClose();
      toast.success('Track settings saved.');
    } catch (err) {
      toast.error(err.message || 'Could not save settings');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={560}>
      <form onSubmit={submit} className="flex flex-col">
        <header className="px-6 py-4 border-b border-hairline-soft flex items-center justify-between">
          <h2 id={titleId} className="display-sm">Track settings</h2>
          <button type="button" onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
        </header>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={140} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Summary</span>
            <textarea className="input" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} maxLength={400} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Category</span>
              <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Est. minutes</span>
              <input className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Tags · comma-separated</span>
            <input className="input" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} />
          </label>

          <div className="divider" />

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="mt-1" />
            <span>
              <span className="block text-[14px] text-ink tracking-tight">Publish to Discover</span>
              <span className="block text-[12px] text-ink-muted">Anyone on the team can find and self-enroll.</span>
            </span>
          </label>

          <button
            type="button"
            onClick={onRequestDelete}
            className="surface-2 rounded-lg p-4 text-left flex items-start gap-3 hover:bg-danger/10 transition-colors mt-2"
          >
            <Trash2 className="h-4 w-4 text-danger mt-0.5" />
            <div>
              <p className="text-[14px] text-danger font-medium tracking-tight">Delete track</p>
              <p className="text-[12px] text-ink-muted">Removes lessons, tasks, and everyone's progress.</p>
            </div>
          </button>
        </div>

        <footer className="px-6 py-4 border-t border-hairline-soft flex items-center justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()} data-loading={busy ? 'true' : undefined}>
            Save settings
          </button>
        </footer>
      </form>
    </Modal>
  );
};

export default CoursesTab;
