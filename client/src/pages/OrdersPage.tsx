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

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B' },
  assigned: { bg: 'rgba(96,165,250,0.12)', text: '#60A5FA' },
  picked_up: { bg: 'rgba(167,139,250,0.12)', text: '#A78BFA' },
  delivered: { bg: 'rgba(58,219,130,0.12)', text: '#3ADB82' },
  failed: { bg: 'rgba(239,68,68,0.12)', text: '#F87171' },
  cancelled: { bg: 'rgba(107,127,115,0.12)', text: '#6B7F73' },
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
    <div className="flex min-h-screen" style={{ background: '#0A0F0D', color: '#E2E8E4' }}>
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-4xl space-y-6">

          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: '#3ADB82' }}>Orders</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Orders</h1>
            <p className="mt-1 text-sm" style={{ color: '#6B7F73' }}>Track and manage all customer orders.</p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-800/40 bg-rose-900/30 px-4 py-3 text-sm text-rose-300">
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
                className="rounded-xl px-4 py-2 text-xs font-semibold transition"
                style={
                  activeTab === tab.key
                    ? { background: '#1B4332', color: '#3ADB82' }
                    : { background: '#141A15', color: '#6B7F73' }
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Orders list */}
          <div className="space-y-3">
            {deliveriesQuery.isLoading && (
              <p className="py-8 text-center text-sm" style={{ color: '#6B7F73' }}>Loading orders…</p>
            )}
            {!deliveriesQuery.isLoading && deliveries.length === 0 && (
              <p className="py-8 text-center text-sm" style={{ color: '#6B7F73' }}>No orders found</p>
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
  const colors = STATUS_COLORS[order.status] ?? { bg: 'rgba(107,127,115,0.12)', text: '#6B7F73' };
  const nextStatus = NEXT_STATUS[order.status];

  const statusLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 text-left"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <p className="truncate font-semibold text-white">{order.customerName}</p>
              <span
                className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{ background: colors.bg, color: colors.text }}
              >
                {statusLabel(order.status)}
              </span>
            </div>
            <p className="mt-1 truncate text-xs" style={{ color: '#6B7F73' }}>
              {order.deliveryAddress}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <p className="font-mono-nums text-sm font-bold" style={{ color: '#3ADB82' }}>
              {ugx(order.deliveryFee)}
            </p>
            <p className="text-xs" style={{ color: '#6B7F73' }}>
              {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('en-UG') : '—'}
            </p>
          </div>
        </div>
      </button>

      {expanded && (
        <div
          className="border-t px-5 py-4 space-y-3"
          style={{ borderColor: 'rgba(255,255,255,0.04)' }}
        >
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs" style={{ color: '#6B7F73' }}>Customer phone</p>
              <p className="font-medium text-white">{order.customerPhone ?? '—'}</p>
            </div>
            {order.receiptReference && (
              <div>
                <p className="text-xs" style={{ color: '#6B7F73' }}>Receipt</p>
                <p className="font-mono text-xs text-white">{order.receiptReference}</p>
              </div>
            )}
            <div>
              <p className="text-xs" style={{ color: '#6B7F73' }}>Delivery fee</p>
              <p className="font-mono-nums font-semibold text-white">{ugx(order.deliveryFee)}</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: '#6B7F73' }}>Status</p>
              <p className="font-semibold capitalize text-white">{statusLabel(order.status)}</p>
            </div>
          </div>

          {order.notes && (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{ background: '#141A15' }}
            >
              <p className="text-xs font-semibold" style={{ color: '#6B7F73' }}>Notes</p>
              <p className="mt-1 text-white">{order.notes}</p>
            </div>
          )}

          {nextStatus && (
            <button
              type="button"
              onClick={() => onAdvance(order.id, nextStatus)}
              disabled={advancing}
              className="w-full rounded-xl py-2.5 text-sm font-bold transition disabled:opacity-60 hover:brightness-110"
              style={{ background: '#1B4332', color: '#3ADB82' }}
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
                className="flex-1 rounded-xl py-2.5 text-xs font-semibold disabled:opacity-60"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}
              >
                Cancel order
              </button>
              <button
                type="button"
                onClick={() => onAdvance(order.id, 'failed')}
                disabled={advancing}
                className="flex-1 rounded-xl py-2.5 text-xs font-semibold disabled:opacity-60"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}
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
