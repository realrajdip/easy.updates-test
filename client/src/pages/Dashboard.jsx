import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Layers, FileText, ClipboardList, GraduationCap,
  Bell, LogOut, Check, X, Shield, Settings
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { API_URL } from '../config';
import UpdatesTab from '../components/UpdatesTab';
import TasksTab from '../components/TasksTab';
import PersonalDashboard from '../components/PersonalDashboard';
import ThreadDrawer from '../components/ThreadDrawer';
import UserAvatar, { UserPresenceCard } from '../components/UserAvatar';
import AdminPanel from '../components/AdminPanel';
import SettingsTab from '../components/SettingsTab';
import CoursesTab from '../components/CoursesTab';
import Select from '../components/Select';

/* ─── Notifications panel ─────────────────────────────────────────────── */
const NotificationPanel = ({ notifications, onNotifClick, onMarkAll, onClose }) => {
  const unread = notifications.filter((n) => !n.isRead);
  return (
    <div
      className="absolute right-0 top-full mt-3 w-[340px] surface-2 z-50 rounded-xl overflow-hidden border border-hairline"
      style={{ boxShadow: '0 18px 48px rgba(0,0,0,0.55)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline-soft">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-ink-muted" />
          <span className="text-[13px] tracking-tight text-ink font-medium">Notifications</span>
          {unread.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-pill bg-accent/15 text-accent font-medium">
              {unread.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unread.length > 0 && (
            <button onClick={onMarkAll} className="text-[11px] text-accent hover:underline">
              Mark all read
            </button>
          )}
          <button onClick={onClose} className="btn-icon h-7 w-7">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="py-10 text-center text-[12px] text-ink-dim">
            All caught up.
          </div>
        ) : (
          notifications.map((notif) => (
            <button
              key={notif._id}
              onClick={() => {
                onNotifClick(notif);
                onClose();
              }}
              className={`w-full text-left flex gap-3 px-4 py-3 border-b border-hairline-soft transition-colors ${notif.isRead ? 'hover:bg-surface-3' : 'bg-accent/[0.04] hover:bg-accent/[0.08]'
                }`}
            >
              <div className="flex-1 text-[12px] leading-relaxed">
                <p className={notif.isRead ? 'text-ink-muted' : 'text-ink'}>{notif.message}</p>
                <span className="text-[10px] text-ink-dim mt-1 block">
                  {new Date(notif.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {!notif.isRead && <div className="h-1.5 w-1.5 rounded-full bg-accent mt-1.5 shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

/* ─── Single hoverable avatar wrapper ───────────────────────────────────── */
const HoverableAvatar = ({ u, zIndex, marginRight }) => {
  const [anchorRect, setAnchorRect] = useState(null);
  const wrapRef = useRef(null);
  const hideTimer = useRef(null);

  const show = useCallback(() => {
    clearTimeout(hideTimer.current);
    if (wrapRef.current) setAnchorRect(wrapRef.current.getBoundingClientRect());
  }, []);

  const hide = useCallback(() => {
    hideTimer.current = setTimeout(() => setAnchorRect(null), 80);
  }, []);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', zIndex, marginRight }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <div className="block hover:scale-110 transition-transform duration-150 cursor-pointer" style={{ zIndex: anchorRect ? 9999 : undefined }}>
        <UserAvatar user={u} size="sm" showDot noTooltip ringColor="var(--color-canvas)" />
      </div>
      {anchorRect && <UserPresenceCard anchorRect={anchorRect} user={u} isOnline={true} />}
    </div>
  );
};

/* ─── Stacked online avatars ────────────────────────────────────────────── */
const OnlineAvatars = ({ onlineUsers, currentUserId }) => {
  const live = onlineUsers.filter((u) => u.status === 'online' && String(u._id) !== String(currentUserId));

  if (live.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-dim" />
        <span className="text-[11px] text-ink-dim tracking-tight">No teammates online</span>
      </div>
    );
  }

  const visible = live.slice(0, 5);
  const overflow = live.length - 5;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center" style={{ direction: 'rtl' }}>
        {overflow > 0 && (
          <div
            className="relative z-0 -mr-2 w-8 h-8 rounded-full bg-surface-2 ring-2 ring-canvas flex items-center justify-center text-[10px] font-medium text-ink-muted"
            title={`${overflow} more online`}
          >
            +{overflow}
          </div>
        )}
        {[...visible].reverse().map((u, i) => (
          <HoverableAvatar
            key={u._id}
            u={u}
            zIndex={visible.length - i}
            marginRight={i === visible.length - 1 ? 0 : '-0.5rem'}
          />
        ))}
      </div>
      <span className="text-[11px] tracking-tight text-ink-muted hidden md:inline">
        {live.length} online
      </span>
    </div>
  );
};

/* ─── Top nav ───────────────────────────────────────────────────────────── */
const TopBar = ({ user, onlineUsers, notifications, onNotifClick, onMarkAll, onLogout }) => {
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef(null);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    const handle = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <header
      className="sticky top-0 z-40 h-14 flex items-center justify-between px-5 bg-canvas border-b border-hairline-soft"
      style={{ backgroundColor: 'var(--color-canvas)' }}
    >
      <div className="flex items-center gap-3">
        <div className="display-sm tracking-tight leading-none">
          easy<span className="text-accent">·</span>updates
        </div>
        <span className="hidden md:inline text-[11px] text-ink-dim tracking-tight border-l border-hairline-soft pl-3">
          Shift handover suite
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:block">
          <OnlineAvatars onlineUsers={onlineUsers} currentUserId={user?._id || user?.id} />
        </div>
        <div className="hidden sm:block divider-v h-6" />
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifs((v) => !v)}
            className={`btn-icon relative ${showNotifs ? 'bg-surface-1 text-ink' : ''}`}
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-accent text-canvas text-[9px] font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {showNotifs && (
            <NotificationPanel
              notifications={notifications}
              onNotifClick={onNotifClick}
              onMarkAll={onMarkAll}
              onClose={() => setShowNotifs(false)}
            />
          )}
        </div>
        <button onClick={onLogout} className="btn-icon" title="Sign out">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
};

/* ─── Sidebar ───────────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { key: 'updates', label: 'Updates', icon: Layers },
  { key: 'tasks', label: 'Tasks', icon: ClipboardList },
  { key: 'courses', label: 'Tracks', icon: GraduationCap },
  { key: 'personal', label: 'Workspace', icon: FileText },
  { key: 'admin', label: 'Admin', icon: Shield },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const Sidebar = ({ activeTab, onSelectTab, user, onStatusOverrideChange }) => (
  <aside
    className="hidden md:flex flex-col gap-6 border-r border-hairline-soft select-none
               sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto
               px-3 py-5"
  >
    {/* Profile */}
    <div className="surface-1 rounded-xl p-3 flex items-center gap-3">
      <UserAvatar user={user} size="md" noTooltip />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] tracking-tight text-ink font-medium truncate">
          @{user?.username}
        </p>
        <Select
          value={user?.statusOverride || 'none'}
          onChange={onStatusOverrideChange}
          options={[
            { value: 'none', label: 'Available' },
            { value: 'offline', label: 'Appear Offline' }
          ]}
          className="bg-transparent text-[10px] font-semibold text-ink-dim hover:text-ink transition-colors flex items-center gap-1 cursor-pointer select-none border-none p-0 focus:outline-none"
          activeClassName="text-ink"
        />
      </div>
    </div>

    {/* Nav */}
    <nav className="flex flex-col gap-1">
      <p className="px-3 pb-2 text-[10px] uppercase tracking-[0.18em] text-ink-dim">Navigate</p>
      {NAV_ITEMS.filter(item =>
        item.key !== 'admin' || (user?.role === 'admin' || user?.role === 'super_user')
      ).map(({ key, label, icon: Icon }) => {
        const active = activeTab === key;
        const displayLabel = key === 'admin' && user?.role === 'super_user' ? 'Super User' : label;
        return (
          <button
            key={key}
            onClick={() => onSelectTab(key)}
            className={`flex items-center gap-3 w-full px-4 py-2.5 text-left rounded-pill text-[13px] tracking-tight transition-all border ${active
                ? 'bg-surface-2 border-hairline text-ink font-semibold'
                : 'bg-transparent border-transparent text-ink-muted hover:bg-surface-1/50 hover:text-ink'
              }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-accent' : ''}`} />
            <span>{displayLabel}</span>
          </button>
        );
      })}
    </nav>

    <div className="mt-auto">
      <p className="text-center text-[10px] text-ink-dim tracking-[0.18em] uppercase">
        easy·updates — v1.0
      </p>
    </div>
  </aside>
);

/* ─── Mobile bottom nav ─────────────────────────────────────────────────── */
const MobileNav = ({ activeTab, onSelectTab, user }) => (
  <nav className="md:hidden fixed bottom-3 left-3 right-3 z-30 surface-2 rounded-pill border border-hairline-soft px-2 py-1.5 flex items-center justify-around backdrop-blur">
    {NAV_ITEMS.filter(item =>
      item.key !== 'admin' || (user?.role === 'admin' || user?.role === 'super_user')
    ).map(({ key, label, icon: Icon }) => {
      const active = activeTab === key;
      const displayLabel = key === 'admin' && user?.role === 'super_user' ? 'Super User' : label;
      return (
        <button
          key={key}
          onClick={() => onSelectTab(key)}
          className={`flex items-center justify-center w-10 h-10 rounded-full transition-all ${
            active ? 'bg-accent/15 text-accent font-semibold scale-110' : 'text-ink-muted hover:text-ink'
          }`}
          title={displayLabel}
          aria-label={displayLabel}
        >
          <Icon className="h-5 w-5" />
        </button>
      );
    })}
  </nav>
);

/* ─── Dashboard ────────────────────────────────────────────────────────── */
const Dashboard = () => {
  const { token, user, logout, updateUserPartial } = useAuth();
  const {
    onlineUsers,
    notifications,
    updateActivity,
    markNotificationRead,
    markAllNotificationsRead,
  } = useSocket();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('updates');
  const [threadDetails, setThreadDetails] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [highlightedUpdateId, setHighlightedUpdateId] = useState(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState(null);

  const fetchAllUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setAllUsers(await res.json());
    } catch (e) {
      console.error(e);
      toast.error('Could not load team members.');
    }
  };

  useEffect(() => {
    if (token) fetchAllUsers();
  }, [token]); // eslint-disable-line

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribeToPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('Push notifications not supported by this browser.');
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('Notification permission denied.');
        return;
      }

      const keyRes = await fetch(`${API_URL}/api/auth/vapid-public-key`);
      if (!keyRes.ok) throw new Error('VAPID public key load failed');
      const { publicKey } = await keyRes.json();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      await fetch(`${API_URL}/api/users/push-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ subscription })
      });
      console.log('Web Push subscription successfully registered with server.');
    } catch (err) {
      console.error('Error establishing web push subscription:', err);
    }
  };

  useEffect(() => {
    if (token) {
      subscribeToPush();
    }
  }, [token]); // eslint-disable-line

  useEffect(() => {
    const map = {
      updates: {
        page: 'Updates',
        action: threadDetails ? `Reading thread ${threadDetails.id?.slice(-4)}` : 'Browsing updates feed',
      },
      tasks: {
        page: 'Tasks',
        action: threadDetails ? `Reviewing task ${threadDetails.id?.slice(-4)}` : 'Managing team tasks',
      },
      courses: { page: 'Tracks', action: 'Browsing learning tracks' },
      personal: { page: 'Workspace', action: 'Viewing personal handovers' },
    };
    const { page, action } = map[activeTab] || { page: 'Dashboard', action: 'Viewing' };
    updateActivity(page, action);
  }, [activeTab, threadDetails]); // eslint-disable-line

  const handleSelectTab = (tab) => {
    setActiveTab(tab);
    setThreadDetails(null);
    setHighlightedUpdateId(null);
    setHighlightedTaskId(null);
  };
  const handleOpenThread = (data) => setThreadDetails(data);

  const handleNotifClick = (notif) => {
    markNotificationRead(notif._id);
    const msg = (notif.message || '').toLowerCase();
    const isDiscussion = msg.includes('thread') || msg.includes('comment') || msg.includes('replied');

    if (notif.updateId) {
      setHighlightedUpdateId(notif.updateId);
      setActiveTab('updates');
      if (isDiscussion) {
        setThreadDetails({ type: 'discussion_update', id: notif.updateId });
      } else {
        setThreadDetails(null);
      }
    } else if (notif.taskId) {
      setHighlightedTaskId(notif.taskId);
      setActiveTab('tasks');
      if (isDiscussion) {
        setThreadDetails({ type: 'discussion_task', id: notif.taskId });
      } else {
        setThreadDetails(null);
      }
    } else if (notif.courseId) {
      handleSelectTab('courses');
    }
  };

  const handleStatusOverrideChange = async (val) => {
    try {
      const res = await fetch(`${API_URL}/api/users/status-override`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ statusOverride: val })
      });
      if (!res.ok) throw new Error('Failed to update status');
      const updatedUser = await res.json();
      updateUserPartial(updatedUser);
      toast.success(val === 'offline' ? 'Status set to Appear Offline' : 'Status set to Available');
    } catch (err) {
      console.error(err);
      toast.error('Could not update status.');
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col text-ink">
      <TopBar
        user={user}
        onlineUsers={onlineUsers}
        notifications={notifications}
        onNotifClick={handleNotifClick}
        onMarkAll={markAllNotificationsRead}
        onLogout={logout}
      />

      <div className="flex-1 max-w-[1280px] w-full mx-auto grid grid-cols-1 md:grid-cols-[230px_1fr]">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          user={user}
          onStatusOverrideChange={handleStatusOverrideChange}
        />

        <main className="flex-1 px-5 md:px-8 py-8 pb-24 md:pb-8 min-w-0">
          {activeTab === 'updates' && (
            <UpdatesTab
              onOpenThread={handleOpenThread}
              allUsers={allUsers}
              highlightedUpdateId={highlightedUpdateId}
              clearHighlight={() => setHighlightedUpdateId(null)}
            />
          )}
          {activeTab === 'tasks' && (
            <TasksTab
              onOpenThread={handleOpenThread}
              allUsers={allUsers}
              highlightedTaskId={highlightedTaskId}
              clearHighlight={() => setHighlightedTaskId(null)}
            />
          )}
          {activeTab === 'courses' && <CoursesTab allUsers={allUsers} />}
          {activeTab === 'personal' && <PersonalDashboard onOpenThread={handleOpenThread} allUsers={allUsers} />}
          {activeTab === 'admin' && (user.role === 'admin' || user.role === 'super_user') && <AdminPanel />}
          {activeTab === 'settings' && <SettingsTab />}
        </main>
      </div>

      <MobileNav activeTab={activeTab} onSelectTab={handleSelectTab} user={user} />

      {threadDetails && (
        <ThreadDrawer
          type={threadDetails.type}
          id={threadDetails.id}
          onClose={() => setThreadDetails(null)}
          allUsers={allUsers}
        />
      )}
    </div>
  );
};

export default Dashboard;
