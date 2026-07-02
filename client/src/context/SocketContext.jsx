import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { API_URL, SOCKET_URL } from '../config';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { token, is2faPending, user, updateUserPartial } = useAuth();
  const toast = useToast();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // Fetch initial notifications
  const fetchNotifications = async (currentToken) => {
    try {
      const response = await fetch(`${API_URL}/api/notifications`, {
        headers: {
          'Authorization': `Bearer ${currentToken}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(data);
      }
    } catch (e) {
      console.error('Fetch notifications error:', e);
    }
  };

  const userId = user?.id || user?._id;

  useEffect(() => {
    // Only connect if fully authenticated (no 2FA pending)
    if (token && !is2faPending && userId) {
      fetchNotifications(token);

      const newSocket = io(SOCKET_URL, {
        auth: { token }
      });

      setSocket(newSocket);

      // Presence handlers
      newSocket.on('presence:list', (list) => {
        setOnlineUsers(list);
      });

      newSocket.on('presence:online', (onlineUser) => {
        setOnlineUsers(prev => {
          const exists = prev.some(u => u._id === onlineUser._id);
          if (exists) {
            return prev.map(u => u._id === onlineUser._id ? onlineUser : u);
          }
          return [...prev, onlineUser];
        });
      });

      newSocket.on('presence:offline', (offlineUser) => {
        setOnlineUsers(prev => prev.map(u => u._id === offlineUser._id ? { ...u, status: 'offline', lastSeen: offlineUser.lastSeen, currentPage: '', currentAction: '' } : u));
      });

      newSocket.on('presence:update', (updatedUser) => {
        setOnlineUsers(prev => prev.map(u => u._id === updatedUser._id ? updatedUser : u));
      });

      // Auth state live updates
      newSocket.on('auth:update', (updates) => {
        updateUserPartial(updates);
      });

      // Notification listener
      newSocket.on('notification:new', (notif) => {
        setNotifications(prev => [notif, ...prev]);
        toast.info(notif.message);
        // Simple HTML5 audio alert for mentions notifications
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-700.wav');
          audio.volume = 0.4;
          audio.play();
        } catch (e) {}
      });

      return () => {
        newSocket.close();
        setSocket(null);
      };
    } else {
      setOnlineUsers([]);
      setNotifications([]);
    }
  }, [token, is2faPending, userId]);

  const updateActivity = (page, action) => {
    if (socket) {
      socket.emit('presence:activity', { page, action });
    }
  };

  const markNotificationRead = async (id) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const markAllNotificationsRead = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/api/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <SocketContext.Provider value={{
      socket,
      onlineUsers,
      notifications,
      updateActivity,
      markNotificationRead,
      markAllNotificationsRead,
      setNotifications
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
