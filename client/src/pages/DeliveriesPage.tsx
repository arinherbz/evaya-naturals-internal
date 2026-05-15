import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck, Plus, AlertTriangle, X } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../hooks/useAuth';
import { api, ApiError } from '../services/api';
import { formatUGX as ugx } from '../lib/currency';
import { EmptyState } from './ProductsPage';

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

const deliveryStatusOptions = ['pending', 'assigned', 'picked_up', 'delivered', 'failed', 'cancelled'] as const;
type DeliveryStatus = (typeof deliveryStatusOptions)[number];

const statusLabels: Record<DeliveryStatus, string> = {
  pending: 'Pending',
  assigned: 'Confirmed',
  picked_up: 'Picked Up',
  delivered: 'Delivered',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const statusStyles: Record<DeliveryStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  assigned: 'bg-blue-50 text-blue-700 border border-blue-200',
  picked_up: 'bg-violet-50 text-violet-700 border border-violet-200',
  delivered: 'bg-emerald-50 text-[#1B4332] border border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border border-rose-200',
  cancelled: 'bg-slate-100 text-slate-500 border border-slate-200',
};

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'assigned' },
  { label: 'Picked Up', value: 'picked_up' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const iCls = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10';

export default function DeliveriesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [receiptReference, setReceiptReference] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [pageError, setPageError] = useState('');
  const [editingNotesId, setEditingNotesId] = useState('');
  const [editingNotesValue, setEditingNotesValue] = useState('');

  const isManager = ['Admin', 'Branch Manager'].includes(user?.role.name ?? '');

  const deliveriesQuery = useQuery({
    queryKey: ['deliveries', statusFilter],
    queryFn: () => api.pos.deliveries({ status: statusFilter || undefined }),
  });

  const supportQuery = useQuery({
    queryKey: ['delivery-support'],
    queryFn: () => api.pos.deliverySupport(),
  });

  const refreshOps = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
      queryClient.invalidateQueries({ queryKey: ['delivery-support'] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () => api.pos.createDelivery({
      customerId,
      receiptReference: receiptReference || null,
      deliveryAddress,
      riderId: null,
      deliveryFee: Number(deliveryFee || 0),
      deliveryDate,
      notes: notes || null,
    }),
    onSuccess: async () => {
      setCustomerId(''); setReceiptReference(''); setDeliveryAddress('');
      setDeliveryFee('0'); setDeliveryDate(new Date().toISOString().slice(0, 10));
      setNotes(''); setPageError(''); setShowForm(false);
      await refreshOps();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.pos.updateDelivery(id, payload),
    onSuccess: async () => {
      setPageError(''); setEditingNotesId(''); setEditingNotesValue('');
      await refreshOps();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await createMutation.mutateAsync();
  };

  const deliveries = deliveriesQuery.data?.deliveries ?? [];
  const customers = supportQuery.data?.customers ?? [];

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-12 pt-[76px] sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-4xl space-y-6">

          {/* Header */}
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Deliveries</h1>
              <p className="mt-0.5 text-sm text-slate-400">Track and manage customer deliveries.</p>
            </div>
            {isManager && (
              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  showForm ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'text-white hover:opacity-90'
                }`}
                style={showForm ? undefined : { background: '#1B4332' }}
              >
                {showForm ? (
                  <><X size={14} strokeWidth={2} />Cancel</>
                ) : (
                  <><Plus size={15} strokeWidth={2} />New Delivery</>
                )}
              </button>
            )}
          </div>

          {pageError && (
            <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" />
              {pageError}
            </div>
          )}

          {/* New delivery form */}
          {isManager && showForm && (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-900">New Delivery</h2>
              <form className="grid gap-3" onSubmit={handleSubmit}>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={iCls} required>
                  <option value="">Select customer</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
                </select>
                <input value={receiptReference} onChange={(e) => setReceiptReference(e.target.value)} placeholder="Receipt reference (optional)" className={iCls} />
                <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Delivery address" rows={2} className={`${iCls} resize-none`} required />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input type="number" min="0" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} placeholder="Extra charge" className={iCls} />
                  <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={iCls} required />
                </div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" className={`${iCls} resize-none`} />
                <button type="submit" disabled={createMutation.isPending} className="rounded-xl py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60" style={{ background: '#1B4332' }}>
                  {createMutation.isPending ? 'Creating…' : 'Create delivery'}
                </button>
              </form>
            </div>
          )}

          {/* Status tabs */}
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`rounded-lg px-3.5 py-2 text-xs font-medium transition ${
                  statusFilter === tab.value
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Deliveries list */}
          <div className="space-y-3">
            {deliveriesQuery.isLoading && (
              <div className="rounded-2xl border border-slate-100 bg-white px-4 py-8 text-center text-sm text-slate-400 shadow-sm">
                Loading deliveries…
              </div>
            )}
            {!deliveriesQuery.isLoading && deliveries.length === 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
                <EmptyState icon={Truck} text="No deliveries for this filter" />
              </div>
            )}
            {deliveries.map((delivery) => {
              const status = delivery.status as DeliveryStatus;
              const isEditingNotes = editingNotesId === delivery.id;
              return (
                <div key={delivery.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{delivery.customerName}</p>
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${statusStyles[status] ?? 'bg-slate-100 text-slate-500'}`}>
                          {statusLabels[status] ?? delivery.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{delivery.customerPhone}</p>
                      <p className="mt-2 text-sm text-slate-700">{delivery.deliveryAddress}</p>
                      {delivery.receiptReference && (
                        <p className="mt-1 text-xs text-slate-400">Receipt: {delivery.receiptReference}</p>
                      )}
                      {delivery.deliveryDate && (
                        <p className="mt-1 text-xs text-slate-400">
                          {new Date(delivery.deliveryDate).toLocaleDateString()}
                        </p>
                      )}

                      {isEditingNotes ? (
                        <div className="mt-3 flex gap-2">
                          <textarea
                            value={editingNotesValue}
                            onChange={(e) => setEditingNotesValue(e.target.value)}
                            rows={2}
                            className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10"
                          />
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => updateMutation.mutate({ id: delivery.id, payload: { notes: editingNotesValue || null } })}
                              disabled={updateMutation.isPending}
                              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                              style={{ background: '#1B4332' }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingNotesId(''); setEditingNotesValue(''); }}
                              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-start gap-2">
                          <p className="text-xs italic text-slate-400">{delivery.notes || 'No notes'}</p>
                          <button
                            type="button"
                            onClick={() => { setEditingNotesId(delivery.id); setEditingNotesValue(delivery.notes ?? ''); }}
                            className="shrink-0 text-xs text-slate-400 underline transition hover:text-slate-600"
                          >
                            edit
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-3">
                      <p className="text-base font-bold text-[#1B4332]">{ugx(delivery.deliveryFee)}</p>
                      <select
                        value={delivery.status}
                        onChange={(e) => updateMutation.mutate({ id: delivery.id, payload: { status: e.target.value } })}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10"
                      >
                        {deliveryStatusOptions.map((s) => (
                          <option key={s} value={s}>{statusLabels[s]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
