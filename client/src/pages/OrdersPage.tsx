import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import type { Delivery } from '../types';

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'assigned', label: 'Confirmed' },
  { key: 'picked_up', label: 'Picked Up' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

type StatusKey = typeof STATUS_TABS[number]['key'];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  assigned: 'bg-blue-100 text-blue-700',
  picked_up: 'bg-violet-100 text-violet-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const ugx = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

function getError(e: unknown) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

const NEXT_STATUS: Record<string, string> = {
  pending: 'assigned',
  assigned: 'picked_up',
  picked_up: 'delivered',
};

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<StatusKey>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pageError, setPageError] = useState('');

  const deliveriesQuery = useQuery({
    queryKey: ['deliveries', activeTab === 'all' ? undefined : activeTab],
    queryFn: () => api.pos.deliveries(activeTab === 'all' ? undefined : { status: activeTab }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.pos.updateDelivery(id, { status }),
    onSuccess: async () => {
      setPageError('');
      await queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
    onError: (e) => setPageError(getError(e)),
  });

  const deliveries = deliveriesQuery.data?.deliveries ?? [];

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-4xl space-y-6">

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Orders</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Orders</h1>
            <p className="mt-1 text-sm text-slate-500">Track and manage all customer orders.</p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          {/* Status tabs */}
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  activeTab === tab.key
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Orders list */}
          <div className="space-y-3">
            {deliveriesQuery.isLoading && (
              <p className="py-8 text-center text-sm text-slate-400">Loading orders…</p>
            )}
            {!deliveriesQuery.isLoading && deliveries.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-400">No orders found</p>
            )}
            {deliveries.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                expanded={expandedId === order.id}
                onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
                onAdvance={(id, status) => updateMutation.mutate({ id, status })}
                advancing={updateMutation.isPending}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function OrderCard({
  order,
  expanded,
  onToggle,
  onAdvance,
  advancing,
}: {
  order: Delivery;
  expanded: boolean;
  onToggle: () => void;
  onAdvance: (id: string, status: string) => void;
  advancing: boolean;
}) {
  const colorCls = STATUS_COLORS[order.status] ?? 'bg-slate-100 text-slate-500';
  const nextStatus = NEXT_STATUS[order.status];

  const statusLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white/90 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
      <button type="button" onClick={onToggle} className="w-full px-5 py-4 text-left">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <p className="truncate font-semibold text-slate-900">{order.customerName}</p>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorCls}`}>
                {statusLabel(order.status)}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">{order.deliveryAddress}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <p className="text-sm font-bold text-emerald-700">{ugx(order.deliveryFee)}</p>
            <p className="text-xs text-slate-400">
              {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('en-UG') : '—'}
            </p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-400">Customer phone</p>
              <p className="font-medium text-slate-900">{order.customerPhone ?? '—'}</p>
            </div>
            {order.receiptReference && (
              <div>
                <p className="text-xs text-slate-400">Receipt</p>
                <p className="font-mono text-xs text-slate-900">{order.receiptReference}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-400">Delivery fee</p>
              <p className="font-semibold text-slate-900">{ugx(order.deliveryFee)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Status</p>
              <p className="font-semibold capitalize text-slate-900">{statusLabel(order.status)}</p>
            </div>
          </div>

          {order.notes && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
              <p className="text-xs font-semibold text-slate-400">Notes</p>
              <p className="mt-1 text-slate-700">{order.notes}</p>
            </div>
          )}

          {nextStatus && (
            <button
              type="button"
              onClick={() => onAdvance(order.id, nextStatus)}
              disabled={advancing}
              className="w-full rounded-full bg-slate-900 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {advancing ? 'Updating…' : `Mark as ${statusLabel(nextStatus)}`}
            </button>
          )}

          {(order.status !== 'delivered' && order.status !== 'failed' && order.status !== 'cancelled') && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onAdvance(order.id, 'cancelled')}
                disabled={advancing}
                className="flex-1 rounded-full bg-rose-50 py-2.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-60"
              >
                Cancel order
              </button>
              <button
                type="button"
                onClick={() => onAdvance(order.id, 'failed')}
                disabled={advancing}
                className="flex-1 rounded-full bg-amber-50 py-2.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
              >
                Mark failed
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
