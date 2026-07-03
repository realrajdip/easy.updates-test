import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, CheckCircle2, Clock, Calendar, Check, MessageSquare
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { API_URL } from '../config';

const toArray = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return [v];
};

const PersonalDashboard = ({ onOpenThread, allUsers = [] }) => {
  const { token, user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();
  const [updates, setUpdates] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [uRes, tRes] = await Promise.all([
        fetch(`${API_URL}/api/updates`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/tasks`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!uRes.ok || !tRes.ok) throw new Error('Workspace fetch failed');
      setUpdates(await uRes.json());
      setTasks(await tRes.json());
    } catch (e) {
      console.error(e);
      toast.error('Could not load your workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!socket) return;
    const onNewU = (u) => setUpdates((prev) => [u, ...prev]);
    const onAckU = (u) => setUpdates((prev) => prev.map((x) => (x._id === u._id ? u : x)));
    const onNewT = (t) => setTasks((prev) => [t, ...prev]);
    const onStatusT = (t) => setTasks((prev) => prev.map((x) => (x._id === t._id ? t : x)));
    socket.on('update:new', onNewU);
    socket.on('update:acknowledged', onAckU);
    socket.on('task:new', onNewT);
    socket.on('task:status_changed', onStatusT);
    return () => {
      socket.off('update:new', onNewU);
      socket.off('update:acknowledged', onAckU);
      socket.off('task:new', onNewT);
      socket.off('task:status_changed', onStatusT);
    };
  }, [socket]);

  const handleAck = async (e, updateId) => {
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
      return prev.map((u) => {
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
      setUpdates((prev) => prev.map((u) => (u._id === updateId ? updated : u)));
    } catch (err) {
      console.error(err);
      setUpdates(snapshot);
      toast.error('Acknowledge failed — please try again.');
    }
  };

  const currentUserId = user?.id || user?._id;

  const isRelevantToMe = (u) => {
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

  const my = updates.filter((u) => isRelevantToMe(u) && !isFullyAcknowledged(u));
  const pending = my.filter((u) => {
    const creatorId = u.creator?._id || u.creator;
    return creatorId !== currentUserId && !u.acknowledgedBy.some((a) => (a._id || a) === currentUserId);
  });
  const acknowledged = my.filter((u) => {
    const creatorId = u.creator?._id || u.creator;
    return creatorId === currentUserId || u.acknowledgedBy.some((a) => (a._id || a) === currentUserId);
  });
  const myTasks = tasks.filter((t) => {
    const assignedId = t.assignedTo?._id || t.assignedTo;
    return assignedId === currentUserId && t.status !== 'completed';
  });

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      {/* Hero band */}
      <section className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <div className="flex flex-col gap-4 py-2">
          <p className="text-[11px] uppercase tracking-[0.2em] text-ink-dim font-medium">Workspace</p>
          <h1 className="display-lg">
            Your queue,
            <br />
            in one view.
          </h1>
          <p className="text-[14px] text-ink-muted max-w-md tracking-tight leading-relaxed">
            {pending.length === 0 && myTasks.length === 0
              ? "You're clear. Nice work."
              : `${pending.length} update${pending.length === 1 ? '' : 's'} to acknowledge · ${myTasks.length} active task${myTasks.length === 1 ? '' : 's'}.`}
          </p>
        </div>

        <div className="spotlight spotlight-coral flex flex-col justify-between min-h-[190px]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] opacity-80 font-medium">Hello</p>
            <p className="display-md mt-2 leading-tight">@{user?.username}.</p>
          </div>
          <p className="text-[13px] opacity-80 tracking-tight leading-relaxed">
            Acknowledge the queue before you start the shift.
          </p>
        </div>
      </section>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="loader-ring" />
          <span className="text-[11px] text-ink-dim tracking-[0.2em] uppercase font-medium">
            Loading workspace
          </span>
        </div>
      ) : (
        <>
          {/* Metrics Panel */}
          <div className="surface-1 border border-hairline rounded-xl grid grid-cols-3 divide-x divide-hairline overflow-hidden">
            <div className="p-5 hover:bg-surface-2/20 transition-colors group">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-ink-dim font-medium">
                <span>To acknowledge</span>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-display font-medium text-ink tracking-tight">{pending.length}</span>
              </div>
            </div>

            <div className="p-5 hover:bg-surface-2/20 transition-colors group">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-ink-dim font-medium">
                <span>Acknowledged</span>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-display font-medium text-ink tracking-tight">{acknowledged.length}</span>
              </div>
            </div>

            <div className="p-5 hover:bg-surface-2/20 transition-colors group">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-ink-dim font-medium">
                <span>Active tasks</span>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-display font-medium text-ink tracking-tight">{myTasks.length}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
            {/* Updates queue */}
            <section className="flex flex-col gap-4">
              <h2 className="text-[13px] uppercase tracking-[0.16em] text-ink-dim font-semibold border-b border-hairline-soft pb-3 flex items-center justify-between">
                <span>Action required</span>
                <span className="text-[11px] font-normal tracking-tight text-ink-muted">{pending.length} pending</span>
              </h2>

              {pending.length === 0 ? (
                <EmptyState 
                  message="No updates pending" 
                  subtitle="You're fully caught up with all shift handovers." 
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {pending.map((u) => (
                    <article
                      key={u._id}
                      className="surface-1 border border-hairline-soft rounded-xl p-5 flex flex-col gap-3.5 hover:border-hairline hover:bg-surface-2/30 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between text-[11px] text-ink-dim tracking-tight">
                        <span className="font-medium text-ink-muted">From @{u.creator.username}</span>
                        <span>{new Date(u.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-[14px] text-ink leading-relaxed line-clamp-3 tracking-tight whitespace-pre-wrap">
                        {u.description}
                      </p>
                      <div className="flex items-center justify-between pt-3 border-t border-hairline-soft/80">
                        {u.eta ? (
                          <span className="flex items-center gap-1.5 text-[11px] text-accent font-medium tracking-tight">
                            <Calendar className="h-3.5 w-3.5" />
                            Target: {new Date(u.eta).toLocaleDateString()}
                          </span>
                        ) : (
                          <span />
                        )}
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
                          <button onClick={(e) => handleAck(e, u._id)} className="btn btn-primary btn-sm">
                            <Check className="h-3.5 w-3.5" />
                            Acknowledge
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Tasks queue */}
            <section className="flex flex-col gap-4">
              <h2 className="text-[13px] uppercase tracking-[0.16em] text-ink-dim font-semibold border-b border-hairline-soft pb-3 flex items-center justify-between">
                <span>My tasks</span>
                <span className="text-[11px] font-normal tracking-tight text-ink-muted">{myTasks.length} active</span>
              </h2>

              {myTasks.length === 0 ? (
                <EmptyState 
                  message="Nothing assigned" 
                  subtitle="You don't have any pending task assignments." 
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {myTasks.map((t) => (
                    <article
                      key={t._id}
                      className="surface-1 border border-hairline-soft rounded-xl p-5 flex flex-col gap-3 hover:border-hairline hover:bg-surface-2/30 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-[14px] tracking-tight text-ink font-medium leading-snug">
                          {t.title}
                        </h3>
                        <span
                          className={`chip text-[10px] py-0.5 tracking-wider uppercase ${
                            t.status === 'in_progress' ? 'chip-accent' : ''
                          }`}
                        >
                          {t.status === 'in_progress' ? 'In progress' : 'To do'}
                        </span>
                      </div>
                      <p className="text-[12px] text-ink-muted line-clamp-2 leading-relaxed tracking-tight">
                        {t.description}
                      </p>
                      <div className="flex items-center justify-between pt-3 border-t border-hairline-soft/80 text-[11px] text-ink-dim">
                        <span className="font-medium text-ink-muted">Assigned by @{t.creator.username}</span>
                        <div className="flex items-center gap-3">
                          {t.eta && (
                            <span className="flex items-center gap-1 text-accent tracking-tight font-medium">
                              <Clock className="h-3.5 w-3.5" />
                              {new Date(t.eta).toLocaleDateString()}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenThread({ type: 'discussion_task', id: t._id });
                            }}
                            className="btn btn-secondary btn-xs"
                          >
                            <MessageSquare className="h-3 w-3" />
                            Discuss
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
};

const EmptyState = ({ message, subtitle }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed border-hairline-soft bg-surface-1/5 text-center animate-fade-in select-none">
    <p className="text-[13px] text-ink font-medium tracking-tight">{message}</p>
    <p className="text-[11px] text-ink-muted mt-1 max-w-[240px] leading-relaxed">{subtitle}</p>
  </div>
);

export default PersonalDashboard;


