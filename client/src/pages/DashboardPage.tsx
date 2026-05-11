import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Receipt } from '../types';

const ugx = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

function getError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openingCash, setOpeningCash] = useState('0');
  const [countedCash, setCountedCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [pageError, setPageError] = useState('');
  const [showReceipts, setShowReceipts] = useState(false);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);

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

  const receiptQuery = useQuery({
    queryKey: ['receipt', selectedReceiptId],
    queryFn: () => api.pos.receipt(selectedReceiptId!),
    enabled: !!selectedReceiptId,
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

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />

      <main className="flex-1 px-4 pb-10 pt-24 sm:px-6 lg:px-8 lg:pt-6">
        <div className="mx-auto max-w-6xl space-y-6">

          {/* Header */}
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">
              Today at Evaya
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Welcome back, {user?.firstName}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Open up, sell smoothly, then close the day cleanly.
            </p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          {/* KPI row */}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KPICard
              label="Sales today"
              value={ugx(totalSales)}
              sub={`${salesCount} receipts`}
              onClick={() => navigate('/reports')}
            />
            <KPICard
              label="Receipts"
              value={String(salesCount)}
              sub="tap to view all"
              onClick={() => setShowReceipts(true)}
            />
            <KPICard
              label="Cash collected"
              value={ugx(paymentTotals?.cash ?? 0)}
              sub="cash payments"
              onClick={() => navigate('/reports')}
            />
            <KPICard
              label="Shift"
              value={currentShift ? 'Open' : 'Closed'}
              sub={currentShift ? 'Ready for checkout' : 'Open before selling'}
              onClick={() => navigate('/pos')}
            />
          </section>

          {/* Middle row */}
          <section className="grid gap-6 xl:grid-cols-[1fr_340px]">

            {/* Shift management */}
            <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Shift management</h2>
                  <p className="mt-0.5 text-sm text-slate-500">Open, sell, then close.</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/pos')}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Open POS
                </button>
              </div>

              {!canCheckout && (
                <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  Only Admin and Cashier can open or close shifts.
                </p>
              )}

              {canCheckout && !currentShift && (
                <form className="mt-5 space-y-3" onSubmit={handleOpenShift}>
                  <p className="text-sm font-semibold text-slate-900">Open shift</p>
                  <input
                    type="number"
                    min="0"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    placeholder="Opening cash (UGX)"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                  <button
                    type="submit"
                    disabled={openShiftMutation.isPending}
                    className="w-full rounded-full bg-slate-900 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {openShiftMutation.isPending ? 'Opening…' : 'Open shift'}
                  </button>
                </form>
              )}

              {canCheckout && currentShift && (
                <form className="mt-5 space-y-3" onSubmit={handleCloseShift}>
                  <p className="text-sm font-semibold text-slate-900">Close shift</p>
                  <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
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
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                  <textarea
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    rows={2}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={closeShiftMutation.isPending}
                    className="w-full rounded-full border border-slate-200 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {closeShiftMutation.isPending ? 'Closing…' : 'Close shift'}
                  </button>
                </form>
              )}
            </div>

            {/* Quick View — Sales & Cash only */}
            <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <h2 className="text-xl font-semibold text-slate-900">Quick View</h2>
              <p className="mt-0.5 text-sm text-slate-500">Today's summary</p>

              <div className="mt-5 space-y-4">
                <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700/70">Sales</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{ugx(totalSales)}</p>
                  <p className="mt-1 text-xs text-slate-500">{salesCount} receipts today</p>
                </div>

                <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-700/70">Cash</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{ugx(paymentTotals?.cash ?? 0)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {totalSales > 0
                      ? `${(((paymentTotals?.cash ?? 0) / totalSales) * 100).toFixed(0)}% of total`
                      : 'no sales yet'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/reports')}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                View full report
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </section>

          {/* Low stock alerts */}
          {(lowStockProducts.length > 0 || outOfStockCount > 0) && (
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Stock alerts</h2>
                  <p className="mt-0.5 text-sm text-slate-500">Products that need attention</p>
                </div>
                {outOfStockCount > 0 && (
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                    {outOfStockCount} out of stock
                  </span>
                )}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {lowStockProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.categoryName}</p>
                    </div>
                    <span className="ml-3 shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                      {p.availableQuantity} left
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => navigate('/inventory')}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 transition hover:underline"
              >
                View inventory
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </section>
          )}

        </div>
      </main>

      {/* Receipts list modal */}
      {showReceipts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="relative flex h-[80vh] w-full max-w-lg flex-col rounded-[28px] border border-white/70 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Today's receipts</h2>
                <p className="text-xs text-slate-500">{salesCount} sales</p>
              </div>
              <button type="button" onClick={() => { setShowReceipts(false); setSelectedReceiptId(null); }} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {todayQuery.isLoading && <p className="py-8 text-center text-sm text-slate-400">Loading…</p>}
              {!todayQuery.isLoading && (today?.sales ?? []).length === 0 && <p className="py-8 text-center text-sm text-slate-400">No sales today</p>}
              <div className="space-y-2">
                {(today?.sales ?? []).map((sale) => (
                  <button key={sale.id} type="button" onClick={() => setSelectedReceiptId(sale.id)}
                    className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-emerald-700">{sale.receiptNumber}</span>
                      <span className="text-sm font-bold text-slate-900">{ugx(sale.total)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs capitalize text-slate-500">{sale.paymentMethod.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-slate-400">{new Date(sale.createdAt).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receipt preview modal */}
      {selectedReceiptId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
          <div className="relative flex h-[90vh] w-full max-w-md flex-col rounded-[28px] border border-white/70 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">Receipt preview</h2>
              <button type="button" onClick={() => setSelectedReceiptId(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {receiptQuery.isLoading && <p className="py-8 text-center text-sm text-slate-400">Loading receipt…</p>}
              {receiptQuery.data?.receipt && <ReceiptPreview receipt={receiptQuery.data.receipt} />}
            </div>
            <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
              <button type="button" onClick={handlePrintReceipt} className="flex-1 rounded-full bg-slate-900 py-3 text-sm font-medium text-white transition hover:bg-slate-800">Print</button>
              <button type="button" onClick={() => setSelectedReceiptId(null)} className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Print-only receipt */}
      {receiptQuery.data?.receipt && (
        <div className="print-only">
          <ReceiptPreview receipt={receiptQuery.data.receipt} printMode />
        </div>
      )}
    </div>
  );
}

function ReceiptPreview({ receipt, printMode = false }: { receipt: Receipt; printMode?: boolean }) {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

  if (printMode) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 font-mono text-sm text-slate-800">
      <div className="text-center">
        <p className="text-base font-black tracking-wider text-emerald-700">EVAYA NATURALS</p>
        <p className="text-xs text-slate-500">{receipt.branchName}</p>
        <p className="mt-1 text-xs text-slate-500">
          {new Date(receipt.createdAt).toLocaleString('en-UG')}
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-600">{receipt.receiptNumber}</p>
      </div>

      <div className="my-3 border-t border-slate-200" />

      {receipt.customerName && (
        <div className="mb-3">
          <p className="text-xs text-slate-500">Customer: <span className="text-slate-800">{receipt.customerName}</span></p>
        </div>
      )}

      <div className="space-y-1.5">
        {receipt.items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs text-slate-800">{item.productName}</p>
              <p className="text-xs text-slate-500">
                {item.quantity} × {fmt(item.unitPrice)}
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-slate-800">{fmt(item.total)}</span>
          </div>
        ))}
      </div>

      <div className="my-3 border-t border-slate-200" />

      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Subtotal</span>
          <span className="text-slate-800">{fmt(receipt.subtotal)}</span>
        </div>
        {receipt.discount > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Discount</span>
            <span className="text-rose-600">-{fmt(receipt.discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-black">
          <span className="text-emerald-700">TOTAL</span>
          <span className="text-emerald-700">{fmt(receipt.total)}</span>
        </div>
      </div>

      <div className="my-3 border-t border-slate-200" />

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">Payment</span>
          <span className="capitalize text-slate-800">{receipt.paymentMethod.replace(/_/g, ' ')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Cashier</span>
          <span className="text-slate-800">{receipt.cashierName}</span>
        </div>
      </div>

      {receipt.receiptFooterMessage && (
        <>
          <div className="my-3 border-t border-slate-200" />
          <p className="text-center text-xs text-slate-500">{receipt.receiptFooterMessage}</p>
        </>
      )}
    </div>
  );
}

// ──────────── sub-components ────────────

function KPICard({
  label,
  value,
  sub,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[28px] border border-white/70 bg-white/90 p-5 text-left shadow-[0_20px_50px_rgba(15,23,42,0.05)] transition hover:shadow-md active:scale-[0.98]"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700/70">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </button>
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
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-emerald-700' : 'text-slate-900'}`}>
        {value}
      </span>
    </div>
  );
}
