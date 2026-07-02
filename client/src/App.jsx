import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ToastProvider } from './context/ToastContext';
import Login from './pages/Login';
import Setup2FA from './pages/Setup2FA';
import Dashboard from './pages/Dashboard';
import PendingApproval from './pages/PendingApproval';
import GlobalLoader from './components/GlobalLoader';

const BootLoader = () => (
  <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-6 text-ink">
    <div className="display-md tracking-tight">easy<span className="text-accent">·</span>updates</div>
    <div className="loader-ring" />
  </div>
);

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
       return (
         <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 text-ink">
           <div className="w-full max-w-md text-center">
             <h1 className="text-2xl font-bold text-red-500 mb-2">Access Denied</h1>
             <p className="text-ink-muted mb-8">Your account request has been rejected by an administrator.</p>
             <button onClick={() => window.location.reload()} className="btn">Back to Login</button>
           </div>
         </div>
       );
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
