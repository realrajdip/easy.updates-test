import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useSocket } from '../context/SocketContext';

/**
 * UserAvatar — circular initials avatar with optional online dot + portal tooltip.
 *
 * Props:
 *   user          { username, avatarColor, status, currentPage, currentAction, lastSeen }
 *   size          'xs' | 'sm' | 'md' | 'lg'   (default 'md')
 *   showDot       force the green online dot regardless of user.status
 *   noTooltip     suppress the hover tooltip
 *   ringColor     ring color override (defaults to canvas)
 */

const SIZE = {
  xs: { circle: 'w-6 h-6',   text: 'text-[9px]',  dotPx: 8  },
  sm: { circle: 'w-8 h-8',   text: 'text-[11px]', dotPx: 11 },
  md: { circle: 'w-10 h-10', text: 'text-[13px]', dotPx: 13 },
  lg: { circle: 'w-14 h-14', text: 'text-[18px]', dotPx: 16 },
};

/* ── MS-Teams-style presence formatter (shared) ── */
const getPresenceLabel = (user) => {
  if (user.status === 'online') return { label: 'Available', color: '#22c55e', online: true };
  if (!user.lastSeen) return { label: 'Offline', color: '#525252', online: false };

  const d = new Date(user.lastSeen);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  const diffH   = Math.floor(diffMin / 60);
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const yestStart  = new Date(todayStart); yestStart.setDate(yestStart.getDate() - 1);

  let label;
  if (diffMin < 1) label = 'Active just now';
  else if (diffMin < 60) label = `${diffMin}m ago`;
  else if (diffH < 24 && d >= todayStart)
    label = `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  else if (d >= yestStart)
    label = `Yesterday, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  else
    label = `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;

  return { label, color: '#525252', online: false };
};

/* ── Shared portal user card (DESIGN.md compliant) ── */
export const UserPresenceCard = ({ anchorRect, user, isOnline: isOnlineProp }) => {
  const cardRef = useRef(null);
  const MARGIN  = 10;
  const CARD_W  = 236;

  if (!anchorRect) return null;

  // ── Presence state resolution ────────────────────────────────────────────
  // Three cases:
  //   1. no presence data at all  (status undefined/null, no lastSeen)
  //   2. online
  //   3. offline with optional lastSeen
  const hasPresenceData = user.status !== undefined && user.status !== null;

  let presence;
  if (user.approvalStatus === 'rejected') {
    presence = { type: 'rejected', label: 'Unknown status' };
  } else if (user.statusOverride === 'offline') {
    presence = { type: 'offline', label: 'Offline' };
  } else if (isOnlineProp === true || user.status === 'online') {
    presence = { type: 'online', label: 'Available' };
  } else if (!hasPresenceData) {
    presence = { type: 'none' }; // no real-time data → show "Team member"
  } else {
    // offline with possible lastSeen
    presence = { type: 'offline', label: getPresenceLabel(user).label };
  }

  const isOnline   = presence.type === 'online';
  const isManualOffline = user.statusOverride === 'offline';
  const hasActivity = isOnline && (user.currentPage || user.currentAction);

  const CARD_H  = cardRef.current?.offsetHeight || 100;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const showAbove  = spaceBelow < CARD_H + MARGIN && anchorRect.top > CARD_H + MARGIN;

  let top  = showAbove ? anchorRect.top - CARD_H - MARGIN : anchorRect.bottom + MARGIN;
  let left = anchorRect.left + anchorRect.width / 2 - CARD_W / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - CARD_W - 8));

  const arrowCenterX = anchorRect.left + anchorRect.width / 2;
  const arrowLeft    = Math.max(14, Math.min(arrowCenterX - left - 6, CARD_W - 26));

  const accentColor  = user.avatarColor || '#6366f1';

  return ReactDOM.createPortal(
    <div
      ref={cardRef}
      style={{
        position:     'fixed',
        top,
        left,
        width:        CARD_W,
        zIndex:       99999,
        pointerEvents:'none',
        background:   '#1c1c1c',           /* surface-2 */
        border:       '1px solid #262626', /* hairline  */
        borderRadius: 10,                  /* rounded.md */
        boxShadow:    '0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35)',
        overflow:     'hidden',
        fontFamily:   "'Inter Variable', Inter, sans-serif",
      }}
    >
      {/* Arrow caret */}
      <div style={{
        position:  'absolute',
        [showAbove ? 'bottom' : 'top']: -6,
        left:      arrowLeft,
        width:     12,
        height:    12,
        background:'#1c1c1c',
        borderTop:    showAbove ? 'none'              : '1px solid #262626',
        borderLeft:   showAbove ? 'none'              : '1px solid #262626',
        borderBottom: showAbove ? '1px solid #262626' : 'none',
        borderRight:  showAbove ? '1px solid #262626' : 'none',
        transform: 'rotate(45deg)',
        zIndex:    1,
      }} />

      <div style={{ padding: '13px 14px 13px' }}>
        {/* Row: avatar + name + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: hasActivity ? 10 : 0 }}>
          {/* Mini avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width:          36,
              height:         36,
              borderRadius:   '50%',
              background:     accentColor,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       13,
              fontWeight:     700,
              color:          '#fff',
              letterSpacing:  '-0.02em',
              boxShadow:      '0 0 0 1.5px rgba(255,255,255,0.08)',
            }}>
              {(user.username || '??').slice(0, 2).toUpperCase()}
            </div>
            {isOnline ? (
              <div style={{
                position:     'absolute',
                bottom:        0,
                right:         0,
                width:         10,
                height:        10,
                borderRadius: '50%',
                background:   '#22c55e',
                border:       '2px solid #1c1c1c',
                boxShadow:    '0 0 6px rgba(34,197,94,0.55)',
              }} />
            ) : isManualOffline ? (
              <div style={{
                position:     'absolute',
                bottom:        0,
                right:         0,
                width:         10,
                height:        10,
                borderRadius: '50%',
                background:   '#1c1c1c',
                border:       '2px solid #525252',
              }} />
            ) : (
              <div style={{
                position:     'absolute',
                bottom:        0,
                right:         0,
                width:         10,
                height:        10,
                borderRadius: '50%',
                background:   '#eab308',
                border:       '2px solid #1c1c1c',
                boxShadow:    '0 0 6px rgba(234, 179, 8, 0.4)',
              }} />
            )}
          </div>

          {/* Name + presence */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{
              fontSize:     13,
              fontWeight:   600,
              color:        '#ffffff',      /* ink */
              letterSpacing:'-0.013em',
              marginBottom:  3,
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
              lineHeight:   1.2,
            }}>
              @{user.username}
            </p>

            {/* Presence row — only when we have real data */}
            {presence.type !== 'none' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  fontSize:     11,
                  color:        isOnline ? '#22c55e' : '#999999',
                  fontWeight:   isOnline ? 600 : 400,
                  letterSpacing:'-0.01em',
                  lineHeight:   1.2,
                }}>
                  {presence.label}
                </span>
              </div>
            )}

            {/* No presence data → "Team member" caption */}
            {presence.type === 'none' && (
              <span style={{
                fontSize:     11,
                color:        '#999999',   /* ink-muted */
                letterSpacing:'-0.01em',
                lineHeight:   1.2,
              }}>
                Team member
              </span>
            )}
          </div>
        </div>

        {/* Activity section — online users only */}
        {hasActivity && (
          <div style={{
            borderTop:  '1px solid #262626', /* hairline */
            paddingTop: 9,
          }}>
            {user.currentPage && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: user.currentAction ? 4 : 0 }}>
                <span style={{ fontSize: 10, color: '#999999', letterSpacing: '-0.01em', textTransform: 'uppercase', flexShrink: 0, fontWeight: 500 }}>In</span>
                <span style={{ fontSize: 11, color: '#999999', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.currentPage}
                </span>
              </div>
            )}
            {user.currentAction && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 10, color: '#999999', letterSpacing: '-0.01em', textTransform: 'uppercase', flexShrink: 0, fontWeight: 500 }}>Doing</span>
                <span style={{ fontSize: 11, color: '#999999', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.currentAction}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};


const UserAvatar = ({
  user,
  size = 'md',
  showDot = false,
  noTooltip = false,
  ringColor = 'var(--color-canvas)',
}) => {
  const [anchorRect, setAnchorRect] = useState(null);
  const wrapRef    = useRef(null);
  const hideTimer  = useRef(null);

  if (!user) return null;

  const socketCtx = useSocket();
  const onlineUsers = socketCtx ? socketCtx.onlineUsers : [];
  const userId = user._id || user.id;
  const resolvedUser = onlineUsers.find(u => String(u._id) === String(userId)) || user;

  const initials = (resolvedUser.username || '??').slice(0, 2).toUpperCase();
  const s        = SIZE[size] || SIZE.sm;
  const isRevoked = resolvedUser.approvalStatus === 'rejected';
  const isOnline = !isRevoked && (showDot || (resolvedUser.status === 'online' && resolvedUser.statusOverride !== 'offline'));
  const isManualOffline = !isRevoked && resolvedUser.statusOverride === 'offline';
  const bgColor  = resolvedUser.avatarColor || '#3b82f6';

  const handleMouseEnter = useCallback(() => {
    if (noTooltip) return;
    clearTimeout(hideTimer.current);
    if (wrapRef.current) setAnchorRect(wrapRef.current.getBoundingClientRect());
  }, [noTooltip]);

  const handleMouseLeave = useCallback(() => {
    hideTimer.current = setTimeout(() => setAnchorRect(null), 80);
  }, []);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  useEffect(() => {
    if (!anchorRect) return;
    const sync = () => {
      if (wrapRef.current) setAnchorRect(wrapRef.current.getBoundingClientRect());
    };
    window.addEventListener('scroll', sync, true);
    return () => window.removeEventListener('scroll', sync, true);
  }, [!!anchorRect]);

  return (
    <div
      ref={wrapRef}
      className={`relative inline-flex items-center justify-center shrink-0 select-none cursor-pointer ${isRevoked ? 'opacity-65' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        style={{ backgroundColor: bgColor, boxShadow: `0 0 0 2px ${ringColor}` }}
        className={`${s.circle} ${s.text} rounded-full flex items-center justify-center font-semibold text-white tracking-tight transition-transform`}
      >
        {initials}
      </div>

      {isRevoked ? (
        <span
          aria-label="revoked"
          style={{
            width:           s.dotPx,
            height:          s.dotPx,
            backgroundColor: '#1a1a1a',
            border:          `2px solid #525252`,
            zIndex:          2,
          }}
          className="absolute bottom-0 right-0 rounded-full"
        />
      ) : isOnline ? (
        <span
          aria-label="online"
          style={{
            width:           s.dotPx,
            height:          s.dotPx,
            backgroundColor: '#22c55e',
            boxShadow:       `0 0 0 2px ${ringColor}, 0 0 6px rgba(34, 197, 94, 0.55)`,
            zIndex:          2,
          }}
          className="absolute bottom-0 right-0 rounded-full"
        />
      ) : isManualOffline ? (
        <span
          aria-label="manual-offline"
          style={{
            width:           s.dotPx,
            height:          s.dotPx,
            backgroundColor: ringColor,
            border:          `2.2px solid #525252`,
            zIndex:          2,
          }}
          className="absolute bottom-0 right-0 rounded-full"
        />
      ) : (
        <span
          aria-label="offline"
          style={{
            width:           s.dotPx,
            height:          s.dotPx,
            backgroundColor: '#eab308',
            boxShadow:       `0 0 0 2px ${ringColor}, 0 0 6px rgba(234, 179, 8, 0.4)`,
            zIndex:          2,
          }}
          className="absolute bottom-0 right-0 rounded-full"
        />
      )}

      {anchorRect && (
        <UserPresenceCard anchorRect={anchorRect} user={resolvedUser} isOnline={isOnline} />
      )}
    </div>
  );
};

export default UserAvatar;
