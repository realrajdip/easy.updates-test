import React, { createContext, useState, useEffect, useContext } from 'react';
import { useToast } from './ToastContext';
import { API_URL } from '../config';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [is2faPending, setIs2faPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [twoFactorSetupData, setTwoFactorSetupData] = useState(null);
  const toast = useToast(); // Needs import

  const updateUserPartial = (updates) => {
    setUser(prev => {
      if (!prev) return prev;
      
      // Notify if role changed
      if (updates.role && updates.role !== prev.role) {
        toast.info(`Your role has been updated to ${updates.role === 'super_user' ? 'Super User' : updates.role === 'admin' ? 'Admin' : 'User'}`);
      }
      // Notify if rejected
      if (updates.approvalStatus === 'rejected' && prev.approvalStatus !== 'rejected') {
        toast.error(`Your access has been revoked.`);
      }
      // Notify if approved
      if (updates.approvalStatus === 'approved' && prev.approvalStatus !== 'approved') {
        toast.success(`Your account has been approved!`);
      }

      return { ...prev, ...updates };
    });
  };

  // Helper to store token
  const handleAuthSuccess = (newToken, userData, pendingState = false) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
    setIs2faPending(pendingState);
  };

  const checkMe = async (currentToken) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${currentToken}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setUser(data.user);
        setIs2faPending(data.is2faPending);
        if (data.qrCode && data.secret && data.backupCodes) {
          setTwoFactorSetupData({
            qrCode: data.qrCode,
            secret: data.secret,
            backupCodes: data.backupCodes
          });
        }
      } else {
        // Token invalid, clear state
        logout();
      }
    } catch (err) {
      console.error('Fetch me error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      checkMe(token);
    } else {
      setLoading(false);
    }
  }, [token]);

  const register = async (email, username, password) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password })
      });
      const data = await response.json();
      if (response.ok) {
        // Initial token is 2faPending
        if (data.qrCode && data.secret && data.backupCodes) {
          setTwoFactorSetupData({
            qrCode: data.qrCode,
            secret: data.secret,
            backupCodes: data.backupCodes
          });
        }
        handleAuthSuccess(data.token, data.user, true);
        return { success: true, ...data };
      } else {
        return { success: false, message: data.message };
      }
    } catch (err) {
      console.error('Register API Error:', err);
      return { success: false, message: 'Network connection failed' };
    }
  };

  const login = async (username, password) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (response.ok) {
        // Login returned a token that is 2FA pending
        if (data.qrCode && data.secret && data.backupCodes) {
          setTwoFactorSetupData({
            qrCode: data.qrCode,
            secret: data.secret,
            backupCodes: data.backupCodes
          });
        }
        handleAuthSuccess(data.token, data.user, true);
        return { success: true, ...data };
      } else {
        return { success: false, message: data.message };
      }
    } catch (err) {
      console.error('Login API Error:', err);
      return { success: false, message: 'Network connection failed' };
    }
  };

  const verify2fa = async (code) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/2fa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code })
      });
      const data = await response.json();
      if (response.ok) {
        // Code verified, get the fully authenticated token
        handleAuthSuccess(data.token, data.user, false);
        return { success: true, ...data };
      } else {
        return { success: false, message: data.message };
      }
    } catch (err) {
      console.error('2FA Verify API Error:', err);
      return { success: false, message: 'Verification failed' };
    }
  };

  const backupVerify = async (backupCode) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/2fa/backup-verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ backupCode })
      });
      const data = await response.json();
      if (response.ok) {
        handleAuthSuccess(data.token, data.user, false);
        return { success: true, ...data };
      } else {
        return { success: false, message: data.message };
      }
    } catch (err) {
      console.error('Backup Verify API Error:', err);
      return { success: false, message: 'Verification failed' };
    }
  };

  const logout = async () => {
    // Optionally trigger logout API
    if (token) {
      try {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {}
    }
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setIs2faPending(false);
    setTwoFactorSetupData(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      is2faPending,
      loading,
      twoFactorSetupData,
      register,
      login,
      verify2fa,
      backupVerify,
      logout,
      checkMe,
      updateUserPartial
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
