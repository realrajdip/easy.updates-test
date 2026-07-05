import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Shield, UserCheck, UserX, User, ShieldAlert, ChevronDown } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { API_URL } from '../config';
import ConfirmModal from './ConfirmModal';
import { useStaleData } from '../hooks/useStaleData';

const AdminPanel = () => {
  const { user, token } = useAuth();
  const showToast = useToast();
  const [roleChangeConfig, setRoleChangeConfig] = useState(null);
  const [revokeConfirmUser, setRevokeConfirmUser] = useState(null);
  const [regrantConfirmUser, setRegrantConfirmUser] = useState(null);

  const fetcher = useMemo(() => async () => {
    const res = await fetch(`${API_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
  }, [token]);

  const {
    data: users,
    loading,
    refresh: fetchUsers,
    setDataAndCache: setUsers,
  } = useStaleData('admin-users', fetcher);

  const safeUsers = users || [];

  const handleApprove = async (id) => {
    // Optimistic Update
    setUsers(prev => (prev || []).map(u =>
      u._id === id ? { ...u, approvalStatus: 'approved', actedBy: user.username, actionDate: new Date().toISOString() } : u
    ));

    try {
      const res = await fetch(`${API_URL}/api/admin/users/${id}/approve`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to approve user');
      showToast('User approved successfully', 'success');
      fetchUsers(); // Silent background sync
    } catch (error) {
      showToast(error.message, 'error');
      fetchUsers(); // Revert on failure
    }
  };

  const handleReject = async (id) => {
    // Optimistic Update
    setUsers(prev => (prev || []).map(u =>
      u._id === id ? { ...u, approvalStatus: 'rejected', actedBy: user.username, actionDate: new Date().toISOString() } : u
    ));

    try {
      const res = await fetch(`${API_URL}/api/admin/users/${id}/reject`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to reject user');
      showToast('User rejected', 'success');
      fetchUsers(); // Silent background sync
    } catch (error) {
      showToast(error.message, 'error');
      fetchUsers(); // Revert on failure
    }
  };

  const handleRoleChange = async (id, newRole) => {
    // Optimistic Update
    setUsers(prev => (prev || []).map(u =>
      u._id === id ? { ...u, role: newRole } : u
    ));

    try {
      const res = await fetch(`${API_URL}/api/admin/users/${id}/role`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ role: newRole })
      });
      if (!res.ok) throw new Error('Failed to update role');
      showToast('Role updated successfully', 'success');
      fetchUsers(); // Silent background sync
    } catch (error) {
      showToast(error.message, 'error');
      fetchUsers(); // Revert on failure
    }
  };

  const RoleDropdown = ({ currentRole, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = React.useRef();

    React.useEffect(() => {
      const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
      <div className="relative inline-block text-left" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-1 hover:bg-surface-2 border border-hairline hover:border-hairline-soft text-[11px] font-medium text-ink rounded-pill transition-all"
        >
          {currentRole === 'admin' ? 'Admin' : 'User'}
          <ChevronDown className={`h-3.5 w-3.5 text-ink-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-32 rounded-xl bg-surface-2 border border-hairline shadow-2xl z-50 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-100">
            <button
              className="w-full text-left px-3 py-2 text-[12px] hover:bg-white/5 transition-colors text-ink"
              onClick={() => { onSelect('user'); setIsOpen(false); }}
            >
              User
            </button>
            <button
              className="w-full text-left px-3 py-2 text-[12px] hover:bg-white/5 transition-colors text-ink"
              onClick={() => { onSelect('admin'); setIsOpen(false); }}
            >
              Admin
            </button>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="p-8 text-center text-ink-muted">Loading users...</div>;
  }

  const pendingUsers = safeUsers.filter(u => u.approvalStatus === 'pending' && !u.isApproved);
  const activeUsers = safeUsers.filter(u => u.approvalStatus === 'approved' || u.isApproved === true);
  const historyUsers = safeUsers.filter(u => u.approvalStatus === 'approved' || u.approvalStatus === 'rejected');

  return (
    <div className="flex flex-col h-full bg-canvas overflow-y-auto">
      <div className="p-4 sm:p-8 max-w-5xl mx-auto w-full space-y-10">
        
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
            <Shield className="h-6 w-6 text-accent" />
            Administration
          </h1>
          <p className="text-ink-muted mt-1 text-sm">
            Manage platform access and user permissions.
          </p>
        </div>

        {/* Pending Approvals Section */}
        {pendingUsers.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold tracking-widest uppercase text-ink-dim mb-4 border-b border-hairline pb-2">
              Pending Approvals ({pendingUsers.length})
            </h2>
            <div className="grid gap-3">
              {pendingUsers.map(pendingUser => (
                <div key={pendingUser._id} className="card p-4 flex items-center justify-between border-hairline-soft bg-surface-1">
                  <div className="flex items-center gap-3">
                    <UserAvatar user={pendingUser} size="md" noTooltip />
                    <div>
                      <p className="text-sm font-medium text-ink">@{pendingUser.username}</p>
                      <p className="text-[12px] text-ink-muted">Registered {new Date(pendingUser.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleReject(pendingUser._id)}
                      className="px-3 py-1.5 rounded-pill bg-surface-2 text-ink hover:text-ink transition-colors border border-transparent hover:border-hairline flex items-center text-[12px] font-medium"
                    >
                      <UserX className="h-3.5 w-3.5 mr-1" /> Reject
                    </button>
                    <button 
                      onClick={() => handleApprove(pendingUser._id)}
                      className="btn btn-primary px-3 py-1.5 flex items-center text-[12px]"
                    >
                      <UserCheck className="h-3.5 w-3.5 mr-1" /> Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active Users Section */}
        <section>
          <h2 className="text-sm font-semibold tracking-widest uppercase text-ink-dim mb-4 border-b border-hairline pb-2">
            Active Directory ({activeUsers.length})
          </h2>
          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[500px]">
              <thead className="bg-surface-1 border-b border-hairline">
                <tr>
                  <th className="px-4 py-3 font-medium text-ink-muted">User</th>
                  <th className="px-4 py-3 font-medium text-ink-muted">Role</th>
                  <th className="px-4 py-3 font-medium text-ink-muted text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {activeUsers.map(activeUser => (
                  <tr key={activeUser._id} className="hover:bg-surface-1/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar user={activeUser} size="sm" noTooltip />
                        <span className="font-medium text-ink">@{activeUser.username}</span>
                        {activeUser._id === user.id && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-pill bg-surface-2 text-ink-muted">You</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {activeUser.role === 'super_user' ? (
                        <span className="flex items-center gap-1.5 text-accent text-[12px] font-medium">
                          <ShieldAlert className="h-3.5 w-3.5" /> Super User
                        </span>
                      ) : activeUser.role === 'admin' ? (
                        <span className="flex items-center gap-1.5 text-ink text-[12px] font-medium">
                          <Shield className="h-3.5 w-3.5" /> Admin
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-ink-muted text-[12px]">
                          <User className="h-3.5 w-3.5" /> User
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {user.role === 'super_user' && activeUser.role !== 'super_user' && (
                          <RoleDropdown 
                            currentRole={activeUser.role} 
                            onSelect={(newRole) => {
                              setRoleChangeConfig({
                                id: activeUser._id,
                                username: activeUser.username,
                                newRole: newRole
                              });
                            }} 
                          />
                        )}
                        {(user.role === 'super_user' || user.role === 'admin') && 
                         activeUser.role !== 'super_user' && 
                         activeUser._id !== user.id && (
                          <button
                            onClick={() => setRevokeConfirmUser(activeUser)}
                            className="px-2.5 py-1 rounded-pill bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 hover:border-danger/30 flex items-center text-[11px] font-medium transition-all"
                            title="Revoke access"
                          >
                            <UserX className="h-3 w-3 mr-1" /> Revoke
                          </button>
                        )}
                        {activeUser.role === 'super_user' && (
                          <span className="text-xs text-ink-dim">-</span>
                        )}
                        {user.role !== 'super_user' && user.role !== 'admin' && (
                          <span className="text-xs text-ink-dim">-</span>
                        )}
                        {activeUser._id === user.id && user.role !== 'super_user' && (
                          <span className="text-xs text-ink-dim">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Approval History Section */}
        {historyUsers.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold tracking-widest uppercase text-ink-dim mb-4 border-b border-hairline pb-2">
              Approval History
            </h2>
            <div className="card overflow-hidden overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[600px]">
                <thead className="bg-surface-1 border-b border-hairline">
                  <tr>
                    <th className="px-4 py-3 font-medium text-ink-muted">User</th>
                    <th className="px-4 py-3 font-medium text-ink-muted">Status</th>
                    <th className="px-4 py-3 font-medium text-ink-muted">Action By</th>
                    <th className="px-4 py-3 font-medium text-ink-muted">Date</th>
                    <th className="px-4 py-3 font-medium text-ink-muted text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {historyUsers.map(historyUser => (
                    <tr key={`hist-${historyUser._id}`} className="hover:bg-surface-1/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar user={historyUser} size="sm" noTooltip />
                          <span className="font-medium text-ink">@{historyUser.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {historyUser.approvalStatus === 'approved' || historyUser.isApproved === true ? (
                           <span className="text-[11px] font-medium text-ink bg-surface-2 border border-hairline px-2 py-1 rounded-pill">Approved</span>
                        ) : (
                           <span className="text-[11px] font-medium text-ink-muted bg-surface-1 border border-hairline px-2 py-1 rounded-pill">Rejected</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-muted text-xs">
                         {historyUser.actedBy ? `@${historyUser.actedBy}` : 'System'}
                      </td>
                      <td className="px-4 py-3 text-ink-dim text-xs">
                         {historyUser.actionDate ? new Date(historyUser.actionDate).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {historyUser.approvalStatus === 'rejected' && 
                         (user.role === 'super_user' || user.role === 'admin') && (
                          <button
                            onClick={() => setRegrantConfirmUser(historyUser)}
                            className="px-2.5 py-1 rounded-pill bg-success/15 hover:bg-success/25 text-success border border-success/20 hover:border-success/30 flex items-center text-[11px] font-medium transition-all ml-auto"
                          >
                            <UserCheck className="h-3 w-3 mr-1" /> Re-grant Access
                          </button>
                        )}
                        {(historyUser.approvalStatus === 'approved' || historyUser.isApproved === true) && (
                          <span className="text-xs text-ink-dim">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>

      {/* Role Change Confirmation Modal */}
      <ConfirmModal
        open={!!roleChangeConfig}
        title="Confirm Role Change"
        message={roleChangeConfig ? `Are you sure you want to change @${roleChangeConfig.username}'s role to ${roleChangeConfig.newRole === 'admin' ? 'Admin' : 'User'}?` : ''}
        confirmText="Change Role"
        cancelText="Cancel"
        onConfirm={() => {
          handleRoleChange(roleChangeConfig.id, roleChangeConfig.newRole);
          setRoleChangeConfig(null);
        }}
        onCancel={() => setRoleChangeConfig(null)}
        isDanger={false}
      />

      {/* Revoke Access Confirmation Modal */}
      <ConfirmModal
        open={!!revokeConfirmUser}
        title="Revoke Access?"
        message={revokeConfirmUser ? `Are you sure you want to revoke @${revokeConfirmUser.username}'s access? They will be immediately disconnected and locked out.` : ''}
        confirmText="Revoke Access"
        cancelText="Cancel"
        onConfirm={() => {
          handleReject(revokeConfirmUser._id);
          setRevokeConfirmUser(null);
        }}
        onCancel={() => setRevokeConfirmUser(null)}
        isDanger={true}
      />

      {/* Re-grant Access Confirmation Modal */}
      <ConfirmModal
        open={!!regrantConfirmUser}
        title="Re-grant Access?"
        message={
          regrantConfirmUser 
            ? `This account was rejected/revoked by @${regrantConfirmUser.actedBy || 'System'} on ${
                regrantConfirmUser.actionDate 
                  ? new Date(regrantConfirmUser.actionDate).toLocaleString() 
                  : 'N/A'
              }. Are you sure you want to re-approve access for @${regrantConfirmUser.username}?` 
            : ''
        }
        confirmText="Approve User"
        cancelText="Cancel"
        onConfirm={() => {
          handleApprove(regrantConfirmUser._id);
          setRegrantConfirmUser(null);
        }}
        onCancel={() => setRegrantConfirmUser(null)}
        isDanger={false}
      />
    </div>
  );
};

export default AdminPanel;
