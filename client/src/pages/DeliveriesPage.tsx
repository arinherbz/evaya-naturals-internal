import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import BrandMark from '../components/BrandMark';
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

const currencyFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0,
});

export default function DeliveriesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [receiptReference, setReceiptReference] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [riderId, setRiderId] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [pageError, setPageError] = useState('');

  const isManager = ['Admin', 'Branch Manager'].includes(user?.role.name ?? '');
  const isRider = user?.role.name === 'Delivery Rider';

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
      riderId: riderId || null,
      deliveryFee: Number(deliveryFee || 0),
      deliveryDate,
      notes: notes || null,
    }),
    onSuccess: async () => {
      setCustomerId('');
      setReceiptReference('');
      setDeliveryAddress('');
      setRiderId('');
      setDeliveryFee('0');
      setDeliveryDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setPageError('');
      await refreshOps();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.pos.updateDelivery(id, payload),
    onSuccess: async () => {
      setPageError('');
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
  const riders = supportQuery.data?.riders ?? [];
  const customers = supportQuery.data?.customers ?? [];

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-6 pt-24 sm:px-6 lg:px-8 lg:pt-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <BrandMark />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Deliveries</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Simple delivery tracking for the active branch</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Create deliveries, assign riders, update status, and keep the workflow light enough for daily use.
            </p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="space-y-6">
              {isManager && (
                <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                  <h2 className="text-xl font-semibold">Create delivery</h2>
                  <p className="mt-1 text-sm text-slate-500">Capture only what the team needs to fulfill the order.</p>
                  <form className="mt-5 grid gap-3" onSubmit={handleSubmit}>
                    <select
                      value={customerId}
                      onChange={(event) => setCustomerId(event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    >
                      <option value="">Select customer</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name} · {customer.phone}
                        </option>
                      ))}
                    </select>
                    <input
                      value={receiptReference}
                      onChange={(event) => setReceiptReference(event.target.value)}
                      placeholder="Receipt reference (optional)"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    />
                    <textarea
                      value={deliveryAddress}
                      onChange={(event) => setDeliveryAddress(event.target.value)}
                      placeholder="Delivery address"
                      rows={3}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        value={riderId}
                        onChange={(event) => setRiderId(event.target.value)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      >
                        <option value="">Assign rider later</option>
                        {riders.map((rider) => (
                          <option key={rider.id} value={rider.id}>{rider.firstName} {rider.lastName}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        value={deliveryFee}
                        onChange={(event) => setDeliveryFee(event.target.value)}
                        placeholder="Delivery fee (UGX)"
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        type="date"
                        value={deliveryDate}
                        onChange={(event) => setDeliveryDate(event.target.value)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                        required
                      />
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={2}
                        placeholder="Notes (optional)"
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={createMutation.isPending}
                      className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {createMutation.isPending ? 'Saving…' : 'Create delivery'}
                    </button>
                  </form>
                </div>
              )}

              {isRider && (
                <div className="rounded-[28px] border border-emerald-100 bg-emerald-50/70 p-6">
                  <h2 className="text-xl font-semibold text-emerald-900">Assigned to you only</h2>
                  <p className="mt-1 text-sm text-emerald-800">This view hides every delivery that is not assigned to your rider account.</p>
                </div>
              )}
            </section>

            <section className="space-y-6">
              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Delivery list</h2>
                    <p className="mt-1 text-sm text-slate-500">Filter by status and update the delivery flow in-place.</p>
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  >
                    <option value="">All statuses</option>
                    {deliveryStatusOptions.map((status) => (
                      <option key={status} value={status}>{status.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-5 space-y-3">
                  {deliveries.length === 0 && (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      No deliveries matched the current filter.
                    </div>
                  )}
                  {deliveries.map((delivery) => (
                    <div key={delivery.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-medium text-slate-900">{delivery.customerName}</p>
                            <p className="mt-1 text-sm text-slate-500">{delivery.customerPhone}</p>
                            <p className="mt-2 text-sm text-slate-600">{delivery.deliveryAddress}</p>
                            <p className="mt-2 text-xs text-slate-400">
                              {delivery.receiptReference ? `Receipt ${delivery.receiptReference} · ` : ''}
                              {delivery.deliveryDate ? new Date(delivery.deliveryDate).toLocaleDateString() : ''}
                            </p>
                            {delivery.notes && <p className="mt-2 text-sm text-slate-500">{delivery.notes}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700">
                              {delivery.status.replace('_', ' ')}
                            </span>
                            <span className="text-sm font-semibold text-slate-900">{currencyFormatter.format(delivery.deliveryFee)}</span>
                            <span className="text-xs text-slate-400">{delivery.riderName ?? 'Unassigned'}</span>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          {isManager && (
                            <select
                              defaultValue={delivery.riderId ?? ''}
                              onChange={(event) => updateMutation.mutate({
                                id: delivery.id,
                                payload: { riderId: event.target.value || null },
                              })}
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                            >
                              <option value="">Assign rider</option>
                              {riders.map((rider) => (
                                <option key={rider.id} value={rider.id}>{rider.firstName} {rider.lastName}</option>
                              ))}
                            </select>
                          )}
                          <select
                            defaultValue={delivery.status}
                            onChange={(event) => updateMutation.mutate({
                              id: delivery.id,
                              payload: { status: event.target.value },
                            })}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                          >
                            {deliveryStatusOptions.map((status) => (
                              <option key={status} value={status}>{status.replace('_', ' ')}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
