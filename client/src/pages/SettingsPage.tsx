import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import BrandMark from '../components/BrandMark';
import { api, ApiError } from '../services/api';

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

function persistBrandProfile(profile: { businessName: string; logoDataUrl?: string | null; phone: string; email: string; address?: string | null; currency: string }) {
  localStorage.setItem('evaya-business-profile', JSON.stringify(profile));
  window.dispatchEvent(new Event('evaya-brand-updated'));
}

const inputCls = 'rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [pageError, setPageError] = useState('');

  // Business profile
  const [editingProfile, setEditingProfile] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  // System settings
  const [expiryAlertDays, setExpiryAlertDays] = useState('30');
  const [lowStockDefaultThreshold, setLowStockDefaultThreshold] = useState('5');
  const [receiptFooterMessage, setReceiptFooterMessage] = useState('');
  const [reportFooterMessage, setReportFooterMessage] = useState('');

  // Staff form
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [roleId, setRoleId] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Password reset
  const [resetUserId, setResetUserId] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Delete staff
  const [deletingUserId, setDeletingUserId] = useState('');

  const settingsQuery = useQuery({
    queryKey: ['settings-admin'],
    queryFn: () => api.settings.get(),
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const { businessProfile, systemSettings, roles } = settingsQuery.data;
    setBusinessName(businessProfile.businessName);
    setLogoDataUrl(businessProfile.logoDataUrl ?? null);
    setPhone(businessProfile.phone);
    setEmail(businessProfile.email);
    setAddress(businessProfile.address ?? '');
    setExpiryAlertDays(String(systemSettings.expiryAlertDays));
    setLowStockDefaultThreshold(String(systemSettings.lowStockDefaultThreshold));
    setReceiptFooterMessage(systemSettings.receiptFooterMessage ?? '');
    setReportFooterMessage(systemSettings.reportFooterMessage ?? '');
    if (!roleId && roles.length > 0) {
      setRoleId(roles[0].id);
    }
    persistBrandProfile(businessProfile);
  }, [roleId, settingsQuery.data]);

  const roles = settingsQuery.data?.roles ?? [];
  const users = settingsQuery.data?.users ?? [];
  const activeUsers = useMemo(() => users.filter((u) => u.isActive), [users]);

  const refreshSettings = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['settings-admin'] }),
      queryClient.invalidateQueries({ queryKey: ['public-settings'] }),
    ]);
  };

  const businessMutation = useMutation({
    mutationFn: () => api.settings.updateBusinessProfile({ businessName, logoDataUrl, phone, email, address: address || null }),
    onSuccess: async (payload) => {
      setPageError('');
      setEditingProfile(false);
      persistBrandProfile(payload.businessProfile);
      await refreshSettings();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const systemMutation = useMutation({
    mutationFn: () => api.settings.updateSystem({
      expiryAlertDays: Number(expiryAlertDays),
      lowStockDefaultThreshold: Number(lowStockDefaultThreshold),
      receiptFooterMessage: receiptFooterMessage || null,
      reportFooterMessage: reportFooterMessage || null,
    }),
    onSuccess: async () => {
      setPageError('');
      await refreshSettings();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const staffMutation = useMutation({
    mutationFn: () => (
      editingUserId
        ? api.settings.updateStaffUser(editingUserId, { firstName, lastName, email: staffEmail, phone: staffPhone || null, roleId, isActive })
        : api.settings.createStaffUser({ firstName, lastName, email: staffEmail, phone: staffPhone || null, roleId, password, isActive })
    ),
    onSuccess: async () => {
      resetStaffForm();
      setShowStaffForm(false);
      setPageError('');
      await refreshSettings();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => api.settings.resetStaffPassword(resetUserId, newPassword),
    onSuccess: async () => {
      setResetUserId('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError('');
      setPageError('');
      await refreshSettings();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const deleteStaffMutation = useMutation({
    mutationFn: (id: string) => api.settings.deleteStaffUser(id),
    onSuccess: async () => {
      setDeletingUserId('');
      setPageError('');
      await refreshSettings();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  function resetStaffForm() {
    setEditingUserId('');
    setFirstName('');
    setLastName('');
    setStaffEmail('');
    setStaffPhone('');
    setPassword('');
    setIsActive(true);
    setRoleId(roles[0]?.id ?? '');
  }

  function loadUser(userId: string) {
    const u = users.find((entry) => entry.id === userId);
    if (!u) return;
    setEditingUserId(u.id);
    setFirstName(u.firstName);
    setLastName(u.lastName);
    setStaffEmail(u.email);
    setStaffPhone(u.phone ?? '');
    setRoleId(u.roleId);
    setPassword('');
    setIsActive(u.isActive);
    setShowStaffForm(true);
  }

  async function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }

  const handleBusinessSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await businessMutation.mutateAsync();
  };

  const handleSystemSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await systemMutation.mutateAsync();
  };

  const handleStaffSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await staffMutation.mutateAsync();
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    setPageError('');
    await resetPasswordMutation.mutateAsync();
  };

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-24 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-5xl space-y-6">

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Settings</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Settings</h1>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">

              <Card title="Business Profile" subtitle="Your business details and logo.">
                {editingProfile ? (
                  <form className="grid gap-3" onSubmit={handleBusinessSubmit}>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Logo</p>
                      <div className="flex items-center gap-4">
                        <BrandMark />
                        <input type="file" accept="image/*" onChange={handleLogoChange} className="text-sm text-slate-500" />
                      </div>
                    </div>
                    <input
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Business name"
                      className={inputCls}
                      required
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Phone"
                        className={inputCls}
                        required
                      />
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        placeholder="Email"
                        className={inputCls}
                        required
                      />
                    </div>
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Address (optional)"
                      className={inputCls}
                    />
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-400">Currency: UGX</div>
                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={businessMutation.isPending}
                        className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                      >
                        {businessMutation.isPending ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProfile(false)}
                        className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <BrandMark />
                    </div>
                    {[
                      { label: 'Business name', value: businessName },
                      { label: 'Phone', value: phone },
                      { label: 'Email', value: email },
                      { label: 'Address', value: address || '—' },
                      { label: 'Currency', value: 'UGX' },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <span className="text-xs text-slate-400">{row.label}</span>
                        <span className="text-sm text-slate-900">{row.value}</span>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEditingProfile(true)}
                      className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Edit profile
                    </button>
                  </div>
                )}
              </Card>

              <Card title="Stock Alerts" subtitle="Expiry, low stock, and footer messages.">
                <form className="grid gap-3" onSubmit={handleSystemSubmit}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="number"
                      min="1"
                      value={expiryAlertDays}
                      onChange={(e) => setExpiryAlertDays(e.target.value)}
                      placeholder="Expiry alert days"
                      className={inputCls}
                      required
                    />
                    <input
                      type="number"
                      min="1"
                      value={lowStockDefaultThreshold}
                      onChange={(e) => setLowStockDefaultThreshold(e.target.value)}
                      placeholder="Low stock level"
                      className={inputCls}
                      required
                    />
                  </div>
                  <textarea
                    value={receiptFooterMessage}
                    onChange={(e) => setReceiptFooterMessage(e.target.value)}
                    rows={2}
                    placeholder="Receipt footer message"
                    className={`${inputCls} resize-none`}
                  />
                  <textarea
                    value={reportFooterMessage}
                    onChange={(e) => setReportFooterMessage(e.target.value)}
                    rows={2}
                    placeholder="Report footer message"
                    className={`${inputCls} resize-none`}
                  />
                  <button
                    type="submit"
                    disabled={systemMutation.isPending}
                    className="justify-self-start rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {systemMutation.isPending ? 'Saving…' : 'Save alerts'}
                  </button>
                </form>
              </Card>

            </div>

            <div className="space-y-6">

              <Card title="Staff" subtitle={`${activeUsers.length} active members.`}>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => { resetStaffForm(); setShowStaffForm((v) => !v); }}
                    className={`w-full rounded-full py-2.5 text-sm font-medium transition ${
                      showStaffForm && !editingUserId
                        ? 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {showStaffForm && !editingUserId ? 'Cancel' : '+ Add staff member'}
                  </button>

                  {showStaffForm && (
                    <form className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4" onSubmit={handleStaffSubmit}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {editingUserId ? 'Edit staff member' : 'New staff member'}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="First name"
                          className={inputCls}
                          required
                        />
                        <input
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Last name"
                          className={inputCls}
                          required
                        />
                      </div>
                      <input
                        value={staffEmail}
                        onChange={(e) => setStaffEmail(e.target.value)}
                        type="email"
                        placeholder="Email"
                        className={inputCls}
                        required
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          value={staffPhone}
                          onChange={(e) => setStaffPhone(e.target.value)}
                          placeholder="Phone"
                          className={inputCls}
                        />
                        <select
                          value={roleId}
                          onChange={(e) => setRoleId(e.target.value)}
                          className={inputCls}
                        >
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>{role.name}</option>
                          ))}
                        </select>
                      </div>
                      {!editingUserId && (
                        <input
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          type="password"
                          placeholder="Temporary password"
                          className={inputCls}
                          required
                        />
                      )}
                      <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                        <span className="text-slate-600">Active</span>
                        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded" />
                      </label>
                      <div className="flex gap-3">
                        <button
                          type="submit"
                          disabled={staffMutation.isPending}
                          className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                        >
                          {staffMutation.isPending ? 'Saving…' : editingUserId ? 'Save changes' : 'Add staff'}
                        </button>
                        {editingUserId && (
                          <button
                            type="button"
                            onClick={resetStaffForm}
                            className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            New staff
                          </button>
                        )}
                      </div>
                    </form>
                  )}

                  {users.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                      No staff users yet.
                    </div>
                  )}

                  {users.map((u) => (
                    <div key={u.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">{u.firstName} {u.lastName}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{u.role.name} · {u.email} · {u.isActive ? 'Active' : 'Inactive'}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            Last sign in {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => loadUser(u.id)}
                            className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => { setResetUserId(u.id); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }}
                            className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            Reset pwd
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingUserId(u.id)}
                            className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-100"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {resetUserId === u.id && (
                        <form className="mt-4 grid gap-2" onSubmit={handleResetPassword}>
                          {passwordError && <p className="text-xs text-rose-600">{passwordError}</p>}
                          <input
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            type="password"
                            placeholder="Current password (for verification)"
                            className={inputCls}
                          />
                          <input
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            type="password"
                            placeholder="New password"
                            className={inputCls}
                            required
                          />
                          <input
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            type="password"
                            placeholder="Confirm new password"
                            className={inputCls}
                            required
                          />
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={resetPasswordMutation.isPending}
                              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                            >
                              {resetPasswordMutation.isPending ? 'Saving…' : 'Save password'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setResetUserId(''); setPasswordError(''); }}
                              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

            </div>
          </div>
        </div>
      </main>

      {deletingUserId && (() => {
        const target = users.find((u) => u.id === deletingUserId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="w-full max-w-sm rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl">
              <h3 className="text-base font-semibold text-slate-900">Delete staff member?</h3>
              <p className="mt-2 text-sm text-slate-500">
                <span className="text-slate-900">{target?.firstName} {target?.lastName}</span> will be deactivated and can no longer log in.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => deleteStaffMutation.mutate(deletingUserId)}
                  disabled={deleteStaffMutation.isPending}
                  className="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
                >
                  {deleteStaffMutation.isPending ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingUserId('')}
                  className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}
