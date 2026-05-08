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

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [pageError, setPageError] = useState('');

  const [businessName, setBusinessName] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const [expiryAlertDays, setExpiryAlertDays] = useState('30');
  const [lowStockDefaultThreshold, setLowStockDefaultThreshold] = useState('5');
  const [receiptFooterMessage, setReceiptFooterMessage] = useState('');
  const [reportFooterMessage, setReportFooterMessage] = useState('');

  const [paymentMethods, setPaymentMethods] = useState({
    cash: true,
    mtn_mobile_money: true,
    airtel_money: true,
    bank_card: true,
    bank_transfer: true,
  });

  const [editingUserId, setEditingUserId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [roleId, setRoleId] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [resetUserId, setResetUserId] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  const settingsQuery = useQuery({
    queryKey: ['settings-admin'],
    queryFn: () => api.settings.get(),
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const { businessProfile, systemSettings, paymentMethods: methodSettings, roles } = settingsQuery.data;
    setBusinessName(businessProfile.businessName);
    setLogoDataUrl(businessProfile.logoDataUrl ?? null);
    setPhone(businessProfile.phone);
    setEmail(businessProfile.email);
    setAddress(businessProfile.address ?? '');
    setExpiryAlertDays(String(systemSettings.expiryAlertDays));
    setLowStockDefaultThreshold(String(systemSettings.lowStockDefaultThreshold));
    setReceiptFooterMessage(systemSettings.receiptFooterMessage ?? '');
    setReportFooterMessage(systemSettings.reportFooterMessage ?? '');
    setPaymentMethods(methodSettings);
    if (!roleId && roles.length > 0) {
      setRoleId(roles[0].id);
    }
    persistBrandProfile(businessProfile);
  }, [roleId, settingsQuery.data]);

  const roles = settingsQuery.data?.roles ?? [];
  const users = settingsQuery.data?.users ?? [];

  const activeUsers = useMemo(() => users.filter((user) => user.isActive), [users]);

  const refreshSettings = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['settings-admin'] }),
      queryClient.invalidateQueries({ queryKey: ['public-settings'] }),
    ]);
  };

  const businessMutation = useMutation({
    mutationFn: () => api.settings.updateBusinessProfile({
      businessName,
      logoDataUrl,
      phone,
      email,
      address: address || null,
    }),
    onSuccess: async (payload) => {
      setPageError('');
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

  const paymentMethodsMutation = useMutation({
    mutationFn: () => api.settings.updatePaymentMethods(paymentMethods),
    onSuccess: async () => {
      setPageError('');
      await refreshSettings();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const staffMutation = useMutation({
    mutationFn: () => (
      editingUserId
        ? api.settings.updateStaffUser(editingUserId, {
            firstName,
            lastName,
            email: staffEmail,
            phone: staffPhone || null,
            roleId,
            isActive,
          })
        : api.settings.createStaffUser({
            firstName,
            lastName,
            email: staffEmail,
            phone: staffPhone || null,
            roleId,
            password,
            isActive,
          })
    ),
    onSuccess: async () => {
      resetStaffForm();
      setPageError('');
      await refreshSettings();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => api.settings.resetStaffPassword(resetUserId, resetPassword),
    onSuccess: async () => {
      setResetUserId('');
      setResetPassword('');
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
    const user = users.find((entry) => entry.id === userId);
    if (!user) return;
    setEditingUserId(user.id);
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setStaffEmail(user.email);
    setStaffPhone(user.phone ?? '');
    setRoleId(user.roleId);
    setPassword('');
    setIsActive(user.isActive);
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

  const handlePaymentMethodsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await paymentMethodsMutation.mutateAsync();
  };

  const handleStaffSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await staffMutation.mutateAsync();
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await resetPasswordMutation.mutateAsync();
  };

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-6 pt-24 sm:px-6 lg:px-8 lg:pt-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <BrandMark />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Settings</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Keep the admin surface small</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Business profile, staff access, payment methods, and the few defaults that actually affect daily operations.
            </p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="space-y-6">
              <Card title="Business profile" subtitle="One active business, fixed currency, clean brand basics.">
                <form className="grid gap-3" onSubmit={handleBusinessSubmit}>
                  <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Logo preview</p>
                    <div className="mt-3 flex items-center gap-4">
                      <BrandMark />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        className="text-sm text-slate-500"
                      />
                    </div>
                  </div>
                  <input
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                    placeholder="Business name"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="Phone"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      placeholder="Email"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                  </div>
                  <input
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="Address (optional)"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  />
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    Currency: UGX
                  </div>
                  <button
                    type="submit"
                    disabled={businessMutation.isPending}
                    className="justify-self-start rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {businessMutation.isPending ? 'Saving…' : 'Save business profile'}
                  </button>
                </form>
              </Card>

              <Card title="System defaults" subtitle="Only the settings that affect expiry, low stock, receipts, and reports.">
                <form className="grid gap-3" onSubmit={handleSystemSubmit}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="number"
                      min="1"
                      value={expiryAlertDays}
                      onChange={(event) => setExpiryAlertDays(event.target.value)}
                      placeholder="Expiry alert days"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                    <input
                      type="number"
                      min="1"
                      value={lowStockDefaultThreshold}
                      onChange={(event) => setLowStockDefaultThreshold(event.target.value)}
                      placeholder="Default low stock threshold"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                  </div>
                  <textarea
                    value={receiptFooterMessage}
                    onChange={(event) => setReceiptFooterMessage(event.target.value)}
                    rows={3}
                    placeholder="Receipt footer message"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  />
                  <textarea
                    value={reportFooterMessage}
                    onChange={(event) => setReportFooterMessage(event.target.value)}
                    rows={3}
                    placeholder="Report footer message"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  />
                  <button
                    type="submit"
                    disabled={systemMutation.isPending}
                    className="justify-self-start rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {systemMutation.isPending ? 'Saving…' : 'Save system defaults'}
                  </button>
                </form>
              </Card>

              <Card title="Payment methods" subtitle="Enable only what the counter should actually use right now.">
                <form className="grid gap-3" onSubmit={handlePaymentMethodsSubmit}>
                  {[
                    ['cash', 'Cash'],
                    ['mtn_mobile_money', 'MTN Mobile Money'],
                    ['airtel_money', 'Airtel Money'],
                    ['bank_card', 'Bank Card'],
                    ['bank_transfer', 'Bank Transfer'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={paymentMethods[key as keyof typeof paymentMethods]}
                        onChange={(event) => setPaymentMethods((current) => ({
                          ...current,
                          [key]: event.target.checked,
                        }))}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                      />
                    </label>
                  ))}
                  <button
                    type="submit"
                    disabled={paymentMethodsMutation.isPending}
                    className="justify-self-start rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {paymentMethodsMutation.isPending ? 'Saving…' : 'Save payment methods'}
                  </button>
                </form>
              </Card>
            </section>

            <section className="space-y-6">
              <Card title={editingUserId ? 'Edit staff user' : 'Create staff user'} subtitle="No public signup. Every staff account is created here by Admin.">
                <form className="grid gap-3" onSubmit={handleStaffSubmit}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      placeholder="First name"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                    <input
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      placeholder="Last name"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                  </div>
                  <input
                    value={staffEmail}
                    onChange={(event) => setStaffEmail(event.target.value)}
                    type="email"
                    placeholder="Email"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={staffPhone}
                      onChange={(event) => setStaffPhone(event.target.value)}
                      placeholder="Phone"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    />
                    <select
                      value={roleId}
                      onChange={(event) => setRoleId(event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  </div>
                  {!editingUserId && (
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      placeholder="Temporary password"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                  )}
                  <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <span>Active user</span>
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(event) => setIsActive(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                    />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={staffMutation.isPending}
                      className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {staffMutation.isPending ? 'Saving…' : editingUserId ? 'Save user' : 'Create user'}
                    </button>
                    {editingUserId && (
                      <button
                        type="button"
                        onClick={resetStaffForm}
                        className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        New user
                      </button>
                    )}
                  </div>
                </form>
              </Card>

              <Card title="Staff users" subtitle={`${activeUsers.length} active users across the single-branch MVP.`}>
                <div className="space-y-3">
                  {users.length === 0 && (
                    <EmptyState text="No staff users yet." />
                  )}
                  {users.map((user) => (
                    <div key={user.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{user.firstName} {user.lastName}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {user.role.name} · {user.email} · {user.isActive ? 'Active' : 'Inactive'}
                          </p>
                          <p className="mt-2 text-sm text-slate-500">
                            Last login {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => loadUser(user.id)}
                            className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-white"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResetUserId(user.id);
                              setResetPassword('');
                            }}
                            className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-white"
                          >
                            Reset password
                          </button>
                        </div>
                      </div>
                      {resetUserId === user.id && (
                        <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={handleResetPassword}>
                          <input
                            value={resetPassword}
                            onChange={(event) => setResetPassword(event.target.value)}
                            type="password"
                            placeholder="New password"
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                            required
                          />
                          <button
                            type="submit"
                            disabled={resetPasswordMutation.isPending}
                            className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                          >
                            {resetPasswordMutation.isPending ? 'Saving…' : 'Save password'}
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
