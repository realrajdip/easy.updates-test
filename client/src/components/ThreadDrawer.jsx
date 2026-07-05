import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Eye, SmilePlus, CornerDownRight, MessageSquareDashed } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { API_URL } from '../config';
import MentionsInput from './MentionsInput';
import UserAvatar from './UserAvatar';
import { useStaleData } from '../hooks/useStaleData';

const QUICK_EMOJIS = ['👍', '✅', '🚨', '❤️', '😂', '😮'];
const EXTRA_EMOJIS = ['🙌', '🔥', '💯', '🎉', '😢', '😡'];

/* ─── Reaction popover ──────────────────────────────────────────────────── */
const ReactionBar = ({ anchorRef, commentId, onReact, existingReactions = [], userId }) => {
  const [showMore, setShowMore] = useState(false);
  const [rect, setRect] = useState(null);
  const barRef = useRef(null);

  useEffect(() => {
    if (anchorRef?.current) setRect(anchorRef.current.getBoundingClientRect());
  });

  if (!rect) return null;
  const barH = barRef.current?.offsetHeight || 36;
  const barW = barRef.current?.offsetWidth || 300;
  const top = rect.top - barH - 6;
  const left = Math.min(rect.right - barW, window.innerWidth - barW - 8);

  return ReactDOM.createPortal(
    <div
      ref={barRef}
      style={{
        top: Math.max(8, top),
        left: Math.max(8, left),
        position: 'fixed',
        zIndex: 9999,
        background: '#1a1a1a',
        border: '1px solid #2e2e2e',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}
      className="flex items-center px-2 py-1.5 gap-1 rounded-xl"
    >
      {QUICK_EMOJIS.map((e) => (
        <button
          key={e}
          onClick={() => onReact(commentId, e)}
          className={`text-base w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:scale-125 hover:bg-white/10 ${
            existingReactions.some((r) => r?.emoji === e && r?.user?._id === userId)
              ? 'bg-accent/20 scale-110'
              : ''
          }`}
        >
          {e}
        </button>
      ))}
      {showMore && EXTRA_EMOJIS.map((e) => (
        <button
          key={e}
          onClick={() => onReact(commentId, e)}
          className="text-base w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:scale-125 hover:bg-white/10"
        >
          {e}
        </button>
      ))}
      <button
        onClick={() => setShowMore((v) => !v)}
        className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-white/10 text-ink-muted ml-0.5"
        title="More reactions"
      >
        <SmilePlus className="h-3.5 w-3.5" />
      </button>
    </div>,
    document.body
  );
};

/* ─── Read receipt badge ────────────────────────────────────────────────── */
const ReadReceiptBadge = ({ readBy = [], authorId }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        popoverRef.current && !popoverRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const readers = readBy.filter((r) => r && r._id !== authorId);
  if (readers.length === 0) return null;

  const getPopoverStyle = () => {
    if (!triggerRef.current) return {};
    const r = triggerRef.current.getBoundingClientRect();
    const popH = popoverRef.current?.offsetHeight || 160;
    const popW = popoverRef.current?.offsetWidth || 200;
    const showBelow = r.top < popH + 12;
    const top = showBelow ? r.bottom + 6 : r.top - popH - 6;
    const left = Math.min(r.right - popW, window.innerWidth - popW - 8);
    return { top: Math.max(8, top), left: Math.max(8, left), position: 'fixed', zIndex: 9999 };
  };

  return (
    <div className="relative inline-flex items-center" ref={triggerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-ink-dim hover:text-ink-muted transition-colors select-none tracking-tight"
        title="Click to see who read this"
      >
        <Eye className="h-3 w-3" />
        <span>{readers.length}</span>
        <span className="flex -space-x-1 ml-0.5">
          {readers.slice(0, 3).map((r) => (
            <span
              key={r._id}
              style={{ backgroundColor: r.avatarColor || '#888', boxShadow: '0 0 0 1.5px #141414' }}
              className="w-3 h-3 rounded-full flex items-center justify-center text-[6px] font-bold text-white"
            >
              {r.username?.slice(0, 1).toUpperCase()}
            </span>
          ))}
          {readers.length > 3 && (
            <span
              style={{ boxShadow: '0 0 0 1.5px #141414' }}
              className="w-3 h-3 rounded-full bg-surface-3 flex items-center justify-center text-[6px] font-bold text-ink-muted"
            >
              +{readers.length - 3}
            </span>
          )}
        </span>
      </button>

      {open && ReactDOM.createPortal(
        <div
          ref={popoverRef}
          style={{ ...getPopoverStyle(), background: '#1a1a1a', border: '1px solid #2e2e2e', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
          className="rounded-xl py-2 min-w-[200px]"
        >
          <div className="px-3 py-1.5 text-[10px] text-ink-dim uppercase tracking-[0.16em] border-b border-hairline mb-1">
            Read by {readers.length}
          </div>
          {readers.map((r) => (
            <div key={r._id} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-surface-3 cursor-default">
              <UserAvatar user={r} size="xs" noTooltip />
              <span className="text-[12px] text-ink tracking-tight truncate">@{r.username}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

/* ─── Unified hover action bar (portal, above message) ─────────────────── */
const HoverActions = ({ msgRef, commentId, isOwn, existingReactions, userId, onReact, onReply, onEdit, onDelete }) => {
  const [rect, setRect] = React.useState(null);
  const barRef = React.useRef(null);

  React.useEffect(() => {
    if (msgRef?.current) setRect(msgRef.current.getBoundingClientRect());
  });

  if (!rect) return null;

  const barH = barRef.current?.offsetHeight || 36;
  const barW = barRef.current?.offsetWidth || 350;
  const topRaw = rect.top - barH - 6;
  const leftRaw = rect.right - barW;
  const top = Math.max(8, topRaw);
  const left = Math.max(8, Math.min(leftRaw, window.innerWidth - barW - 8));

  return ReactDOM.createPortal(
    <div
      ref={barRef}
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: 9999,
        background: '#1a1a1a',
        border: '1px solid #2e2e2e',
        boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
      }}
      className="flex items-center rounded-xl overflow-hidden"
    >
      {/* Quick emoji reactions */}
      <div className="flex items-center px-1.5 py-1 gap-0.5">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => onReact(commentId, e)}
            className={`text-base w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:scale-125 hover:bg-white/10 ${
              existingReactions.some((r) => r?.emoji === e && r?.user?._id === userId) ? 'bg-accent/20' : ''
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px self-stretch bg-white/10 my-1" />

      {/* Text actions */}
      <div className="flex items-center px-1 py-1 gap-0.5">
        <button
          onClick={onReply}
          className="text-[11px] text-ink-muted hover:text-ink px-2.5 py-1.5 rounded-lg hover:bg-white/8 transition-colors font-medium"
        >
          Reply
        </button>
        {isOwn && (
          <>
            <button
              onClick={onEdit}
              className="text-[11px] text-ink-muted hover:text-ink px-2.5 py-1.5 rounded-lg hover:bg-white/8 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="text-[11px] text-ink-muted hover:text-danger px-2.5 py-1.5 rounded-lg hover:bg-danger/10 transition-colors"
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

/* ─── Message content renderer ──────────────────────────────────────────── */
const MessageContent = ({ content, allUsers, isDeleted, isEditing, editContent, setEditContent, onSaveEdit, onCancelEdit }) => {
  const isValidMention = (word) => {
    if (!word.startsWith('@')) return false;
    const clean = word.slice(1).replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '').toLowerCase();
    if (clean === 'everyone') return true;
    return allUsers.some((u) => u.username.toLowerCase() === clean);
  };

  if (isDeleted) return <p className="text-[13px] text-ink-dim/60 italic">Message deleted</p>;
  if (isEditing) return (
    <div className="flex flex-col gap-2 mt-1">
      <textarea
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        className="input text-[13.5px] min-h-[48px] resize-none"
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSaveEdit(); } if (e.key === 'Escape') onCancelEdit(); }}
      />
      <div className="flex gap-2 items-center">
        <span className="text-[10px] text-ink-dim">Enter to save · Esc to cancel</span>
        <div className="ml-auto flex gap-1.5">
          <button onClick={onCancelEdit} className="btn btn-ghost btn-xs">Cancel</button>
          <button onClick={onSaveEdit} className="btn btn-primary btn-xs">Save</button>
        </div>
      </div>
    </div>
  );

  return (
    <p className="text-[13.5px] text-ink/90 whitespace-pre-wrap leading-[1.6] tracking-[-0.01em]">
      {content?.split(' ').map((word, i) =>
        isValidMention(word) ? (
          <span key={i} className="bg-accent/15 text-accent font-medium px-1 py-0.5 rounded-md mx-0.5 text-[12.5px]">
            {word}
          </span>
        ) : (word + ' ')
      )}
    </p>
  );
};

/* ─── Thread Composer ───────────────────────────────────────────────────── */
const ThreadComposer = ({
  replyTo,
  setReplyTo,
  typingUsers,
  allUsers,
  onSubmit,
  onTyping,
}) => {
  const [newComment, setNewComment] = useState('');
  const mentionsInputRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (replyTo) {
      setTimeout(() => mentionsInputRef.current?.focus(), 50);
    }
  }, [replyTo]);

  const handleSubmit = async () => {
    if (!newComment.trim() || isSubmitting) return;
    const text = newComment;
    setNewComment('');       // clear instantly — don't wait for server
    setIsSubmitting(true);
    await onSubmit(text);
    setIsSubmitting(false);
  };

  return (
    <div className="border-t border-white/[0.06] px-4 py-3 bg-[#0e0e0e] flex flex-col gap-2 shrink-0">
      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center justify-between bg-accent/[0.07] border border-accent/25 rounded-xl px-3 py-2 text-[11px] text-accent/90 tracking-tight">
          <span className="flex items-center gap-1.5">
            <CornerDownRight className="h-3 w-3" />
            Replying to <span className="font-semibold">@{replyTo.username}</span>
          </span>
          <button onClick={() => setReplyTo(null)} className="text-accent/50 hover:text-accent transition-colors">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Typing indicator */}
      {Object.keys(typingUsers).length > 0 && (
        <div className="flex items-center gap-1.5 px-1 text-[11px] text-ink-dim/60 italic tracking-tight">
          <span className="flex gap-0.5">
            <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
            <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
            <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
          </span>
          <span>{Object.values(typingUsers).join(', ')}</span>
          <span>{Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing…</span>
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-1.5 bg-white/[0.05] border border-white/[0.08] focus-within:border-accent/40 focus-within:bg-white/[0.07] rounded-xl pr-3 py-1 w-full transition-all">
        <div className="flex-1 min-w-0">
          <MentionsInput
            ref={mentionsInputRef}
            value={newComment}
            onChange={setNewComment}
            onSubmit={handleSubmit}
            onTyping={onTyping}
            users={allUsers}
            placeholder={replyTo ? `Reply to @${replyTo.username}…` : 'Write a message…'}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!newComment.trim() || isSubmitting}
          className={`rounded-full w-8 h-8 flex items-center justify-center shrink-0 transition-all ${
            newComment.trim()
              ? 'bg-accent text-white hover:bg-accent/80 shadow-lg shadow-accent/25'
              : 'text-ink-dim/30 bg-transparent cursor-not-allowed'
          }`}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

/* ─── Main drawer ───────────────────────────────────────────────────────── */
const ThreadDrawer = ({ type, id, onClose, allUsers = [] }) => {
  const { token, user } = useAuth();
  const { socket } = useSocket();

  const [replyTo, setReplyTo] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [hoveredCommentId, setHoveredCommentId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const commentsEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const hasInitializedScrollRef = useRef(false);
  const prevCommentsLengthRef = useRef(0);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  const isUpdate = type === 'discussion_update' || type === 'acks';
  const isDiscussion = type === 'discussion_update' || type === 'discussion_task';
  const isAcks = type === 'acks';

  // SWR: cache comments per unique thread — reopening same thread is instant
  const cacheKey = `thread-${type}-${id}`;
  const fetcher = useCallback(async () => {
    const detailUrl = `${API_URL}/api/${isUpdate ? 'updates' : 'tasks'}/${id}`;
    if (isDiscussion) {
      const commentsUrl = `${API_URL}/api/${isUpdate ? 'updates' : 'tasks'}/${id}/comments`;
      const [dRes, cRes] = await Promise.all([
        fetch(detailUrl, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(commentsUrl, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!dRes.ok || !cRes.ok) throw new Error('Fetch failed');
      return { detail: await dRes.json(), comments: await cRes.json() };
    } else {
      const dRes = await fetch(detailUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!dRes.ok) throw new Error('Fetch failed');
      return { detail: await dRes.json(), comments: [] };
    }
  }, [type, id, token]); // eslint-disable-line

  const {
    data: threadData,
    loading,
    setDataAndCache: setThreadData,
  } = useStaleData(cacheKey, fetcher);

  const detail   = threadData?.detail   ?? null;
  const comments = threadData?.comments ?? [];

  const setComments = useCallback((updater) => {
    setThreadData((prev) => {
      const prevComments = prev?.comments ?? [];
      const next = typeof updater === 'function' ? updater(prevComments) : updater;
      return { ...prev, comments: next };
    });
  }, [setThreadData]);

  useEffect(() => { hasInitializedScrollRef.current = false; }, [type, id]);

  useEffect(() => {
    const handle = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  useEffect(() => {
    if (!socket || !id || !isDiscussion) return;
    socket.emit('thread:join', { threadId: id });

    const onTypingUpdate = ({ userId, username, isTyping: t }) =>
      setTypingUsers((prev) => { const n = { ...prev }; if (t) n[userId] = username; else delete n[userId]; return n; });

    const onCommentsRead = ({ commentIds, user: reader }) =>
      setComments((prev) => (prev || []).map((c) => {
        if (!commentIds.includes(c._id)) return c;
        if (c.readBy?.some((r) => r._id === reader._id)) return c;
        return { ...c, readBy: [...(c.readBy || []), reader] };
      }));

    const updateCh = `${isUpdate ? 'update' : 'task'}:${id}:comment:update`;
    const onUpdate = (u) => setComments((prev) => (prev || []).map((c) => (c._id === u._id ? u : c)));
    const newCh = `${isUpdate ? 'update' : 'task'}:${id}:comment`;
    const onNew = (c) => setComments((prev) => ((prev || []).some((x) => x._id === c._id) ? (prev || []) : [...(prev || []), c]));

    socket.on('thread:typing:update', onTypingUpdate);
    socket.on('comments:read', onCommentsRead);
    socket.on(updateCh, onUpdate);
    socket.on(newCh, onNew);

    return () => {
      socket.emit('thread:leave', { threadId: id });
      socket.off('thread:typing:update', onTypingUpdate);
      socket.off('comments:read', onCommentsRead);
      socket.off(updateCh, onUpdate);
      socket.off(newCh, onNew);
      setTypingUsers({});
      if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }
      isTypingRef.current = false;
    };
  }, [socket, id, isUpdate, isDiscussion]); // eslint-disable-line

  useEffect(() => {
    if (!isDiscussion || !comments.length || !token || !user) return;
    const unread = comments.filter((c) => c.author?._id !== user.id && !c.readBy?.some((r) => r._id === user.id)).map((c) => c._id);
    if (!unread.length) return;
    fetch(`${API_URL}/api/updates/comments/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ commentIds: unread }),
    }).catch(console.error);
  }, [comments, isDiscussion, token, user]); // eslint-disable-line

  const scrollToBottom = (behavior = 'smooth') => {
    if (commentsEndRef.current) commentsEndRef.current.scrollIntoView({ behavior });
  };

  useEffect(() => { hasInitializedScrollRef.current = false; prevCommentsLengthRef.current = 0; }, [id]);

  useEffect(() => {
    if (!isDiscussion) return;
    if (!loading && comments.length > 0 && !hasInitializedScrollRef.current) {
      hasInitializedScrollRef.current = true;
      prevCommentsLengthRef.current = comments.length;
      setTimeout(() => scrollToBottom('auto'), 50);
    }
  }, [loading, comments, isDiscussion]);

  useEffect(() => {
    if (!isDiscussion || loading) return;
    if (comments.length > prevCommentsLengthRef.current) {
      const lastComment = comments[comments.length - 1];
      const lastAuthorId = lastComment?.author?._id || lastComment?.author;
      const isMyComment = lastAuthorId && lastAuthorId === user?.id;
      if (isMyComment) {
        setTimeout(() => scrollToBottom('smooth'), 50);
      } else if (scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 150;
        if (isNearBottom) setTimeout(() => scrollToBottom('smooth'), 50);
      }
    }
    prevCommentsLengthRef.current = comments.length;
  }, [comments, loading, isDiscussion, user]);

  const handleUserTyping = useCallback(() => {
    if (!socket || !isDiscussion) return;
    if (!isTypingRef.current) { isTypingRef.current = true; socket.emit('thread:typing', { threadId: id }); }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit('thread:stop_typing', { threadId: id });
    }, 2000);
  }, [socket, isDiscussion, id]);

  const submitComment = async (commentText) => {
    if (!commentText.trim()) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current) { isTypingRef.current = false; socket?.emit('thread:stop_typing', { threadId: id }); }

    // Build optimistic comment — shown instantly before server confirms
    const tempId = `optimistic-${Date.now()}`;
    const optimistic = {
      _id: tempId,
      content: commentText,
      author: {
        _id: user?._id || user?.id,
        username: user?.username,
        avatarColor: user?.avatarColor,
      },
      createdAt: new Date().toISOString(),
      reactions: [],
      readBy: [],
      parentId: replyTo?.id ?? null,
      _isOptimistic: true,
    };

    // Add to UI immediately + clear input
    setComments((prev) => [...(prev || []), optimistic]);
    setReplyTo(null);

    try {
      const body = { content: commentText };
      if (replyTo) body.parentId = replyTo.id;
      const res = await fetch(`${API_URL}/api/${isUpdate ? 'updates' : 'tasks'}/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const c = await res.json();
        // Replace optimistic placeholder with real comment
        setComments((prev) =>
          (prev || []).some((x) => x._id === c._id)
            ? (prev || []).filter((x) => x._id !== tempId) // socket already added real one
            : (prev || []).map((x) => (x._id === tempId ? c : x))
        );
      } else {
        // Server rejected — remove optimistic comment
        setComments((prev) => (prev || []).filter((x) => x._id !== tempId));
      }
    } catch (e) {
      console.error(e);
      setComments((prev) => (prev || []).filter((x) => x._id !== tempId));
    }
  };

  const toggleReaction = async (commentId, emoji) => {
    try {
      const res = await fetch(`${API_URL}/api/updates/comments/${commentId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) { const u = await res.json(); setComments((prev) => prev.map((c) => (c._id === u._id ? u : c))); }
    } catch (err) { console.error(err); }
  };

  const startEditing = (c) => { setEditingCommentId(c._id); setEditContent(c.content); };
  const cancelEditing = () => { setEditingCommentId(null); setEditContent(''); };
  const submitEdit = async (commentId) => {
    if (!editContent.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/updates/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: editContent }),
      });
      if (res.ok) { const u = await res.json(); setComments((prev) => prev.map((c) => (c._id === u._id ? u : c))); cancelEditing(); }
    } catch (err) { console.error(err); }
  };

  const deleteComment = async (commentId) => {
    try {
      const res = await fetch(`${API_URL}/api/updates/comments/${commentId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { const u = await res.json(); setComments((prev) => prev.map((c) => (c._id === u._id ? u : c))); }
    } catch (err) { console.error(err); } finally { setDeleteConfirmId(null); }
  };

  const displayName = (username) => {
    if (!username) return 'Unknown';
    const atIdx = username.indexOf('@');
    return atIdx > 0 ? username.slice(0, atIdx) : username;
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  /* ── Build a flat ordered list of comments with depth info ── */
  const flatComments = useMemo(() => {
    const flatten = (parentId, depth) => {
      const children = comments.filter((ch) => ch.parentId === parentId);
      let res = [];
      children.forEach((ch) => {
        res.push({ ...ch, depth });
        res = res.concat(flatten(ch._id, depth + 1));
      });
      return res;
    };
    const roots = comments.filter((c) => !c.parentId || !comments.some((p) => p._id === c.parentId));
    let result = [];
    roots.forEach((r) => {
      result.push({ ...r, depth: 0 });
      result = result.concat(flatten(r._id, 1));
    });
    return result;
  }, [comments]);

  /* ── Render a single message row ── */
  const renderMessage = (c, depth, isLastInGroup) => {
    if (!c || !c._id) return null;
    const msgRef = { current: null };
    const isEditing = editingCommentId === c._id;
    const isHovered = hoveredCommentId === c._id;
    const safeAuthor = c.author || { _id: null, username: 'Unknown', avatarColor: '#888' };
    const name = displayName(safeAuthor.username);
    const isOwn = safeAuthor._id && safeAuthor._id === user?.id;
    const isReply = depth > 0;

    const parentComment = c.parentId ? comments.find((p) => p._id === c.parentId) : null;
    const parentName = parentComment?.author ? displayName(parentComment.author.username) : null;

    const reactionGroups = (c.reactions || []).reduce((acc, r) => {
      if (r?.emoji) { acc[r.emoji] = acc[r.emoji] || []; acc[r.emoji].push(r.user); }
      return acc;
    }, {});
    const hasReactions = Object.keys(reactionGroups).length > 0;

    const timeStr = formatTime(c.createdAt);

    return (
      <div
        key={c._id}
        ref={(el) => { msgRef.current = el; }}
        className={`relative group ${isReply ? '' : 'mt-1'}`}
        style={{ paddingLeft: isReply ? `${depth * 48}px` : '0' }}
        onMouseEnter={() => setHoveredCommentId(c._id)}
        onMouseLeave={() => setHoveredCommentId(null)}
      >
        {/* Left accent border for replies */}
        {isReply && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${(depth - 1) * 48 + 20}px`,
              width: '2px',
              background: isHovered
                ? 'linear-gradient(to bottom, #0099ff55, #0099ff22)'
                : 'linear-gradient(to bottom, #ffffff15, #ffffff08)',
              borderRadius: '2px',
              bottom: isLastInGroup ? '50%' : '0',
            }}
          />
        )}

        {/* Message row */}
        <div className={`flex gap-3 px-4 py-2 rounded-xl transition-colors duration-100 ${isHovered ? 'bg-white/[0.03]' : ''}`}>
          {/* Avatar */}
          <div className="shrink-0 mt-0.5">
            <UserAvatar user={safeAuthor} size={isReply ? 'xs' : 'sm'} noTooltip />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
              <span className={`font-semibold text-ink leading-tight tracking-[-0.01em] ${isReply ? 'text-[12.5px]' : 'text-[13px]'}`}>
                {name}
              </span>
              {isReply && parentName && (
                <span className="text-[11px] text-ink-dim flex items-center gap-1">
                  <CornerDownRight className="h-2.5 w-2.5" />
                  <span className="text-accent/80">@{parentName}</span>
                </span>
              )}
              {c.editedAt && !c.isDeleted && (
                <span className="text-[9px] text-ink-dim/50 italic">edited</span>
              )}
              <span className="text-[10px] text-ink-dim/50 ml-auto shrink-0 tracking-tight">{timeStr}</span>
            </div>

            {/* Body */}
            <MessageContent
              content={c.content}
              allUsers={allUsers}
              isDeleted={c.isDeleted}
              isEditing={isEditing}
              editContent={editContent}
              setEditContent={setEditContent}
              onSaveEdit={() => submitEdit(c._id)}
              onCancelEdit={cancelEditing}
            />

            {/* Reactions */}
            {hasReactions && !c.isDeleted && (
              <div className="flex flex-wrap gap-1 mt-2">
                {Object.entries(reactionGroups).map(([emoji, users]) => {
                  const mine = users.some((u) => u?._id === user?.id);
                  return (
                    <button
                      key={emoji}
                      onClick={() => toggleReaction(c._id, emoji)}
                      title={users.map((u) => displayName(u?.username)).filter(Boolean).join(', ')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] border transition-all hover:scale-105 ${
                        mine
                          ? 'bg-accent/15 border-accent/40 text-accent'
                          : 'bg-white/5 border-white/10 text-ink-muted hover:bg-white/10'
                      }`}
                    >
                      <span>{emoji}</span>
                      <span className="text-[11px] font-medium">{users.length}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Read receipts */}
            {!c.isDeleted && !isEditing && (
              <div className="flex items-center gap-2 mt-1 min-h-[16px]">
                <div className="ml-auto">
                  <ReadReceiptBadge readBy={c.readBy || []} authorId={safeAuthor._id} />
                </div>
              </div>
            )}
          </div>

          {/* Single unified hover action bar (emoji + reply + edit + delete) */}
          {isHovered && !c.isDeleted && !isEditing && (
            <HoverActions
              msgRef={msgRef}
              commentId={c._id}
              isOwn={isOwn}
              existingReactions={c.reactions || []}
              userId={user?.id}
              onReact={toggleReaction}
              onReply={() => setReplyTo({ id: c._id, username: safeAuthor.username })}
              onEdit={() => startEditing(c)}
              onDelete={() => setDeleteConfirmId(c._id)}
            />
          )}
        </div>
      </div>
    );
  };

  /* ── Group top-level messages with their replies ── */
  const renderThread = () => {
    const rendered = [];
    let i = 0;
    while (i < flatComments.length) {
      const root = flatComments[i];
      if (root.depth !== 0) { i++; continue; }

      // Gather all replies of this root
      const replies = [];
      let j = i + 1;
      while (j < flatComments.length && flatComments[j].depth > 0) {
        replies.push(flatComments[j]);
        j++;
      }

      const hasReplies = replies.length > 0;

      rendered.push(
        <motion.div
          key={root._id}
          className="mb-4"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: root._isOptimistic ? 0.7 : 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          style={root._isOptimistic ? { filter: 'saturate(0.6)' } : undefined}
        >
          {/* Root message */}
          {renderMessage(root, 0, false)}

          {/* Replies indented in a contained thread block */}
          {hasReplies && (
            <div className="mt-1 ml-10 border-l-2 border-white/[0.07] pl-3 flex flex-col gap-0.5">
              {replies.map((r, idx) => (
                <div key={r._id}>
                  {renderMessage(r, r.depth, idx === replies.length - 1)}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      );

      i = j;
    }
    return rendered;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-[#141414] border border-white/10 p-8 rounded-2xl flex flex-col items-center gap-3">
          <div className="loader-ring" />
          <span className="text-[12px] text-ink-dim tracking-[0.16em] uppercase">Loading</span>
        </div>
      </div>
    );
  }
  if (!detail) return null;

  /* Acks list modal */
  if (isAcks) {
    const ackList = Array.isArray(detail.acknowledgedBy) ? detail.acknowledgedBy : [];
    return (
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      >
        <div className="bg-[#141414] border border-white/10 w-full max-w-md flex flex-col max-h-[75vh] animate-scale-in rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">Acknowledged</p>
              <h2 className="text-xl font-semibold mt-0.5">{ackList.length} reader{ackList.length === 1 ? '' : 's'}</h2>
            </div>
            <button onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1.5">
            {ackList.length === 0 ? (
              <div className="text-center text-[13px] text-ink-dim italic py-10">No one has acknowledged yet.</div>
            ) : (
              ackList.map((u) => (
                <div key={u._id || String(Math.random())} className="flex items-center gap-3 bg-white/[0.04] rounded-xl p-3 hover:bg-white/[0.07] transition-colors">
                  <UserAvatar user={u} size="sm" noTooltip />
                  <span className="text-[13px] tracking-tight">@{u.username || 'Unknown'}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  const topLevelCount = flatComments.filter((c) => c.depth === 0).length;
  const replyCount = comments.length - topLevelCount;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in"
    >
      <div className="bg-[#111111] w-full max-w-[700px] flex flex-col h-[92vh] md:h-[88vh] animate-scale-in md:rounded-2xl border-t md:border border-white/[0.08] overflow-hidden shadow-2xl">

        {/* Header */}
        <header className="flex items-center gap-4 px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-dim/60 mb-0.5">
              {isUpdate ? 'Update' : 'Task'} Thread
            </p>
            <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-ink truncate">
              {isUpdate ? (detail.title || 'Discussion') : detail.title}
            </h2>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] text-ink-dim/60">
              <span className="font-medium text-ink-dim">{topLevelCount}</span>
              <span>messages</span>
              {replyCount > 0 && (
                <>
                  <span className="text-ink-dim/30">·</span>
                  <span className="font-medium text-ink-dim">{replyCount}</span>
                  <span>replies</span>
                </>
              )}
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-dim hover:text-ink hover:bg-white/[0.06] transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-4 px-1">
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-16 h-16 rounded-3xl bg-surface-1 border border-hairline flex items-center justify-center relative overflow-hidden transition-all duration-500">
                <MessageSquareDashed className="h-7 w-7 text-ink-muted relative z-10" />
              </div>
              <p className="text-[13px] text-ink-dim/60 tracking-tight">No discussion yet. Start the conversation.</p>
            </div>
          ) : (
            renderThread()
          )}
          <div ref={commentsEndRef} />
        </div>

        <ThreadComposer
          replyTo={replyTo}
          setReplyTo={setReplyTo}
          typingUsers={typingUsers}
          allUsers={allUsers}
          onSubmit={submitComment}
          onTyping={handleUserTyping}
        />
      </div>
    </div>
  );
};

export default ThreadDrawer;
