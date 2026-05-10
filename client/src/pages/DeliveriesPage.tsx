import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../hooks/useAuth';
import { api, ApiError } from '../services/api';

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
  pending: 'bg-amber-900/30 text-amber-400',
  assigned: 'bg-blue-900/30 text-blue-400',
  picked_up: 'bg-purple-900/30 text-purple-400',
  delivered: 'bg-emerald-900/30 text-[#3ADB82]',
  failed: 'bg-rose-900/30 text-rose-400',
  cancelled: 'bg-slate-800 text-slate-400',
};

const currencyFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0,
});

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'assigned' },
  { label: 'Picked Up', value: 'picked_up' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' },
];

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
    <div className="flex min-h-screen" style={{ background: '#0A0F0D', color: '#e2e8f0' }}>
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-24 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-4xl space-y-6">

          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#3ADB82]/70">Deliveries</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-100">Deliveries</h1>
            </div>
            {isManager && (
              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className="rounded-xl px-4 py-2 text-sm font-medium transition"
                style={{ background: '#1B4332', color: '#3ADB82' }}
              >
                {showForm ? 'Cancel' : '+ New delivery'}
              </button>
            )}
          </div>

          {pageError && (
            <div className="rounded-xl border border-rose-800/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-400">
              {pageError}
            </div>
          )}

          {isManager && showForm && (
            <div className="rounded-2xl p-6" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="text-base font-semibold text-slate-100">New Delivery</h2>
              <form className="mt-4 grid gap-3" onSubmit={handleSubmit}>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
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
                  className="rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                />

                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Delivery address"
                  rows={2}
                  className="rounded-xl px-4 py-3 text-sm outline-none resize-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                  required
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="number"
                    min="0"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                    placeholder="Extra charge"
                    className="rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                  />
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                    required
                  />
                </div>

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes (optional)"
                  className="rounded-xl px-4 py-3 text-sm outline-none resize-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                />

                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-xl py-3 text-sm font-medium transition disabled:opacity-60"
                  style={{ background: '#1B4332', color: '#3ADB82' }}
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
                className="rounded-xl px-4 py-2 text-sm font-medium transition"
                style={{
                  background: statusFilter === tab.value ? '#1B4332' : '#0D1610',
                  color: statusFilter === tab.value ? '#3ADB82' : '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {deliveriesQuery.isLoading && (
              <div className="rounded-2xl px-4 py-8 text-center text-sm text-slate-500" style={{ background: '#0D1610' }}>
                Loading deliveries…
              </div>
            )}
            {!deliveriesQuery.isLoading && deliveries.length === 0 && (
              <div className="rounded-2xl px-4 py-8 text-center text-sm text-slate-500" style={{ background: '#0D1610', border: '1px dashed rgba(255,255,255,0.08)' }}>
                No deliveries for this filter.
              </div>
            )}
            {deliveries.map((delivery) => {
              const status = delivery.status as DeliveryStatus;
              const isEditingNotes = editingNotesId === delivery.id;
              return (
                <div key={delivery.id} className="rounded-2xl p-5" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-100">{delivery.customerName}</p>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[status] ?? 'bg-slate-800 text-slate-400'}`}>
                          {statusLabels[status] ?? delivery.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-400">{delivery.customerPhone}</p>
                      <p className="mt-2 text-sm text-slate-300">{delivery.deliveryAddress}</p>
                      {delivery.receiptReference && (
                        <p className="mt-1 text-xs text-slate-500">Receipt: {delivery.receiptReference}</p>
                      )}
                      {delivery.deliveryDate && (
                        <p className="mt-1 text-xs text-slate-500">
                          {new Date(delivery.deliveryDate).toLocaleDateString()}
                        </p>
                      )}

                      {isEditingNotes ? (
                        <div className="mt-3 flex gap-2">
                          <textarea
                            value={editingNotesValue}
                            onChange={(e) => setEditingNotesValue(e.target.value)}
                            rows={2}
                            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none resize-none"
                            style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.10)', color: '#e2e8f0' }}
                          />
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => updateMutation.mutate({ id: delivery.id, payload: { notes: editingNotesValue || null } })}
                              disabled={updateMutation.isPending}
                              className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                              style={{ background: '#1B4332', color: '#3ADB82' }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingNotesId(''); setEditingNotesValue(''); }}
                              className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                              style={{ background: '#141A15' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-start gap-2">
                          <p className="text-sm text-slate-500 italic">{delivery.notes || 'No notes'}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNotesId(delivery.id);
                              setEditingNotesValue(delivery.notes ?? '');
                            }}
                            className="shrink-0 text-xs text-slate-500 underline hover:text-slate-300"
                          >
                            edit
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-3">
                      <p className="text-lg font-semibold text-[#3ADB82]">{currencyFormatter.format(delivery.deliveryFee)}</p>
                      <select
                        value={delivery.status}
                        onChange={(e) => updateMutation.mutate({ id: delivery.id, payload: { status: e.target.value } })}
                        className="rounded-xl px-3 py-2 text-sm outline-none"
                        style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
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
