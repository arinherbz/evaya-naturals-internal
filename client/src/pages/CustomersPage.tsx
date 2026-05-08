import { FormEvent, useDeferredValue, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../hooks/useAuth';
import { api, ApiError } from '../services/api';
import type { BroadcastLink, Customer } from '../types';

const currencyFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0,
});

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

export default function CustomersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [broadcastChannel, setBroadcastChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [broadcastLinks, setBroadcastLinks] = useState<BroadcastLink[]>([]);
  const [broadcastStatus, setBroadcastStatus] = useState('');
  const [pageError, setPageError] = useState('');
  const deferredSearch = useDeferredValue(search);

  const canManageCustomers = ['Admin', 'Cashier', 'Branch Manager'].includes(user?.role.name ?? '');
  const canBroadcast = ['Admin', 'Branch Manager'].includes(user?.role.name ?? '');

  const customersQuery = useQuery({
    queryKey: ['customers', deferredSearch],
    queryFn: () => api.pos.customers({ search: deferredSearch, includeInactive: true }),
  });

  const historyQuery = useQuery({
    queryKey: ['customer-history', selectedCustomerId],
    queryFn: () => api.pos.customerHistory(selectedCustomerId),
    enabled: Boolean(selectedCustomerId),
  });

  const refreshCustomers = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-customers'] }),
      queryClient.invalidateQueries({ queryKey: ['customer-history'] }),
    ]);
  };

  const customerMutation = useMutation({
    mutationFn: () => (
      editingCustomer
        ? api.pos.updateCustomer(editingCustomer.id, {
            name,
            phone,
            whatsappNumber: whatsappNumber || null,
            email: email || null,
            isActive,
          })
        : api.pos.createCustomer({
            name,
            phone,
            whatsappNumber: whatsappNumber || null,
            email: email || null,
            isActive,
          })
    ),
    onSuccess: async (payload) => {
      setEditingCustomer(null);
      resetForm(payload.customer);
      setSelectedCustomerId(payload.customer.id);
      setPageError('');
      await refreshCustomers();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const broadcastMutation = useMutation({
    mutationFn: () => api.pos.createBroadcast({
      customerIds: selectedRecipients,
      messageBody: broadcastMessage,
      channel: broadcastChannel,
    }),
    onSuccess: (payload) => {
      setBroadcastLinks(payload.links ?? []);
      setBroadcastStatus(payload.statusLabel ?? payload.message ?? payload.broadcast.status);
      setPageError('');
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const customers = customersQuery.data?.customers ?? [];
  const activeCustomers = customers.filter((customer) => customer.isActive);
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const purchaseHistory = historyQuery.data;

  function resetForm(customer?: Customer | null) {
    setName(customer?.name ?? '');
    setPhone(customer?.phone ?? '');
    setWhatsappNumber(customer?.whatsappNumber ?? '');
    setEmail(customer?.email ?? '');
    setIsActive(customer?.isActive ?? true);
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await customerMutation.mutateAsync();
  };

  const startEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    resetForm(customer);
  };

  const clearForm = () => {
    setEditingCustomer(null);
    resetForm(null);
  };

  const toggleRecipient = (customerId: string) => {
    setSelectedRecipients((current) => (
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId]
    ));
  };

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Customer desk</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Simple customer records and broadcast prep</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Keep the customer list clean, attach customers to sales, and prepare outreach without pretending it was sent automatically.
            </p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="space-y-6">
              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{editingCustomer ? 'Edit customer' : 'Create customer'}</h2>
                    <p className="mt-1 text-sm text-slate-500">Only the minimum fields needed for daily use.</p>
                  </div>
                  {editingCustomer && (
                    <button
                      type="button"
                      onClick={clearForm}
                      className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      New customer
                    </button>
                  )}
                </div>
                <form className="mt-5 grid gap-3" onSubmit={handleSubmit}>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Customer name"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                    disabled={!canManageCustomers}
                  />
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="Phone number"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                    disabled={!canManageCustomers}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={whatsappNumber}
                      onChange={(event) => setWhatsappNumber(event.target.value)}
                      placeholder="WhatsApp number"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      disabled={!canManageCustomers}
                    />
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="Email"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      disabled={!canManageCustomers}
                    />
                  </div>
                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(event) => setIsActive(event.target.checked)}
                      disabled={!canManageCustomers}
                    />
                    Active customer
                  </label>
                  <button
                    type="submit"
                    disabled={!canManageCustomers || customerMutation.isPending}
                    className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {customerMutation.isPending ? 'Saving…' : editingCustomer ? 'Save changes' : 'Create customer'}
                  </button>
                </form>
              </div>

              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Customer list</h2>
                    <p className="mt-1 text-sm text-slate-500">Search by name or phone and open purchase history instantly.</p>
                  </div>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name or phone"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  />
                </div>
                <div className="mt-5 space-y-3">
                  {customers.length === 0 && (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      No customers matched this search.
                    </div>
                  )}
                  {customers.map((customer) => (
                    <div key={customer.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerId(customer.id)}
                            className="text-left font-medium text-slate-900 underline-offset-4 hover:underline"
                          >
                            {customer.name}
                          </button>
                          <p className="mt-1 text-sm text-slate-500">{customer.phone}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {customer.isActive ? 'Active' : 'Inactive'}
                            {customer.whatsappNumber ? ` · WhatsApp ${customer.whatsappNumber}` : ''}
                            {customer.email ? ` · ${customer.email}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {canBroadcast && customer.isActive && (
                            <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
                              <input
                                type="checkbox"
                                checked={selectedRecipients.includes(customer.id)}
                                onChange={() => toggleRecipient(customer.id)}
                              />
                              Select
                            </label>
                          )}
                          {canManageCustomers && (
                            <button
                              type="button"
                              onClick={() => startEdit(customer)}
                              className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-white"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Purchase history</h2>
                <p className="mt-1 text-sm text-slate-500">Select a customer to review their sales.</p>
                {!selectedCustomer && (
                  <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No customer selected yet.
                  </div>
                )}
                {selectedCustomer && (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-3xl bg-slate-50 p-4">
                      <p className="font-medium text-slate-900">{selectedCustomer.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{selectedCustomer.phone}</p>
                      <p className="mt-3 text-sm text-slate-600">
                        Total spent: {currencyFormatter.format(purchaseHistory?.totalSpent ?? 0)}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {(purchaseHistory?.sales ?? []).length === 0 && (
                        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                          No purchases recorded for this customer yet.
                        </div>
                      )}
                      {(purchaseHistory?.sales ?? []).map((sale) => (
                        <div key={sale.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="font-medium text-slate-900">{sale.receiptNumber}</p>
                              <p className="mt-1 text-xs text-slate-400">
                                {new Date(sale.createdAt).toLocaleString()} · {sale.cashierName}
                              </p>
                            </div>
                            <div className="text-right text-sm font-semibold text-slate-900">
                              {currencyFormatter.format(sale.total)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Broadcast helper</h2>
                    <p className="mt-1 text-sm text-slate-500">Prepare customer outreach without pretending it was sent automatically.</p>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {selectedRecipients.length} selected
                  </div>
                </div>
                {!canBroadcast && (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Only Admin and Branch Manager can prepare broadcasts.
                  </div>
                )}
                <div className="mt-5 grid gap-3">
                  <select
                    value={broadcastChannel}
                    onChange={(event) => setBroadcastChannel(event.target.value as 'whatsapp' | 'sms')}
                    disabled={!canBroadcast}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="sms">SMS</option>
                  </select>
                  <textarea
                    value={broadcastMessage}
                    onChange={(event) => setBroadcastMessage(event.target.value)}
                    rows={5}
                    placeholder="Type the message body"
                    disabled={!canBroadcast}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
                  />
                  <button
                    type="button"
                    disabled={!canBroadcast || broadcastMutation.isPending || selectedRecipients.length === 0 || !broadcastMessage.trim()}
                    onClick={() => {
                      setPageError('');
                      broadcastMutation.mutate();
                    }}
                    className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {broadcastMutation.isPending ? 'Preparing…' : broadcastChannel === 'whatsapp' ? 'Prepare WhatsApp links' : 'Prepare SMS broadcast'}
                  </button>
                </div>

                {broadcastStatus && (
                  <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {broadcastStatus}
                  </div>
                )}

                {broadcastChannel === 'whatsapp' && broadcastLinks.length > 0 && (
                  <div className="mt-5 space-y-3">
                    {broadcastLinks.map((link) => (
                      <a
                        key={link.customerId}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4 transition hover:border-emerald-200 hover:bg-emerald-50/50"
                      >
                        <div>
                          <p className="font-medium text-slate-900">{link.customerName}</p>
                          <p className="mt-1 text-xs text-slate-400">{link.phone}</p>
                        </div>
                        <span className="text-sm font-medium text-emerald-700">Open WhatsApp</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Active customer count</h2>
                <p className="mt-1 text-sm text-slate-500">A small operational view of who is reachable right now.</p>
                <div className="mt-5 rounded-3xl bg-slate-50 p-4">
                  <p className="text-3xl font-semibold text-slate-900">{activeCustomers.length}</p>
                  <p className="mt-1 text-sm text-slate-500">active customers</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
