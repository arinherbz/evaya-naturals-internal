import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, CreditCard, DollarSign, Banknote,
  Truck, Receipt as ReceiptIcon, AlertTriangle, ChevronRight,
  ArrowUpRight, X,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { formatUGX as ugx } from '../lib/currency';
import type { Receipt } from '../types';

function getError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
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
  const [receiptFilter, setReceiptFilter] = useState<'shift' | 'today' | 'week' | 'month'>('shift');

  const canViewSales = ['Admin', 'Cashier', 'Branch Manager'].includes(user?.role.name ?? '');
  const canCheckout = ['Admin', 'Cashier'].includes(user?.role.name ?? '');

  const todayQuery = useQuery({
    queryKey: ['pos-today-summary'],
    queryFn: () => api.pos.today(),
    enabled: canViewSales,
    refetchInterval: 60_000,
  });

  const shiftQuery = useQuery({
    queryKey: ['pos-current-shift'],
    queryFn: () => api.pos.currentShift(),
    enabled: canCheckout,
    refetchInterval: 60_000,
  });

  const productsQuery = useQuery({
    queryKey: ['pos-products-dashboard'],
    queryFn: () => api.pos.products({ search: '' }),
    refetchInterval: 60_000,
  });

  const today = new Date().toISOString().slice(0, 10);
  const expensesQuery = useQuery({
    queryKey: ['expenses-today-dashboard'],
    queryFn: () => api.pos.expenses({ startDate: today, endDate: today }),
    refetchInterval: 60_000,
  });

  const deliveriesQuery = useQuery({
    queryKey: ['deliveries-dashboard'],
    queryFn: () => api.pos.deliveries(),
    refetchInterval: 60_000,
  });

  const receiptQuery = useQuery({
    queryKey: ['receipt', selectedReceiptId],
    queryFn: () => api.pos.receipt(selectedReceiptId!),
    enabled: !!selectedReceiptId,
  });

  const activeShiftId = shiftQuery.data?.shift?.id ?? null;
  const receiptsListQuery = useQuery({
    queryKey: ['pos-receipts', receiptFilter, activeShiftId],
    queryFn: () => {
      const now = new Date();
      if (receiptFilter === 'shift' && activeShiftId) {
        return api.pos.receipts({ shiftId: activeShiftId });
      }
      if (receiptFilter === 'today') {
        const d = now.toISOString().slice(0, 10);
        return api.pos.receipts({ startDate: d, endDate: d });
      }
      if (receiptFilter === 'week') {
        const start = new Date(now);
        start.setDate(now.getDate() - 6);
        return api.pos.receipts({ startDate: start.toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10) });
      }
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return api.pos.receipts({ startDate: start.toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10) });
    },
    enabled: showReceipts,
    refetchInterval: showReceipts ? 30_000 : false,
  });

  const refreshOps = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pos-today-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-current-shift'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-reports-today'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-receipts'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-products-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-inventory'] }),
    ]);

  const openShiftMutation = useMutation({
    mutationFn: () => api.pos.openShift(Number(openingCash)),
    onSuccess: async () => {
      setOpeningCash('0');
      setPageError('');
      setReceiptFilter('shift');
      await refreshOps();
    },
    onError: (e) => setPageError(getError(e)),
  });

  const closeShiftMutation = useMutation({
    mutationFn: () => api.pos.closeShift({ countedCash: Number(countedCash), notes: closeNotes || null }),
    onSuccess: async () => {
      setCountedCash('');
      setCloseNotes('');
      setPageError('');
      setReceiptFilter('today');
      await refreshOps();
    },
    onError: (e) => setPageError(getError(e)),
  });

  const currentShift = shiftQuery.data?.shift ?? null;
  const products = productsQuery.data?.products ?? [];
  const stockWatchProducts = products.filter((p) => p.lowStock || p.isOutOfStock);

  const todayData = todayQuery.data;
  const totalSales = todayData?.totalSales ?? 0;
  const salesCount = todayData?.salesCount ?? 0;
  const paymentTotals = todayData?.paymentTotals;

  const expensesTotal = (expensesQuery.data?.expenses ?? []).reduce((sum, e) => sum + e.amount, 0);
  const profit = totalSales - expensesTotal;
  const cashBalance = (paymentTotals?.cash ?? 0) + (currentShift?.openingCash ?? 0);
  const openOrders = (deliveriesQuery.data?.deliveries ?? []).filter((d) => ['pending', 'assigned'].includes(d.status)).length;
  const lowStockCount = products.filter((p) => p.lowStock || p.isOutOfStock).length;

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

  const handlePrintReceipt = () => { window.print(); };

  const dateLabel = new Date().toLocaleDateString('en-UG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />

      <main className="flex-1 px-4 pb-12 pt-[76px] sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl space-y-7">

          {/* ── Page header ── */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400">{dateLabel}</p>
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
                {getGreeting()}, {user?.firstName}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-1">
              {canCheckout && (
                currentShift ? (
                  <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    Shift open
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                    No shift open
                  </span>
                )
              )}
              <button
                type="button"
                onClick={() => navigate('/pos')}
                className="flex items-center gap-1 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
              >
                Open POS
                <ArrowUpRight size={13} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* ── Error banner ── */}
          {pageError && (
            <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle size={16} className="shrink-0" />
              <span className="flex-1">{pageError}</span>
              <button type="button" onClick={() => setPageError('')}>
                <X size={15} className="text-rose-400 hover:text-rose-600" />
              </button>
            </div>
          )}

          {/* ── Shift management + Payment overview ── */}
          <section className="grid gap-5 lg:grid-cols-5">

            {/* Shift management (3/5) */}
            <div className="lg:col-span-3 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Shift management</h2>
                  <p className="mt-0.5 text-xs text-slate-400">Open a shift to start selling, close it to reconcile.</p>
                </div>
              </div>

              {!canCheckout && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  Only Admin and Cashier can open or close shifts.
                </div>
              )}

              {canCheckout && !currentShift && (
                <form className="space-y-3" onSubmit={handleOpenShift}>
                  <label className="block text-xs font-medium text-slate-500">Opening cash (UGX)</label>
                  <input
                    type="number"
                    min="0"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10"
                    required
                  />
                  <button
                    type="submit"
                    disabled={openShiftMutation.isPending}
                    className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
                    style={{ background: '#1B4332' }}
                  >
                    {openShiftMutation.isPending ? 'Opening…' : 'Open shift'}
                  </button>
                </form>
              )}

              {canCheckout && currentShift && (
                <form className="space-y-3" onSubmit={handleCloseShift}>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 divide-y divide-slate-100">
                    <ShiftRow label="Opened at" value={new Date(currentShift.openedAt).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })} />
                    <ShiftRow label="Sales this shift" value={`${currentShift.saleCount ?? 0} receipts · ${ugx(currentShift.salesTotal ?? 0)}`} />
                    <ShiftRow label="Opening cash" value={ugx(currentShift.openingCash)} />
                    <ShiftRow label="Expected cash" value={ugx((currentShift.paymentTotals.cash ?? 0) + currentShift.openingCash)} highlight />
                    <ShiftRow
                      label="Digital payments"
                      value={ugx(
                        (currentShift.paymentTotals.mtnMobileMoney ?? 0) +
                        (currentShift.paymentTotals.airtelMoney ?? 0) +
                        (currentShift.paymentTotals.card ?? 0) +
                        (currentShift.paymentTotals.bankTransfer ?? 0),
                      )}
                    />
                  </div>
                  <label className="block text-xs font-medium text-slate-500">Counted cash (UGX)</label>
                  <input
                    type="number"
                    min="0"
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
                    required
                  />
                  <textarea
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder="Close notes (optional)"
                    rows={2}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
                  />
                  <button
                    type="submit"
                    disabled={closeShiftMutation.isPending}
                    className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {closeShiftMutation.isPending ? 'Closing…' : 'Close shift'}
                  </button>
                </form>
              )}
            </div>

            {/* Payment breakdown (2/5) */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Today's Overview</h2>
              <p className="mt-0.5 text-xs text-slate-400">Payment method breakdown</p>

              <div className="mt-5 space-y-0 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-semibold text-slate-700">Total Sales</span>
                  <span className="text-base font-bold text-slate-900">{ugx(totalSales)}</span>
                </div>
                <PayRow label="Cash" value={paymentTotals?.cash ?? 0} />
                <PayRow label="MTN MoMo" value={paymentTotals?.mtnMobileMoney ?? 0} />
                <PayRow label="Airtel Money" value={paymentTotals?.airtelMoney ?? 0} />
                <PayRow label="Bank Card" value={(paymentTotals?.card ?? 0) + (paymentTotals?.bankTransfer ?? 0)} />
              </div>

              <button
                type="button"
                onClick={() => navigate('/reports')}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Full report
                <ChevronRight size={13} strokeWidth={2} />
              </button>
            </div>
          </section>

          {/* ── KPI grid — 4 main metrics ── */}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KPICard
              label="Revenue Today"
              value={ugx(totalSales)}
              sub={`${salesCount} ${salesCount === 1 ? 'receipt' : 'receipts'}`}
              icon={TrendingUp}
              onClick={() => navigate('/reports')}
            />
            <KPICard
              label="Expenses Today"
              value={ugx(expensesTotal)}
              sub="recorded today"
              icon={CreditCard}
              onClick={() => navigate('/expenses')}
            />
            <KPICard
              label="Gross Profit"
              value={ugx(profit)}
              sub="revenue − expenses"
              icon={DollarSign}
              onClick={() => navigate('/reports')}
            />
            <KPICard
              label="Cash Balance"
              value={ugx(cashBalance)}
              sub="in drawer"
              icon={Banknote}
              onClick={() => navigate('/reports')}
            />
          </section>

          {/* ── KPI row — 3 operational metrics ── */}
          <section className="grid gap-3 sm:grid-cols-3">
            <KPICard
              label="Pending Deliveries"
              value={String(openOrders)}
              sub="awaiting dispatch"
              icon={Truck}
              onClick={() => navigate('/deliveries')}
            />
            <KPICard
              label="Receipts Today"
              value={String(salesCount)}
              sub="tap to view"
              icon={ReceiptIcon}
              onClick={() => setShowReceipts(true)}
            />
            <KPICard
              label="Stock to Review"
              value={String(lowStockCount)}
              sub="need attention"
              icon={AlertTriangle}
              accent={lowStockCount > 0}
              onClick={() => navigate('/inventory')}
            />
          </section>

          {/* ── Stock alerts ── */}
          {stockWatchProducts.length > 0 && (
            <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Stock to Review</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {stockWatchProducts.length} {stockWatchProducts.length === 1 ? 'item' : 'items'} need attention
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/inventory')}
                  className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                >
                  View inventory
                  <ChevronRight size={13} strokeWidth={2} />
                </button>
              </div>
              <div className="divide-y divide-slate-50">
                {stockWatchProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-3">
                    <p className="text-sm font-medium text-slate-800 truncate mr-4">{p.name}</p>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      p.isOutOfStock
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {p.isOutOfStock ? 'Out of stock' : `${p.availableQuantity} left`}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      </main>

      {/* ── Receipts list modal ── */}
      {showReceipts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="relative flex h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-100 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Receipts</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {receiptsListQuery.data?.receipts.length ?? 0} receipt{(receiptsListQuery.data?.receipts.length ?? 0) !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowReceipts(false); setSelectedReceiptId(null); }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex shrink-0 gap-1 border-b border-slate-100 px-4 py-2.5">
              {([
                { key: 'shift', label: 'This shift', disabled: !activeShiftId },
                { key: 'today', label: 'Today', disabled: false },
                { key: 'week', label: 'This week', disabled: false },
                { key: 'month', label: 'This month', disabled: false },
              ] as const).map(({ key, label, disabled }) => (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => setReceiptFilter(key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    receiptFilter === key
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {receiptsListQuery.isLoading && (
                <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
              )}
              {!receiptsListQuery.isLoading && (receiptsListQuery.data?.receipts ?? []).length === 0 && (
                <div className="py-12 text-center">
                  <ReceiptIcon size={28} className="mx-auto mb-2 text-slate-200" strokeWidth={1.25} />
                  <p className="text-sm text-slate-400">
                    {receiptFilter === 'shift' ? 'No receipts in this shift yet' : 'No receipts found'}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                {(receiptsListQuery.data?.receipts ?? []).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReceiptId(r.id)}
                    className="w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-200 hover:bg-white"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-emerald-700">{r.receiptNumber}</span>
                      <span className="text-sm font-bold text-slate-900">{ugx(r.total)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs capitalize text-slate-400">{r.paymentMethod.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(r.createdAt).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Receipt preview modal ── */}
      {selectedReceiptId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="relative flex h-[90vh] w-full max-w-md flex-col rounded-2xl border border-slate-100 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Receipt preview</h2>
              <button type="button" onClick={() => setSelectedReceiptId(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {receiptQuery.isLoading && <p className="py-8 text-center text-sm text-slate-400">Loading receipt…</p>}
              {receiptQuery.data?.receipt && <ReceiptPreview receipt={receiptQuery.data.receipt} />}
            </div>
            <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
              <button type="button" onClick={handlePrintReceipt} className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
                Print
              </button>
              <button type="button" onClick={() => setSelectedReceiptId(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptQuery.data?.receipt && (
        <div className="print-only">
          <ReceiptPreview receipt={receiptQuery.data.receipt} printMode />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────

function ReceiptPreview({ receipt, printMode = false }: { receipt: Receipt; printMode?: boolean }) {
  if (printMode) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 font-mono text-sm text-slate-800">
      <div className="text-center">
        <p className="text-base font-black tracking-wider text-[#1B4332]">EVAYA NATURALS</p>
        <p className="text-xs text-slate-500">{receipt.branchName}</p>
        <p className="mt-1 text-xs text-slate-500">{new Date(receipt.createdAt).toLocaleString('en-UG')}</p>
        <p className="mt-1 text-xs font-semibold text-slate-600">{receipt.receiptNumber}</p>
      </div>

      <div className="my-3 border-t border-dashed border-slate-300" />

      {receipt.customerName && (
        <p className="mb-3 text-xs text-slate-500">Customer: <span className="text-slate-800">{receipt.customerName}</span></p>
      )}

      <div className="space-y-1.5">
        {receipt.items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-slate-800">{item.productName}</p>
              <p className="text-xs text-slate-500">{item.quantity} × {ugx(item.unitPrice)}</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-slate-800">{ugx(item.total)}</span>
          </div>
        ))}
      </div>

      <div className="my-3 border-t border-dashed border-slate-300" />

      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Subtotal</span>
          <span>{ugx(receipt.subtotal)}</span>
        </div>
        {receipt.discount > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Discount</span>
            <span className="text-rose-600">-{ugx(receipt.discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-black">
          <span className="text-[#1B4332]">TOTAL</span>
          <span className="text-[#1B4332]">{ugx(receipt.total)}</span>
        </div>
      </div>

      <div className="my-3 border-t border-dashed border-slate-300" />

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">Payment</span>
          <span className="capitalize">{receipt.paymentMethod.replace(/_/g, ' ')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Cashier</span>
          <span>{receipt.cashierName}</span>
        </div>
      </div>

      {receipt.receiptFooterMessage && (
        <>
          <div className="my-3 border-t border-dashed border-slate-300" />
          <p className="text-center text-xs text-slate-500">{receipt.receiptFooterMessage}</p>
        </>
      )}
    </div>
  );
}

function KPICard({
  label, value, sub, icon: Icon, onClick, accent = false,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string; size?: number | string; strokeWidth?: number | string }>;
  onClick?: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-sm transition hover:border-slate-200 hover:shadow-md active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <div className={`rounded-lg p-1.5 ${accent ? 'bg-amber-50 text-amber-500' : 'bg-slate-50 text-slate-400'} transition group-hover:bg-slate-100`}>
          <Icon size={14} strokeWidth={1.75} />
        </div>
      </div>
      <p className={`mt-3 text-2xl font-bold tracking-tight ${accent && value !== '0' ? 'text-amber-600' : 'text-slate-900'}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
    </button>
  );
}

function ShiftRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs font-semibold ${highlight ? 'text-[#1B4332]' : 'text-slate-800'}`}>
        {value}
      </span>
    </div>
  );
}

function PayRow({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-semibold text-slate-800">{ugx(value)}</span>
    </div>
  );
}
