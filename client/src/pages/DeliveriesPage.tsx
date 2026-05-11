import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../hooks/useAuth';
import { api, ApiError } from '../services/api';
import { formatUGX as ugx } from '../lib/currency';

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

const deliveryStatusOptions = [
  'pending',
  'assigned',
  'picked_up',
  'delivered',
  'failed',
  'cancelled',
] as const;

type DeliveryStatus = (typeof deliveryStatusOptions)[number];

const statusLabels: Record<DeliveryStatus, string> = {
  pending: 'Pending',
  assigned: 'Confirmed',
  picked_up: 'Picked Up',
  delivered: 'Delivered',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const statusColors: Record<DeliveryStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  assigned: 'bg-blue-100 text-blue-700',
  picked_up: 'bg-violet-100 text-violet-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
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

const inputCls = 'rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400';

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
      setCustomerId('');
      setReceiptReference('');
      setDeliveryAddress('');
      setDeliveryFee('0');
      setDeliveryDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setPageError('');
      setShowForm(false);
      await refreshOps();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.pos.updateDelivery(id, payload),
    onSuccess: async () => {
      setPageError('');
      setEditingNotesId('');
      setEditingNotesValue('');
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
      <main className="flex-1 px-4 pb-10 pt-24 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-4xl space-y-6">

          <div className="flex items-start justify-between">
            <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)] flex-1 mr-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Deliveries</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">Deliveries</h1>
            </div>
            {isManager && (
              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className={`mt-1 rounded-full px-5 py-3 text-sm font-medium transition ${
                  showForm
                    ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {showForm ? 'Cancel' : '+ New delivery'}
              </button>
            )}
          </div>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          {isManager && showForm && (
            <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <h2 className="text-base font-semibold text-slate-900">New Delivery</h2>
              <form className="mt-4 grid gap-3" onSubmit={handleSubmit}>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className={inputCls}
                  required
                >
                  <option value="">Select customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>
                  ))}
                </select>

                <input
                  value={receiptReference}
                  onChange={(e) => setReceiptReference(e.target.value)}
                  placeholder="Receipt reference (optional)"
                  className={inputCls}
                />

                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Delivery address"
                  rows={2}
                  className={`${inputCls} resize-none`}
                  required
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="number"
                    min="0"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                    placeholder="Extra charge"
                    className={inputCls}
                  />
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className={inputCls}
                    required
                  />
                </div>

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes (optional)"
                  className={`${inputCls} resize-none`}
                />

                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-full bg-slate-900 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {createMutation.isPending ? 'Saving…' : 'Create delivery'}
                </button>
              </form>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  statusFilter === tab.value
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {deliveriesQuery.isLoading && (
              <div className="rounded-[28px] border border-white/70 bg-white/90 px-4 py-8 text-center text-sm text-slate-400">
                Loading deliveries…
              </div>
            )}
            {!deliveriesQuery.isLoading && deliveries.length === 0 && (
              <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center text-sm text-slate-400">
                No deliveries for this filter.
              </div>
            )}
            {deliveries.map((delivery) => {
              const status = delivery.status as DeliveryStatus;
              const isEditingNotes = editingNotesId === delivery.id;
              return (
                <div key={delivery.id} className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{delivery.customerName}</p>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[status] ?? 'bg-slate-100 text-slate-500'}`}>
                          {statusLabels[status] ?? delivery.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{delivery.customerPhone}</p>
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
                            className="flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-400"
                          />
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => updateMutation.mutate({ id: delivery.id, payload: { notes: editingNotesValue || null } })}
                              disabled={updateMutation.isPending}
                              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingNotesId(''); setEditingNotesValue(''); }}
                              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-200"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-start gap-2">
                          <p className="text-sm italic text-slate-400">{delivery.notes || 'No notes'}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNotesId(delivery.id);
                              setEditingNotesValue(delivery.notes ?? '');
                            }}
                            className="shrink-0 text-xs text-slate-400 underline transition hover:text-slate-600"
                          >
                            edit
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-3">
                      <p className="text-lg font-semibold text-emerald-700">{ugx(delivery.deliveryFee)}</p>
                      <select
                        value={delivery.status}
                        onChange={(e) => updateMutation.mutate({ id: delivery.id, payload: { status: e.target.value } })}
                        className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-400"
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
