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
    <div className="flex min-h-screen" style={{ background: '#0A0F0D', color: '#E2E8E4' }}>
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl space-y-6">

          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: '#3ADB82' }}>Customers</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Customers</h1>
            <p className="mt-1 text-sm" style={{ color: '#6B7F73' }}>Manage customer contacts and send messages.</p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-800/40 bg-rose-900/30 px-4 py-3 text-sm text-rose-300">
              {pageError}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">

            {/* Left: customer form + list */}
            <div className="space-y-5">

              {/* Customer form */}
              <div className="rounded-2xl p-6" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">
                    {editingCustomer ? `Edit: ${editingCustomer.name}` : 'New customer'}
                  </h2>
                  {editingCustomer && (
                    <button
                      type="button"
                      onClick={() => { setEditingCustomer(null); resetForm(); }}
                      className="text-xs font-semibold transition hover:underline"
                      style={{ color: '#6B7F73' }}
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
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                    required
                    disabled={!canManageCustomers}
                  />
                  <input
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="WhatsApp number (e.g. 256700000000)"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                    required
                    disabled={!canManageCustomers}
                  />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email (optional)"
                    type="email"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                    disabled={!canManageCustomers}
                  />
                  <button
                    type="submit"
                    disabled={!canManageCustomers || customerMutation.isPending}
                    className="rounded-xl px-6 py-3 text-sm font-bold transition disabled:opacity-60 hover:brightness-110"
                    style={{ background: '#1B4332', color: '#3ADB82' }}
                  >
                    {customerMutation.isPending ? 'Saving…' : editingCustomer ? 'Save changes' : 'Add customer'}
                  </button>
                </form>
              </div>

              {/* Customer list */}
              <div className="rounded-2xl" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <h2 className="flex-1 text-lg font-bold text-white">
                    Customer list
                    <span className="ml-2 text-sm font-normal" style={{ color: '#6B7F73' }}>
                      ({activeCustomers.length})
                    </span>
                  </h2>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or WhatsApp…"
                    className="rounded-xl px-4 py-2.5 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4', width: '220px' }}
                  />
                </div>

                {canBroadcast && activeCustomers.length > 0 && (
                  <div
                    className="flex items-center gap-3 border-t px-5 py-3"
                    style={{ borderColor: 'rgba(255,255,255,0.04)' }}
                  >
                    <label className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: '#A0ABA4' }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded"
                      />
                      Select all
                    </label>
                    {selectedRecipients.length > 0 && (
                      <span className="text-xs" style={{ color: '#3ADB82' }}>
                        {selectedRecipients.length} selected
                      </span>
                    )}
                  </div>
                )}

                <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.03)' }}>
                  {customers.length === 0 && !customersQuery.isLoading && (
                    <p className="px-5 py-6 text-center text-sm" style={{ color: '#6B7F73' }}>No customers found</p>
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
              <div className="rounded-2xl p-6" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">Send WhatsApp</h2>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ background: '#1B4332', color: '#3ADB82' }}
                  >
                    {selectedRecipients.length} selected
                  </span>
                </div>

                {!canBroadcast && (
                  <p className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: '#141A15', color: '#6B7F73' }}>
                    Only Admin and Branch Manager can send messages.
                  </p>
                )}

                {canBroadcast && (
                  <div className="mt-4 space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold" style={{ color: '#6B7F73' }}>Quick templates</p>
                      {MESSAGE_TEMPLATES.map((t, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setBroadcastMessage(t)}
                          className="w-full rounded-xl px-3 py-2 text-left text-xs transition hover:brightness-110"
                          style={{ background: '#141A15', color: '#A0ABA4' }}
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
                      className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
                      style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                    />

                    <button
                      type="button"
                      onClick={() => { setPageError(''); broadcastMutation.mutate(); }}
                      disabled={broadcastMutation.isPending || selectedRecipients.length === 0 || !broadcastMessage.trim()}
                      className="w-full rounded-xl py-3 text-sm font-bold transition disabled:opacity-60 hover:brightness-110"
                      style={{ background: '#1B4332', color: '#3ADB82' }}
                    >
                      {broadcastMutation.isPending ? 'Preparing…' : 'Generate WhatsApp links'}
                    </button>

                    {broadcastStatus && (
                      <p className="rounded-xl px-4 py-3 text-xs" style={{ background: 'rgba(58,219,130,0.08)', color: '#3ADB82' }}>
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
                            className="flex items-center justify-between rounded-xl px-4 py-3 transition hover:brightness-110"
                            style={{ background: '#141A15', border: '1px solid rgba(58,219,130,0.12)' }}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">{link.customerName}</p>
                              <p className="text-xs" style={{ color: '#6B7F73' }}>{link.phone}</p>
                            </div>
                            <span className="shrink-0 text-xs font-bold" style={{ color: '#3ADB82' }}>
                              Open ↗
                            </span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <h2 className="text-lg font-bold text-white">Delete customer?</h2>
            <p className="mt-2 text-sm" style={{ color: '#A0ABA4' }}>
              <strong className="text-white">{deletingCustomer.name}</strong> will be removed from all lists. This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deletingCustomer.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-60"
                style={{ background: 'rgba(239,68,68,0.2)', color: '#F87171' }}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => setDeletingCustomer(null)}
                className="flex-1 rounded-xl py-3 text-sm font-semibold"
                style={{ background: '#1A2420', color: '#A0ABA4' }}
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
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 text-left"
      >
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
            <p className="truncate font-semibold text-white">{customer.name}</p>
            <p className="truncate text-xs" style={{ color: '#6B7F73' }}>
              {customer.whatsappNumber ?? customer.phone}
            </p>
          </div>
          <svg
            className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            style={{ color: '#6B7F73' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div
          className="border-t px-5 py-4 space-y-3"
          style={{ borderColor: 'rgba(255,255,255,0.04)', background: '#0A100C' }}
        >
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs" style={{ color: '#6B7F73' }}>WhatsApp</p>
              <p className="font-medium text-white">{customer.whatsappNumber ?? customer.phone ?? '—'}</p>
            </div>
            {customer.email && (
              <div>
                <p className="text-xs" style={{ color: '#6B7F73' }}>Email</p>
                <p className="font-medium text-white">{customer.email}</p>
              </div>
            )}
          </div>
          {canManage && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ background: '#1A2E25', color: '#3ADB82' }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}
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
