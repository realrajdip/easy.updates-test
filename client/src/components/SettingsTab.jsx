import React, { useState } from 'react';
import { User, Shield, Key, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { API_URL } from '../config';
import ConfirmModal from './ConfirmModal';

const COLORS = [
  { hex: '#ed1aa0', name: 'Pink Accent' },
  { hex: '#007d48', name: 'Success Green' },
  { hex: '#1151ff', name: 'Info Blue' },
  { hex: '#0a7281', name: 'Accent Teal' },
  { hex: '#780700', name: 'Deep Sale Red' },
  { hex: '#39393b', name: 'Charcoal' },
  { hex: '#beaffd', name: 'Accent Purple' },
];

const SettingsTab = () => {
  const { user, token, updateUserPartial } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState(user?.email || '');
  const [username, setUsername] = useState(user?.username || '');
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor || COLORS[0].hex);
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [isResetting2FA, setIsResetting2FA] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!username.trim()) return toast.error('Username cannot be empty');
    
    setIsSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          username,
          avatarColor,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update profile');
      }

      toast.success('Profile updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      
      // Update local context
      updateUserPartial(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const triggerReset2FA = () => {
    setShowResetConfirm(true);
  };

  const handleReset2FA = async () => {
    setShowResetConfirm(false);
    setIsResetting2FA(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/2fa/regenerate-secrets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to reset 2FA');
      }
      
      // The backend sets the new cookie as pending and we should reload
      window.location.reload();
    } catch (err) {
      toast.error(err.message);
      setIsResetting2FA(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 animate-fade-in max-w-4xl mx-auto">
      {/* Hero section */}
      <section className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <div className="flex flex-col gap-5 py-2">
          <p className="text-[12px] uppercase tracking-[0.18em] text-ink-dim">Settings</p>
          <h1 className="display-lg">
            Identity &
            <br />
            Security.
          </h1>
          <p className="text-[15px] text-ink-muted max-w-md tracking-tight">
            Manage your personal profile, update your password, and control your two-factor authentication settings.
          </p>
        </div>

        <div className="spotlight spotlight-magenta flex flex-col justify-between min-h-[200px]">
          <div>
            <p className="text-[12px] uppercase tracking-[0.18em] opacity-80">Access</p>
            <p className="display-md mt-2 leading-tight">Control.</p>
          </div>
          <p className="text-[13px] opacity-80 tracking-tight">
            Keep your account secure.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6">
        <div className="flex flex-col gap-6">
          {/* Profile Card */}
          <form onSubmit={handleSaveProfile} className="surface-1 rounded-xl p-6 flex flex-col gap-6 border border-hairline-soft">
            <header className="flex items-center gap-2 border-b border-hairline-soft pb-4">
              <User className="h-4 w-4 text-accent" />
              <h2 className="text-[15px] tracking-tight text-ink font-medium">Personal Profile</h2>
            </header>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-[0.16em] text-ink-dim">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input max-w-md opacity-50 cursor-not-allowed"
                  placeholder="Your email address"
                  disabled
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-[0.16em] text-ink-dim">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input max-w-md"
                  placeholder="Your username"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-[0.16em] text-ink-dim">Avatar Color</label>
                <div className="flex flex-wrap gap-3 mt-1">
                  {COLORS.map((color) => (
                    <button
                      key={color.hex}
                      type="button"
                      onClick={() => setAvatarColor(color.hex)}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        avatarColor === color.hex ? 'scale-110 ring-2 ring-accent ring-offset-2 ring-offset-canvas' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: color.hex }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            <header className="flex items-center gap-2 border-b border-hairline-soft pb-4 pt-4 mt-2">
              <Key className="h-4 w-4 text-accent" />
              <h2 className="text-[15px] tracking-tight text-ink font-medium">Change Password</h2>
            </header>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-[0.16em] text-ink-dim">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input max-w-md"
                  placeholder="Required if changing password"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] uppercase tracking-[0.16em] text-ink-dim">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input max-w-md"
                  placeholder="Leave blank to keep current"
                />
              </div>
            </div>

            <div className="pt-4 mt-2 flex">
              <button 
                type="submit" 
                className="btn btn-primary ml-auto"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Security Card */}
        <div className="flex flex-col gap-6">
          <div className="surface-1 rounded-xl p-6 flex flex-col gap-4 border border-hairline-soft">
            <header className="flex items-center gap-2 border-b border-hairline-soft pb-4">
              <Shield className="h-4 w-4 text-accent" />
              <h2 className="text-[15px] tracking-tight text-ink font-medium">Security</h2>
            </header>
            
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.16em] text-ink-dim">2FA Status</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[14px] font-medium text-ink">
                  {user?.isTwoFactorEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            <div className="mt-2 text-[12px] text-ink-muted leading-relaxed">
              If you lost your backup codes or got a new device, you can reset your Two-Factor Authentication. This will immediately log you out and require you to scan a new QR code.
            </div>

            <button 
              type="button" 
              onClick={triggerReset2FA}
              className="btn btn-secondary mt-2 w-full flex justify-center"
              disabled={isResetting2FA}
            >
              {isResetting2FA ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Reset 2FA
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Reset 2FA Confirmation Modal */}
      <ConfirmModal
        open={showResetConfirm}
        title="Reset 2FA?"
        message="This will immediately log you out and require you to scan a new QR code to set up Two-Factor Authentication again. Are you sure?"
        confirmText="Reset 2FA"
        cancelText="Cancel"
        onConfirm={handleReset2FA}
        onCancel={() => setShowResetConfirm(false)}
        isDanger={true}
      />
    </div>
  );
};

export default SettingsTab;
