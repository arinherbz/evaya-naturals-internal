import { FormEvent, useDeferredValue, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Search, ChevronDown, X, AlertTriangle, MessageCircle } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../hooks/useAuth';
import { api, ApiError } from '../services/api';
import type { BroadcastLink, Customer } from '../types';
import { EmptyState, DestructiveModal } from './ProductsPage';

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

const iCls = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10';

export default function CustomersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
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
        ? api.pos.updateCustomer(editingCustomer.id, { name, phone, whatsappNumber: phone || null, email: email || null })
        : api.pos.createCustomer({ name, phone, whatsappNumber: phone || null, email: email || null, isActive: true });
    },
    onSuccess: async () => {
      setEditingCustomer(null);
      setShowCustomerModal(false);
      resetForm();
      setPageError('');
      await refreshCustomers();
    },
    onError: (e) => setPageError(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.pos.deleteCustomer(id),
    onSuccess: async () => {
      setSelectedRecipients((cur) => cur.filter((id) => id !== deletingCustomer?.id));
      setDeletingCustomer(null);
      setPageError('');
      await refreshCustomers();
    },
    onError: (e) => { setPageError(getErrorMessage(e)); setDeletingCustomer(null); },
  });

  const broadcastMutation = useMutation({
    mutationFn: () => api.pos.createBroadcast({ customerIds: selectedRecipients, messageBody: broadcastMessage, channel: 'whatsapp' }),
    onSuccess: (payload) => {
      setBroadcastLinks(payload.links ?? []);
      setBroadcastStatus(payload.statusLabel ?? 'Links ready');
      setPageError('');
    },
    onError: (e) => setPageError(getErrorMessage(e)),
  });

  const customers = customersQuery.data?.customers ?? [];
  const activeCustomers = customers.filter((c) => c.isActive);

  function resetForm() { setName(''); setWhatsappNumber(''); setEmail(''); }

  const startEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setName(customer.name);
    setWhatsappNumber(customer.whatsappNumber ?? customer.phone ?? '');
    setEmail(customer.email ?? '');
    setExpandedId(customer.id);
    setShowCustomerModal(true);
  };

  const closeCustomerModal = () => {
    setShowCustomerModal(false);
    setEditingCustomer(null);
    resetForm();
    setPageError('');
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPageError('');
    await customerMutation.mutateAsync();
  };

  const toggleRecipient = (customerId: string) => {
    setBroadcastLinks([]); setBroadcastStatus('');
    setSelectedRecipients((cur) =>
      cur.includes(customerId) ? cur.filter((id) => id !== customerId) : [...cur, customerId],
    );
  };

  const toggleSelectAll = () => {
    setBroadcastLinks([]); setBroadcastStatus('');
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
      <main className="flex-1 px-4 pb-12 pt-[76px] sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl space-y-6">

          {/* Header */}
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
              <p className="mt-0.5 text-sm text-slate-400">Manage customer contacts and send messages.</p>
            </div>
            {canManageCustomers && (
              <button
                type="button"
                onClick={() => setShowCustomerModal(true)}
                className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ background: '#1B4332' }}
              >
                <Plus size={15} strokeWidth={2} />
                Add Customer
              </button>
            )}
          </div>

          {pageError && (
            <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" />
              {pageError}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">

            {/* Left: customer list */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Customer list
                  <span className="ml-2 font-normal text-slate-400">({activeCustomers.length})</span>
                </h2>
                <div className="relative ml-auto">
                  <Search size={14} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or WhatsApp…"
                    className="w-52 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-4 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10"
                  />
                </div>
              </div>

              {canBroadcast && activeCustomers.length > 0 && (
                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded" />
                    Select all
                  </label>
                  {selectedRecipients.length > 0 && (
                    <span className="rounded-md bg-[#1B4332]/8 px-2 py-0.5 text-xs font-semibold text-[#1B4332]">
                      {selectedRecipients.length} selected
                    </span>
                  )}
                </div>
              )}

              <div className="divide-y divide-slate-50">
                {customersQuery.isLoading && (
                  <div className="px-5 py-8 text-center text-sm text-slate-400">Loading…</div>
                )}
                {!customersQuery.isLoading && customers.length === 0 && (
                  <EmptyState icon={Users} text="No customers found" action={canManageCustomers ? { label: 'Add first customer', onClick: () => setShowCustomerModal(true) } : undefined} />
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

            {/* Right: broadcast */}
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle size={16} strokeWidth={1.75} className="text-slate-400" />
                  <h2 className="text-sm font-semibold text-slate-900">Send WhatsApp</h2>
                </div>
                {selectedRecipients.length > 0 && (
                  <span className="rounded-md bg-[#1B4332]/8 px-2 py-0.5 text-xs font-semibold text-[#1B4332]">
                    {selectedRecipients.length} selected
                  </span>
                )}
              </div>

              {!canBroadcast ? (
                <p className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  Only Admin and Branch Manager can send messages.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-400">Quick templates</p>
                    {MESSAGE_TEMPLATES.map((t, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setBroadcastMessage(t)}
                        className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 transition hover:bg-slate-100"
                      >
                        {t.slice(0, 60)}…
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={broadcastMessage}
                    onChange={(e) => { setBroadcastMessage(e.target.value); setBroadcastLinks([]); setBroadcastStatus(''); }}
                    rows={4}
                    placeholder="Type your message…"
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10"
                  />

                  <button
                    type="button"
                    onClick={() => { setPageError(''); broadcastMutation.mutate(); }}
                    disabled={broadcastMutation.isPending || selectedRecipients.length === 0 || !broadcastMessage.trim()}
                    className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ background: '#1B4332' }}
                  >
                    {broadcastMutation.isPending ? 'Preparing…' : 'Generate WhatsApp Links'}
                  </button>

                  {broadcastStatus && (
                    <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-[#1B4332]">
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
                          className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 transition hover:bg-emerald-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{link.customerName}</p>
                            <p className="text-xs text-slate-500">{link.phone}</p>
                          </div>
                          <span className="shrink-0 text-xs font-bold text-[#1B4332]">Open ↗</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Add / Edit customer modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                {editingCustomer ? `Edit: ${editingCustomer.name}` : 'New customer'}
              </h2>
              <button type="button" onClick={closeCustomerModal} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100" aria-label="Close">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            {pageError && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
                <AlertTriangle size={13} strokeWidth={1.75} className="shrink-0" />
                {pageError}
              </div>
            )}

            <form className="space-y-3" onSubmit={handleSubmit}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" className={iCls} required autoFocus />
              <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="WhatsApp number (e.g. 256700000000)" className={iCls} required />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" type="email" className={iCls} />
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={customerMutation.isPending} className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-60" style={{ background: '#1B4332' }}>
                  {customerMutation.isPending ? 'Saving…' : editingCustomer ? 'Save changes' : 'Add customer'}
                </button>
                <button type="button" onClick={closeCustomerModal} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingCustomer && (
        <DestructiveModal
          title="Delete customer?"
          description={<><strong className="text-slate-900">{deletingCustomer.name}</strong> will be removed from all lists. This cannot be undone.</>}
          confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deletingCustomer.id)}
          onCancel={() => setDeletingCustomer(null)}
        />
      )}
    </div>
  );
}

function CustomerRow({
  customer, expanded, onToggle, selected, onToggleSelect, canBroadcast, canManage, onEdit, onDelete,
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
      <button type="button" onClick={onToggle} className="w-full px-5 py-4 text-left transition hover:bg-slate-50/60">
        <div className="flex items-center gap-3">
          {canBroadcast && customer.isActive && (
            <label className="shrink-0" onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}>
              <input type="checkbox" checked={selected} onChange={onToggleSelect} className="h-4 w-4 rounded" onClick={(e) => e.stopPropagation()} />
            </label>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{customer.name}</p>
            <p className="truncate text-xs text-slate-400">{customer.whatsappNumber ?? customer.phone}</p>
          </div>
          <ChevronDown size={15} strokeWidth={1.75} className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
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
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={onEdit} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
                Edit
              </button>
              <button type="button" onClick={onDelete} className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-100">
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
