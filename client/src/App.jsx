import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ToastProvider } from './context/ToastContext';
import Login from './pages/Login';
import Setup2FA from './pages/Setup2FA';
import Dashboard from './pages/Dashboard';
import PendingApproval from './pages/PendingApproval';
import GlobalLoader from './components/GlobalLoader';

import { API_URL } from './config';

const BootLoader = () => (
  <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-6 text-ink">
    <div className="display-md tracking-tight">easy<span className="text-accent">·</span>updates</div>
    <div className="loader-ring" />
  </div>
);

const AccessRevoked = () => {
  const { token, logout, updateUserPartial } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleRequestAccess = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/request-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to request access');
      
      updateUserPartial({ approvalStatus: 'pending' });
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 text-ink">
      <div className="w-full max-w-md text-center flex flex-col gap-6 surface-1 border border-hairline p-8 rounded-2xl shadow-2xl animate-fade-in">
        <div>
          <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 animate-pulse">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Access Revoked</h1>
          <p className="text-[13px] text-ink-muted mt-2 leading-relaxed">
            Your platform access has been suspended or rejected by an administrator. Please contact your administrator or request access again below.
          </p>
        </div>

        {error && (
          <div className="text-[12px] text-danger bg-danger/10 border border-danger/25 px-3 py-2 rounded-xl text-left">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={handleRequestAccess}
            disabled={loading}
            className="btn btn-primary w-full py-2.5 flex items-center justify-center gap-1.5"
          >
            {loading ? 'Submitting request...' : 'Request Access Again'}
          </button>
          <button
            onClick={logout}
            className="btn btn-ghost w-full py-2.5"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

const MainApp = () => {
  const { user, is2faPending, loading, twoFactorSetupData } = useAuth();

  if (loading) return <BootLoader />;
  if (!user) return <Login />;

  if (is2faPending) {
    if (!user.isTwoFactorEnabled && twoFactorSetupData) {
      return <Setup2FA setupData={twoFactorSetupData} />;
    }
    return <Login />;
  }
  
  if (user.approvalStatus !== 'approved' && user.isApproved !== true) {
    if (user.approvalStatus === 'rejected') {
       return <AccessRevoked />;
    }
    return <PendingApproval />;
  }

  return <Dashboard />;
};

function App() {
  return (
    <ToastProvider>
      <GlobalLoader />
      <AuthProvider>
        <SocketProvider>
          <MainApp />
        </SocketProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
