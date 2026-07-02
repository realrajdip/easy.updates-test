import React from 'react';
import { useAuth } from '../context/AuthContext';

const PendingApproval = () => {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 text-ink relative">
      {/* Background ambient light */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <h1 className="display-md mb-3 tracking-tight">
            easy<span className="text-accent">·</span>updates
          </h1>
          <p className="text-ink-muted text-sm tracking-tight font-medium">
            Account under review
          </p>
        </div>

        <div className="card border border-hairline p-8 flex flex-col items-center text-center space-y-6 shadow-2xl shadow-black/50">
          <div className="w-16 h-16 rounded-full bg-surface-2 border border-hairline flex items-center justify-center mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
              <line x1="16" x2="16" y1="2" y2="6"/>
              <line x1="8" x2="8" y1="2" y2="6"/>
              <line x1="3" x2="21" y1="10" y2="10"/>
              <path d="m9 16 2 2 4-4"/>
            </svg>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-lg font-semibold tracking-tight text-ink">Access Pending</h2>
            <p className="text-sm text-ink-muted leading-relaxed">
              Your account has been created successfully, but it requires administrator approval before you can access the platform.
            </p>
          </div>
          
          <div className="w-full h-[1px] bg-hairline my-2" />
          
          <p className="text-xs text-ink-dim uppercase tracking-widest font-semibold">
            Please check back later
          </p>
        </div>

        <div className="mt-8 text-center">
          <button 
            onClick={logout}
            className="text-sm text-ink-muted hover:text-ink transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default PendingApproval;
