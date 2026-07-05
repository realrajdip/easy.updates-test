import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import { ArrowRight, RefreshCw, Key, CheckCircle2 } from 'lucide-react';
import OTPInput from '../components/OTPInput';

const TABS = [
  { key: 'login', label: 'Sign in' },
  { key: 'register', label: 'Create account' },
  { key: 'reset', label: 'Reset password' },
];

const Login = () => {
  const { user, is2faPending, login, register, verify2fa, backupVerify } = useAuth();

  const [tab, setTab] = useState('login');
  const [step, setStep] = useState(
    user && is2faPending && user.isTwoFactorEnabled ? '2fa' : 'credentials'
  );

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (tab === 'register') {
      const res = await register(email, username, password);
      if (!res.success) setError(res.message);
    } else {
      const res = await login(username, password);
      if (res.success) {
        if (res.is2faRequired) setStep('2fa');
      } else {
        setError(res.message);
      }
    }
  };

  const handle2faSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const res = await verify2fa(totpCode);
    if (!res.success) setError(res.message);
  };

  const handleBackupSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const res = await backupVerify(backupCode);
    if (!res.success) setError(res.message);
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/auth/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, code: resetCode, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Password updated. You can sign in now.');
        setTab('login');
        setResetCode('');
        setNewPassword('');
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Network connection failed');
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas text-ink">
      {/* Atmosphere — two gradient spotlights bleeding from corners */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(circle, #6a4cf5 0%, transparent 60%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-40 w-[560px] h-[560px] rounded-full opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(circle, #d44df0 0%, transparent 60%)' }}
      />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Top brand bar */}
        <header className="h-14 px-6 flex items-center justify-between">
          <div className="display-sm tracking-tight">
            easy<span className="text-accent">·</span>updates
          </div>
          <span className="text-[12px] text-ink-muted tracking-tight hidden sm:block">
            Shift handover, in real time.
          </span>
        </header>

        <main className="flex-1 flex flex-col justify-center items-center w-full px-6 pb-16">

          {/* Auth card */}
          <section className="w-full max-w-[440px] mx-auto z-10 relative">
            <div className="surface-1 rounded-xxl p-7 flex flex-col gap-6 animate-scale-in border border-hairline-soft">
              {/* Header */}
              <div className="flex flex-col gap-1">
                <p className="text-[12px] uppercase tracking-[0.18em] text-ink-dim">
                  {step === 'credentials'
                    ? 'Welcome back'
                    : step === '2fa'
                    ? 'Two-factor check'
                    : 'Recovery code'}
                </p>
                <h2 className="display-md">
                  {step === 'credentials'
                    ? tab === 'login'
                      ? 'Sign in to continue'
                      : tab === 'register'
                      ? 'Create your account'
                      : 'Reset your password'
                    : step === '2fa'
                    ? 'Enter the 6-digit code'
                    : 'Use a recovery code'}
                </h2>
              </div>

              {error && (
                <div className="banner-error animate-fade-in">
                  <p>{error}</p>
                </div>
              )}
              {message && (
                <div className="banner-success animate-fade-in">
                  <CheckCircle2 className="h-4 w-4 mt-[2px] flex-shrink-0" />
                  <p>{message}</p>
                </div>
              )}

              {/* CREDENTIALS */}
              {step === 'credentials' && (
                <>
                  <div className="flex items-center gap-1 surface-2 p-1 rounded-pill self-start">
                    {TABS.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => {
                          setTab(t.key);
                          setError('');
                          setMessage('');
                        }}
                        className={`pill-tab ${tab === t.key ? 'is-active' : ''}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {tab !== 'reset' ? (
                    <form onSubmit={handleCredentialsSubmit} className="flex flex-col gap-4">
                      {tab === 'register' && (
                        <Field label="Email">
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="input"
                            required
                            autoFocus
                          />
                        </Field>
                      )}
                      
                      <Field label={tab === 'register' ? 'Username (Optional)' : 'Username or Email'}>
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder={tab === 'register' ? 'Derived from email if empty' : 'username or email'}
                          className="input"
                          required={tab === 'login'}
                          autoFocus={tab === 'login'}
                        />
                      </Field>
                      <Field label="Password">
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="input"
                          required
                        />
                      </Field>

                      {tab === 'login' && (
                        <label className="flex items-center gap-2 text-[13px] text-ink-muted cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="w-4 h-4 rounded"
                          />
                          Keep me signed in
                        </label>
                      )}

                      <button type="submit" className="btn btn-primary w-full mt-1">
                        {tab === 'login' ? 'Sign in' : 'Create account'}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleResetSubmit} className="flex flex-col gap-4">
                      <Field label="Username">
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="username"
                          className="input"
                          required
                        />
                      </Field>
                      <Field label="2FA / Backup code">
                        <input
                          type="text"
                          value={resetCode}
                          onChange={(e) => setResetCode(e.target.value)}
                          placeholder="current 2FA code"
                          className="input text-center tracking-[0.4em] font-mono"
                          required
                        />
                      </Field>
                      <Field label="New password">
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="new password"
                          className="input"
                          required
                        />
                      </Field>
                      <button type="submit" className="btn btn-primary w-full mt-1">
                        <RefreshCw className="h-4 w-4" />
                        Update password
                      </button>
                    </form>
                  )}
                </>
              )}

              {/* 2FA */}
              {step === '2fa' && (
                <form onSubmit={handle2faSubmit} className="flex flex-col gap-4 animate-scale-in">
                  <p className="text-[14px] text-ink-muted tracking-tight">
                    Open your authenticator app and enter the current code.
                  </p>
                  <OTPInput
                    length={6}
                    value={totpCode}
                    onChange={(val) => setTotpCode(val)}
                    autoFocus
                  />
                  <button type="submit" className="btn btn-primary w-full">
                    Verify
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('backup');
                      setError('');
                    }}
                    className="btn btn-ghost w-full text-accent"
                  >
                    <Key className="h-3.5 w-3.5" />
                    Use a recovery code instead
                  </button>
                </form>
              )}

              {/* BACKUP */}
              {step === 'backup' && (
                <form onSubmit={handleBackupSubmit} className="flex flex-col gap-4 animate-scale-in">
                  <p className="text-[14px] text-ink-muted tracking-tight">
                    Each recovery code is single-use. It will be consumed on success.
                  </p>
                  <input
                    type="text"
                    value={backupCode}
                    onChange={(e) => setBackupCode(e.target.value)}
                    placeholder="XXXX-XXXX"
                    className="input text-center text-[18px] font-mono tracking-[0.3em] py-3 uppercase"
                    required
                    autoFocus
                  />
                  <button type="submit" className="btn btn-primary w-full">
                    Verify recovery code
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('2fa');
                      setError('');
                    }}
                    className="btn btn-ghost w-full"
                  >
                    Back to authenticator
                  </button>
                </form>
              )}
            </div>

            <p className="text-center text-[12px] text-ink-dim mt-4 tracking-tight">
              Protected by TOTP 2-factor authentication.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
};

const Field = ({ label, children }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[11px] uppercase tracking-[0.16em] text-ink-dim">{label}</label>
    {children}
  </div>
);

export default Login;
