import { FormEvent, useDeferredValue, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../hooks/useAuth';
import { api, ApiError } from '../services/api';
import type { BroadcastLink, Customer } from '../types';

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

const MESSAGE_TEMPLATES = [
  'Hi {name}, we have exciting new products at Evaya Naturals! Visit us today.',
  'Dear {name}, your order is ready for pickup at Evaya Naturals.',
  'Hi {name}, thank you for shopping with us! Check out our latest offers.',
];

const inputCls = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400';

export default function CustomersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [broadcastLinks, setBroadcastLinks] = useState<BroadcastLink[]>([]);
  const [broadcastStatus, setBroadcastStatus] = useState('');
  const [pageError, setPageError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const deferredSearch = useDeferredValue(search);

  const canManageCustomers = ['Admin', 'Cashier', 'Branch Manager'].includes(user?.role.name ?? '');
  const canBroadcast = ['Admin', 'Branch Manager'].includes(user?.role.name ?? '');

  const customersQuery = useQuery({
    queryKey: ['customers', deferredSearch],
    queryFn: () => api.pos.customers({ search: deferredSearch, includeInactive: false }),
  });

  const refreshCustomers = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-customers'] }),
    ]);

  const customerMutation = useMutation({
    mutationFn: () => {
      const phone = whatsappNumber.trim();
      return editingCustomer
        ? api.pos.updateCustomer(editingCustomer.id, {
            name,
            phone,
            whatsappNumber: phone || null,
            email: email || null,
          })
        : api.pos.createCustomer({
            name,
            phone,
            whatsappNumber: phone || null,
            email: email || null,
            isActive: true,
          });
    },
    onSuccess: async () => {
      setEditingCustomer(null);
      resetForm();
      setPageError('');
      await refreshCustomers();
    },
    onError: (e) => setPageError(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.pos.deleteCustomer(id),
    onSuccess: async () => {
      setDeletingCustomer(null);
      setSelectedRecipients((cur) => cur.filter((id) => id !== deletingCustomer?.id));
      setPageError('');
      await refreshCustomers();
    },
    onError: (e) => { setPageError(getErrorMessage(e)); setDeletingCustomer(null); },
  });

  const broadcastMutation = useMutation({
    mutationFn: () => api.pos.createBroadcast({
      customerIds: selectedRecipients,
      messageBody: broadcastMessage,
      channel: 'whatsapp',
    }),
    onSuccess: (payload) => {
      setBroadcastLinks(payload.links ?? []);
      setBroadcastStatus(payload.statusLabel ?? 'Links ready');
      setPageError('');
    },
    onError: (e) => setPageError(getErrorMessage(e)),
  });

  const customers = customersQuery.data?.customers ?? [];
  const activeCustomers = customers.filter((c) => c.isActive);

  function resetForm() {
    setName('');
    setWhatsappNumber('');
    setEmail('');
  }

  const startEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setName(customer.name);
    setWhatsappNumber(customer.whatsappNumber ?? customer.phone ?? '');
    setEmail(customer.email ?? '');
    setExpandedId(customer.id);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPageError('');
    await customerMutation.mutateAsync();
  };

  const toggleRecipient = (customerId: string) => {
    setBroadcastLinks([]);
    setBroadcastStatus('');
    setSelectedRecipients((cur) =>
      cur.includes(customerId) ? cur.filter((id) => id !== customerId) : [...cur, customerId],
    );
  };

  const toggleSelectAll = () => {
    setBroadcastLinks([]);
    setBroadcastStatus('');
    if (selectedRecipients.length === activeCustomers.length) {
      setSelectedRecipients([]);
    } else {
      setSelectedRecipients(activeCustomers.map((c) => c.id));
    }
  };

  const allSelected = activeCustomers.length > 0 && selectedRecipients.length === activeCustomers.length;

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl space-y-6">

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Customers</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Customers</h1>
            <p className="mt-1 text-sm text-slate-500">Manage customer contacts and send messages.</p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">

            {/* Left: customer form + list */}
            <div className="space-y-5">

              {/* Customer form */}
              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {editingCustomer ? `Edit: ${editingCustomer.name}` : 'New customer'}
                  </h2>
                  {editingCustomer && (
                    <button
                      type="button"
                      onClick={() => { setEditingCustomer(null); resetForm(); }}
                      className="text-xs font-semibold text-slate-400 transition hover:text-slate-600"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Customer name"
                    className={inputCls}
                    required
                    disabled={!canManageCustomers}
                  />
                  <input
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="WhatsApp number (e.g. 256700000000)"
                    className={inputCls}
                    required
                    disabled={!canManageCustomers}
                  />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email (optional)"
                    type="email"
                    className={inputCls}
                    disabled={!canManageCustomers}
                  />
                  <button
                    type="submit"
                    disabled={!canManageCustomers || customerMutation.isPending}
                    className="rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {customerMutation.isPending ? 'Saving…' : editingCustomer ? 'Save changes' : 'Add customer'}
                  </button>
                </form>
              </div>

              {/* Customer list */}
              <div className="rounded-[28px] border border-white/70 bg-white/90 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <h2 className="flex-1 text-lg font-semibold text-slate-900">
                    Customer list
                    <span className="ml-2 text-sm font-normal text-slate-400">({activeCustomers.length})</span>
                  </h2>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or WhatsApp…"
                    className="w-[220px] rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-400"
                  />
                </div>

                {canBroadcast && activeCustomers.length > 0 && (
                  <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-3">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded"
                      />
                      Select all
                    </label>
                    {selectedRecipients.length > 0 && (
                      <span className="text-xs font-semibold text-emerald-700">
                        {selectedRecipients.length} selected
                      </span>
                    )}
                  </div>
                )}

                <div className="divide-y divide-slate-50">
                  {customers.length === 0 && !customersQuery.isLoading && (
                    <p className="px-5 py-6 text-center text-sm text-slate-400">No customers found</p>
                  )}
                  {customers.map((customer) => (
                    <CustomerRow
                      key={customer.id}
                      customer={customer}
                      expanded={expandedId === customer.id}
                      onToggle={() => setExpandedId(expandedId === customer.id ? null : customer.id)}
                      selected={selectedRecipients.includes(customer.id)}
                      onToggleSelect={() => toggleRecipient(customer.id)}
                      canBroadcast={canBroadcast}
                      canManage={canManageCustomers}
                      onEdit={() => startEdit(customer)}
                      onDelete={() => setDeletingCustomer(customer)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Right: broadcast */}
            <div className="space-y-5">
              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">Send WhatsApp</h2>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {selectedRecipients.length} selected
                  </span>
                </div>

                {!canBroadcast && (
                  <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    Only Admin and Branch Manager can send messages.
                  </p>
                )}

                {canBroadcast && (
                  <div className="mt-4 space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-400">Quick templates</p>
                      {MESSAGE_TEMPLATES.map((t, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setBroadcastMessage(t)}
                          className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 transition hover:bg-slate-100"
                        >
                          {t.slice(0, 60)}…
                        </button>
                      ))}
                    </div>

                    <textarea
                      value={broadcastMessage}
                      onChange={(e) => { setBroadcastMessage(e.target.value); setBroadcastLinks([]); setBroadcastStatus(''); }}
                      rows={5}
                      placeholder="Type your message…"
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    />

                    <button
                      type="button"
                      onClick={() => { setPageError(''); broadcastMutation.mutate(); }}
                      disabled={broadcastMutation.isPending || selectedRecipients.length === 0 || !broadcastMessage.trim()}
                      className="w-full rounded-full bg-slate-900 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {broadcastMutation.isPending ? 'Preparing…' : 'Generate WhatsApp links'}
                    </button>

                    {broadcastStatus && (
                      <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                        {broadcastStatus}
                      </p>
                    )}

                    {broadcastLinks.length > 0 && (
                      <div className="space-y-2">
                        {broadcastLinks.map((link) => (
                          <a
                            key={link.customerId}
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 transition hover:bg-emerald-50"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{link.customerName}</p>
                              <p className="text-xs text-slate-500">{link.phone}</p>
                            </div>
                            <span className="shrink-0 text-xs font-bold text-emerald-700">Open ↗</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Delete confirmation */}
      {deletingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Delete customer?</h2>
            <p className="mt-2 text-sm text-slate-500">
              <strong className="text-slate-900">{deletingCustomer.name}</strong> will be removed from all lists. This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deletingCustomer.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-full bg-rose-600 py-3 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => setDeletingCustomer(null)}
                className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerRow({
  customer,
  expanded,
  onToggle,
  selected,
  onToggleSelect,
  canBroadcast,
  canManage,
  onEdit,
  onDelete,
}: {
  customer: Customer;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  canBroadcast: boolean;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div>
      <button type="button" onClick={onToggle} className="w-full px-5 py-4 text-left">
        <div className="flex items-center gap-3">
          {canBroadcast && customer.isActive && (
            <label
              className="shrink-0"
              onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelect}
                className="h-4 w-4 rounded"
                onClick={(e) => e.stopPropagation()}
              />
            </label>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">{customer.name}</p>
            <p className="truncate text-xs text-slate-500">
              {customer.whatsappNumber ?? customer.phone}
            </p>
          </div>
          <svg
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-400">WhatsApp</p>
              <p className="font-medium text-slate-900">{customer.whatsappNumber ?? customer.phone ?? '—'}</p>
            </div>
            {customer.email && (
              <div>
                <p className="text-xs text-slate-400">Email</p>
                <p className="font-medium text-slate-900">{customer.email}</p>
              </div>
            )}
          </div>
          {canManage && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
