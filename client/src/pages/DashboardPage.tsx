import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';

const ugx = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

function getError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [openingCash, setOpeningCash] = useState('0');
  const [countedCash, setCountedCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [pageError, setPageError] = useState('');

  const canViewSales = ['Admin', 'Cashier', 'Branch Manager', 'Accountant'].includes(user?.role.name ?? '');
  const canCheckout = ['Admin', 'Cashier'].includes(user?.role.name ?? '');

  const todayQuery = useQuery({
    queryKey: ['pos-today-summary'],
    queryFn: () => api.pos.today(),
    enabled: canViewSales,
  });

  const shiftQuery = useQuery({
    queryKey: ['pos-current-shift'],
    queryFn: () => api.pos.currentShift(),
    enabled: canCheckout,
  });

  const productsQuery = useQuery({
    queryKey: ['pos-products-dashboard'],
    queryFn: () => api.pos.products({ search: '' }),
  });

  const refreshOps = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pos-today-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-current-shift'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-reports-today'] }),
    ]);

  const openShiftMutation = useMutation({
    mutationFn: () => api.pos.openShift(Number(openingCash)),
    onSuccess: async () => { setOpeningCash('0'); setPageError(''); await refreshOps(); },
    onError: (e) => setPageError(getError(e)),
  });

  const closeShiftMutation = useMutation({
    mutationFn: () => api.pos.closeShift({ countedCash: Number(countedCash), notes: closeNotes || null }),
    onSuccess: async () => { setCountedCash(''); setCloseNotes(''); setPageError(''); await refreshOps(); },
    onError: (e) => setPageError(getError(e)),
  });

  const currentShift = shiftQuery.data?.shift ?? null;
  const today = todayQuery.data;
  const products = productsQuery.data?.products ?? [];
  const lowStockProducts = products.filter((p) => p.lowStock && !p.isOutOfStock).slice(0, 6);
  const outOfStockCount = products.filter((p) => p.isOutOfStock).length;

  const totalSales = today?.totalSales ?? 0;
  const salesCount = today?.salesCount ?? 0;

  const paymentTotals = today?.paymentTotals;
  const mobileTotal = (paymentTotals?.mtnMobileMoney ?? 0) + (paymentTotals?.airtelMoney ?? 0);
  const digitalTotal = mobileTotal + (paymentTotals?.card ?? 0) + (paymentTotals?.bankTransfer ?? 0);

  const handleOpenShift = async (e: FormEvent) => {
    e.preventDefault();
    setPageError('');
    await openShiftMutation.mutateAsync();
  };

  const handleCloseShift = async (e: FormEvent) => {
    e.preventDefault();
    setPageError('');
    await closeShiftMutation.mutateAsync();
  };

  return (
    <div className="flex min-h-screen" style={{ background: '#0A0F0D', color: '#E2E8E4' }}>
      <Sidebar />

      <main className="flex-1 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl space-y-6">

          {/* Header */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: '#3ADB82' }}>
              Today at Evaya
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
              Welcome back, {user?.firstName}
            </h1>
            <p className="mt-1 text-sm" style={{ color: '#6B7F73' }}>
              Open up, sell smoothly, then close the day cleanly.
            </p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-800/40 bg-rose-900/30 px-4 py-3 text-sm text-rose-300">
              {pageError}
            </div>
          )}

          {/* KPI row */}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KPICard
              label="Sales today"
              value={ugx(totalSales)}
              sub={`${salesCount} receipts`}
              accent="#3ADB82"
            />
            <KPICard
              label="Cash"
              value={ugx(paymentTotals?.cash ?? 0)}
              sub="collected in cash"
            />
            <KPICard
              label="Mobile money"
              value={ugx(mobileTotal)}
              sub="MTN + Airtel"
              accent="#FFD100"
            />
            <KPICard
              label="Shift"
              value={currentShift ? 'Open' : 'Closed'}
              sub={currentShift ? 'Ready for checkout' : 'Open before selling'}
              accent={currentShift ? '#3ADB82' : '#F59E0B'}
            />
          </section>

          {/* Middle row */}
          <section className="grid gap-6 xl:grid-cols-[1fr_340px]">

            {/* Shift management */}
            <div
              className="rounded-2xl p-6"
              style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Shift management</h2>
                  <p className="mt-0.5 text-sm" style={{ color: '#6B7F73' }}>
                    Open, sell, then close.
                  </p>
                </div>
                <a
                  href="/pos"
                  className="rounded-xl px-4 py-2 text-sm font-bold text-white transition hover:brightness-110"
                  style={{ background: '#1B4332' }}
                >
                  Open POS
                </a>
              </div>

              {!canCheckout && (
                <p className="mt-5 rounded-xl bg-white/4 px-4 py-3 text-sm" style={{ color: '#6B7F73' }}>
                  Only Admin and Cashier can open or close shifts.
                </p>
              )}

              {canCheckout && !currentShift && (
                <form className="mt-5 space-y-3" onSubmit={handleOpenShift}>
                  <p className="text-sm font-semibold text-white">Open shift</p>
                  <input
                    type="number"
                    min="0"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    placeholder="Opening cash (UGX)"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                    required
                  />
                  <button
                    type="submit"
                    disabled={openShiftMutation.isPending}
                    className="w-full rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-60"
                    style={{ background: '#1B4332', color: '#3ADB82' }}
                  >
                    {openShiftMutation.isPending ? 'Opening…' : 'Open shift'}
                  </button>
                </form>
              )}

              {canCheckout && currentShift && (
                <form className="mt-5 space-y-3" onSubmit={handleCloseShift}>
                  <p className="text-sm font-semibold text-white">Close shift</p>
                  <div className="space-y-2 rounded-xl p-4" style={{ background: '#141A15' }}>
                    <ShiftRow label="Opened at" value={new Date(currentShift.openedAt).toLocaleTimeString('en-UG')} />
                    <ShiftRow label="Opening cash" value={ugx(currentShift.openingCash)} />
                    <ShiftRow
                      label="Expected cash"
                      value={ugx((currentShift.paymentTotals.cash ?? 0) + currentShift.openingCash)}
                      highlight
                    />
                    <ShiftRow
                      label="Digital"
                      value={ugx(
                        (currentShift.paymentTotals.mtnMobileMoney ?? 0) +
                        (currentShift.paymentTotals.airtelMoney ?? 0) +
                        (currentShift.paymentTotals.card ?? 0) +
                        (currentShift.paymentTotals.bankTransfer ?? 0),
                      )}
                    />
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                    placeholder="Counted cash (UGX)"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                    required
                  />
                  <textarea
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    rows={2}
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                  />
                  <button
                    type="submit"
                    disabled={closeShiftMutation.isPending}
                    className="w-full rounded-xl py-3 text-sm font-bold text-white/80 transition disabled:opacity-60"
                    style={{ background: '#1A2420' }}
                  >
                    {closeShiftMutation.isPending ? 'Closing…' : 'Close shift'}
                  </button>
                </form>
              )}
            </div>

            {/* Payment breakdown */}
            <div
              className="rounded-2xl p-6"
              style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}
            >
              <h2 className="text-lg font-bold text-white">Payment breakdown</h2>
              <p className="mt-0.5 text-sm" style={{ color: '#6B7F73' }}>Today's collection by method</p>

              <div className="mt-5 space-y-3">
                <PaymentBar
                  label="MTN Mobile Money"
                  amount={paymentTotals?.mtnMobileMoney ?? 0}
                  total={totalSales}
                  color="#FFD100"
                />
                <PaymentBar
                  label="Airtel Money"
                  amount={paymentTotals?.airtelMoney ?? 0}
                  total={totalSales}
                  color="#E4002B"
                />
                <PaymentBar
                  label="Cash"
                  amount={paymentTotals?.cash ?? 0}
                  total={totalSales}
                  color="#3ADB82"
                />
                <PaymentBar
                  label="Bank Card"
                  amount={paymentTotals?.card ?? 0}
                  total={totalSales}
                  color="#60A5FA"
                />
                <PaymentBar
                  label="Bank Transfer"
                  amount={paymentTotals?.bankTransfer ?? 0}
                  total={totalSales}
                  color="#A78BFA"
                />
              </div>

              <div
                className="mt-5 flex items-center justify-between rounded-xl px-4 py-3"
                style={{ background: '#141A15' }}
              >
                <span className="text-sm" style={{ color: '#6B7F73' }}>Total</span>
                <span className="font-mono-nums text-base font-black text-white">{ugx(totalSales)}</span>
              </div>

              {totalSales > 0 && (
                <p className="mt-3 text-xs" style={{ color: '#6B7F73' }}>
                  Digital {((digitalTotal / totalSales) * 100).toFixed(0)}% · Cash{' '}
                  {(((paymentTotals?.cash ?? 0) / totalSales) * 100).toFixed(0)}%
                </p>
              )}
            </div>
          </section>

          {/* Low stock alerts */}
          {(lowStockProducts.length > 0 || outOfStockCount > 0) && (
            <section
              className="rounded-2xl p-6"
              style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Stock alerts</h2>
                  <p className="mt-0.5 text-sm" style={{ color: '#6B7F73' }}>
                    Products that need attention
                  </p>
                </div>
                {outOfStockCount > 0 && (
                  <span className="rounded-full bg-rose-900/50 px-3 py-1 text-xs font-semibold text-rose-400">
                    {outOfStockCount} out of stock
                  </span>
                )}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {lowStockProducts.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl px-4 py-3"
                    style={{ background: '#141A15', border: '1px solid rgba(245,158,11,0.15)' }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                      <p className="text-xs" style={{ color: '#6B7F73' }}>{p.categoryName}</p>
                    </div>
                    <span className="ml-3 shrink-0 rounded-full bg-amber-900/50 px-2.5 py-0.5 text-xs font-bold text-amber-400">
                      {p.availableQuantity} left
                    </span>
                  </div>
                ))}
              </div>

              <a
                href="/inventory"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold transition hover:underline"
                style={{ color: '#3ADB82' }}
              >
                View inventory
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}

// ──────────── sub-components ────────────

function KPICard({
  label,
  value,
  sub,
  accent = '#6B7F73',
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>
        {label}
      </p>
      <p className="mt-2 font-mono-nums text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs" style={{ color: '#6B7F73' }}>{sub}</p>
    </div>
  );
}

function ShiftRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: '#6B7F73' }}>{label}</span>
      <span
        className="font-mono-nums text-sm font-semibold"
        style={{ color: highlight ? '#3ADB82' : '#E2E8E4' }}
      >
        {value}
      </span>
    </div>
  );
}

function PaymentBar({
  label,
  amount,
  total,
  color,
}: {
  label: string;
  amount: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: '#A0ABA4' }}>{label}</span>
        <span className="font-mono-nums text-xs font-semibold" style={{ color: '#E2E8E4' }}>
          {ugx(amount)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: '#1A2420' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
