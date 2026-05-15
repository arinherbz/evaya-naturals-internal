import { useEffect, useRef, useState, useDeferredValue } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search, ShoppingCart, Minus, Plus, X, CheckCircle2,
  AlertTriangle, Printer, Zap,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import { enqueueSale } from '../lib/offlineQueue';
import { formatUGX as ugx } from '../lib/currency';
import Sidebar from '../components/Sidebar';
import type { PosProduct } from '../types';

const PAYMENT_OPTIONS = [
  { value: 'cash' as const, label: 'Cash' },
  { value: 'mtn_mobile_money' as const, label: 'MTN MoMo' },
  { value: 'airtel_money' as const, label: 'Airtel Money' },
  { value: 'bank_card' as const, label: 'Bank Card' },
];

type PaymentValue = (typeof PAYMENT_OPTIONS)[number]['value'];

interface CartLine {
  product: PosProduct;
  qty: number;
}

function getError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

export default function POSPage() {
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentValue>('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [notes, setNotes] = useState('');
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null);
  const [openingCash, setOpeningCash] = useState('');
  const [err, setErr] = useState('');
  const deferredSearch = useDeferredValue(search);
  const mobileSafeAreaBottom = 'calc(env(safe-area-inset-bottom, 0px) + 0.9rem)';

  const productsQuery = useQuery({
    queryKey: ['pos-products', deferredSearch],
    queryFn: () => api.pos.products({ search: deferredSearch }),
    refetchInterval: 30_000,
  });

  const shiftQuery = useQuery({
    queryKey: ['pos-current-shift'],
    queryFn: () => api.pos.currentShift(),
    refetchInterval: 30_000,
  });

  const settingsQuery = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => api.settings.public(),
  });

  const receiptQuery = useQuery({
    queryKey: ['pos-receipt', completedSaleId],
    queryFn: () => api.pos.receipt(completedSaleId!),
    enabled: !!completedSaleId,
  });

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pos-products'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-products-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-current-shift'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-today-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-reports-today'] }),
      queryClient.invalidateQueries({ queryKey: ['report-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-receipts'] }),
    ]);

  const openShiftMutation = useMutation({
    mutationFn: () => api.pos.openShift(Number(openingCash) || 0),
    onSuccess: async () => {
      setOpeningCash('');
      setErr('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pos-current-shift'] }),
        queryClient.invalidateQueries({ queryKey: ['pos-receipts'] }),
      ]);
    },
    onError: (e) => setErr(getError(e)),
  });

  const saleMutation = useMutation({
    mutationFn: () =>
      api.pos.createSale({
        customerId: null,
        quickCustomer: null,
        discount: 0,
        paymentMethod,
        paymentReference: paymentRef || null,
        notes: notes || null,
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.qty })),
      }),
    onSuccess: async (payload) => {
      setShowConfirm(false);
      setCompletedSaleId(payload.sale.id);
      setCart([]);
      setPaymentRef('');
      setNotes('');
      setErr('');
      await invalidate();
    },
    onError: async (e) => {
      if (!navigator.onLine) {
        const salePayload = {
          customerId: null,
          quickCustomer: null,
          discount: 0,
          paymentMethod,
          paymentReference: paymentRef || null,
          notes: notes || null,
          items: cart.map((l) => ({ productId: l.product.id, quantity: l.qty })),
        };
        await enqueueSale(salePayload);
        setShowConfirm(false);
        setCart([]);
        setPaymentRef('');
        setNotes('');
        setErr('Sale saved offline — will sync when connected');
      } else {
        setErr(getError(e));
      }
    },
  });

  const rawProducts = productsQuery.data?.products ?? [];
  const products = [...rawProducts].sort((a, b) => a.name.localeCompare(b.name));

  const currentShift = shiftQuery.data?.shift ?? null;
  const enabledMethods = PAYMENT_OPTIONS.filter(
    (o) => settingsQuery.data?.paymentMethods?.[o.value] ?? true,
  );

  const subtotal = cart.reduce((s, l) => s + l.product.sellingPrice * l.qty, 0);
  const cartTotal = subtotal;
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  const lowStockCartItems = cart.filter(
    (l) => l.product.availableQuantity > 0 && l.product.availableQuantity <= 5,
  );

  const addToCart = (product: PosProduct) => {
    if (!currentShift || product.isOutOfStock) return;
    setCart((c) => {
      const ex = c.find((l) => l.product.id === product.id);
      if (!ex) return [...c, { product, qty: 1 }];
      return c.map((l) =>
        l.product.id === product.id
          ? { ...l, qty: Math.min(l.qty + 1, l.product.availableQuantity) }
          : l,
      );
    });
    setSearch('');
    searchRef.current?.focus();
  };

  const setQty = (id: string, qty: number) => {
    if (qty <= 0) { setCart((c) => c.filter((l) => l.product.id !== id)); return; }
    const max = cart.find((l) => l.product.id === id)?.product.availableQuantity ?? qty;
    setCart((c) => c.map((l) => (l.product.id === id ? { ...l, qty: Math.min(qty, max) } : l)));
  };

  function printReceipt() {
    const receipt = receiptQuery.data?.receipt;
    if (!receipt) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title>
<style>
  body{font-family:monospace;margin:0;padding:20px;width:300px;font-size:12px}
  h1{font-size:16px;font-weight:bold;text-align:center;margin:0 0 4px}
  p{margin:2px 0;text-align:center;font-size:11px;color:#555}
  hr{border:none;border-top:1px dashed #999;margin:10px 0}
  table{width:100%;font-size:11px}
  td{padding:2px 0}
  td:last-child{text-align:right}
  .total{font-weight:bold;font-size:13px}
  .footer{text-align:center;font-size:10px;color:#777;margin-top:10px}
  @media print{body{padding:0}}
</style></head><body>
<h1>EVAYA NATURALS</h1>
<p>Receipt #${receipt.receiptNumber}</p>
<p>${new Date(receipt.createdAt).toLocaleString()}</p>
<p>Cashier: ${receipt.cashierName ?? ''}</p>
<hr>
<table>
${receipt.items.map((item) => `<tr><td>${item.productName} × ${item.quantity}</td><td>${ugx(item.total)}</td></tr>`).join('')}
</table>
<hr>
<table>
  <tr><td>Subtotal</td><td>${ugx(receipt.subtotal)}</td></tr>
  ${receipt.discount > 0 ? `<tr><td>Discount</td><td>-${ugx(receipt.discount)}</td></tr>` : ''}
  <tr class="total"><td>Total</td><td>${ugx(receipt.total)}</td></tr>
  <tr><td>Payment</td><td>${PAYMENT_OPTIONS.find((o) => o.value === receipt.paymentMethod)?.label ?? receipt.paymentMethod}</td></tr>
</table>
<hr>
<div class="footer">${receipt.receiptFooterMessage ?? 'Thank you for shopping with us!'}</div>
</body></html>`);
    win.document.close();
    win.print();
  }

  const receipt = receiptQuery.data?.receipt;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7]">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden pt-[60px] md:pt-0">

        {/* ── No-shift bar ── */}
        {!currentShift && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
              <span className="text-sm font-medium text-slate-600">No active shift</span>
              {err && <span className="ml-1 text-xs text-rose-500">{err}</span>}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="Opening cash (UGX)"
                style={{ fontSize: '16px' }}
                className="w-40 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-[#1B4332]/40 focus:ring-2 focus:ring-[#1B4332]/10"
              />
              <button
                type="button"
                onClick={() => { setErr(''); openShiftMutation.mutate(); }}
                disabled={openShiftMutation.isPending}
                style={{ background: '#1B4332', touchAction: 'manipulation' }}
                className="shrink-0 rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition disabled:opacity-60"
              >
                {openShiftMutation.isPending ? 'Opening…' : 'Open Shift'}
              </button>
            </div>
          </div>
        )}

        {/* ── Body: product grid + cart ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* ── LEFT: product search + grid ── */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

            {/* Search bar + shift status */}
            <div className="shrink-0 border-b border-black/5 bg-white px-4 py-3">
              {/* Mobile shift pills */}
              {currentShift && (
                <div className="mb-2.5 flex items-center gap-2 overflow-x-auto pb-1 md:hidden">
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    {new Date(currentShift.openedAt).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {currentShift.saleCount ?? 0} {(currentShift.saleCount ?? 0) === 1 ? 'sale' : 'sales'}
                  </span>
                  <span className="shrink-0 rounded-full bg-[#1B4332]/8 px-2.5 py-1 text-xs font-bold text-[#1B4332]">
                    {ugx(currentShift.salesTotal ?? 0)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="relative min-w-0 flex-1 max-w-sm">
                  <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const available = products.filter((p) => p.availableQuantity > 0);
                        if (available.length === 1) addToCart(available[0]);
                      }
                    }}
                    placeholder="Search products…"
                    style={{ fontSize: '16px' }}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10"
                  />
                </div>
                {/* Desktop shift pills */}
                {currentShift && (
                  <div className="hidden items-center gap-2 md:flex">
                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                      {new Date(currentShift.openedAt).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {currentShift.saleCount ?? 0} {(currentShift.saleCount ?? 0) === 1 ? 'sale' : 'sales'}
                    </span>
                    <span className="rounded-full bg-[#1B4332]/8 px-2.5 py-1 text-xs font-bold text-[#1B4332]">
                      {ugx(currentShift.salesTotal ?? 0)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Product grid */}
            <div className="flex-1 overflow-y-auto bg-[#f5f5f7] p-3 pb-28 lg:pb-3">
              {productsQuery.isLoading && (
                <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-400">
                  <Zap size={22} strokeWidth={1.5} className="animate-pulse" />
                  <p className="text-sm">Loading catalog…</p>
                </div>
              )}
              {!productsQuery.isLoading && products.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-2">
                  <Search size={24} strokeWidth={1.25} className="text-slate-300" />
                  <p className="text-sm text-slate-400">No products found</p>
                  {search && (
                    <button type="button" onClick={() => setSearch('')} className="text-xs text-emerald-700 hover:underline">
                      Clear search
                    </button>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => {
                  const inCart = cart.find((l) => l.product.id === product.id)?.qty ?? 0;
                  const qty = product.availableQuantity;
                  const disabled = !currentShift || product.isOutOfStock;
                  const isLow = qty > 0 && qty <= 5;

                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => addToCart(product)}
                      className={`relative flex flex-col rounded-xl border p-3 text-left transition select-none ${
                        inCart > 0
                          ? 'border-[#1B4332]/25 bg-[#1B4332]/5 shadow-sm ring-1 ring-[#1B4332]/15'
                          : disabled
                          ? 'cursor-not-allowed border-slate-100 bg-white opacity-40'
                          : 'border-white bg-white shadow-sm hover:border-slate-200 hover:shadow-md active:scale-[0.98]'
                      }`}
                    >
                      {/* Cart badge */}
                      {inCart > 0 && (
                        <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: '#1B4332' }}>
                          {inCart}
                        </span>
                      )}

                      <p className="pr-6 text-sm font-semibold leading-snug text-slate-900">{product.name}</p>

                      <div className="mt-auto flex items-end justify-between pt-2.5">
                        <span className={`text-[11px] font-medium ${
                          qty <= 0 ? 'text-rose-400' : isLow ? 'text-amber-500' : 'text-slate-400'
                        }`}>
                          {qty <= 0 ? 'Out' : isLow ? `${qty} left` : `${qty}`}
                        </span>
                        <span className="text-sm font-bold" style={{ color: '#1B4332' }}>
                          {ugx(product.sellingPrice)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── RIGHT: cart panel (desktop) ── */}
          <CartPanel
            cart={cart}
            total={cartTotal}
            notes={notes}
            currentShift={!!currentShift}
            err={err}
            isPending={saleMutation.isPending}
            onSetQty={setQty}
            onNotes={setNotes}
            onOpenConfirm={() => { setErr(''); setShowConfirm(true); }}
            onClose={() => setCartOpen(false)}
            isDesktop
          />
        </div>
      </div>

      {/* Mobile cart — persistent bottom bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 px-3 lg:hidden"
        style={{ paddingBottom: mobileSafeAreaBottom }}
      >
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          style={{ touchAction: 'manipulation', background: cartCount > 0 ? '#1B4332' : '#ffffff' }}
          className={`flex w-full items-center justify-between rounded-2xl px-4 py-3.5 shadow-2xl transition active:scale-[0.99] ${
            cartCount > 0
              ? 'text-white'
              : 'border border-slate-200 text-slate-700'
          }`}
        >
          <span className="flex items-center gap-3">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
              cartCount > 0 ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
              {cartCount}
            </span>
            <span className="text-left">
              <span className="block text-sm font-semibold">
                {cartCount > 0 ? 'View cart' : 'Open cart'}
              </span>
              <span className={`block text-xs ${cartCount > 0 ? 'text-white/80' : 'text-slate-400'}`}>
                {cartCount > 0 ? `${cartCount} ${cartCount === 1 ? 'item' : 'items'}` : 'No items yet'}
              </span>
            </span>
          </span>
          <span className={`text-sm font-bold ${cartCount > 0 ? 'text-white' : 'text-slate-700'}`}>
            {ugx(cartTotal)}
          </span>
        </button>
      </div>

      {/* Mobile cart bottom sheet */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close cart"
            className="absolute inset-0 bg-black/40"
            onClick={() => setCartOpen(false)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 flex max-h-[88dvh] min-h-[48dvh] flex-col rounded-t-3xl bg-white shadow-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="flex justify-center pt-2">
              <span className="h-1.5 w-12 rounded-full bg-slate-200" />
            </div>
            <CartPanel
              cart={cart}
              total={cartTotal}
              notes={notes}
              currentShift={!!currentShift}
              err={err}
              isPending={saleMutation.isPending}
              onSetQty={setQty}
              onNotes={setNotes}
              onOpenConfirm={() => { setCartOpen(false); setErr(''); setShowConfirm(true); }}
              onClose={() => setCartOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ── Sale confirmation modal ── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92dvh] w-full max-w-sm flex-col rounded-t-3xl bg-white shadow-2xl sm:max-h-[42rem] sm:rounded-2xl">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Confirm Sale</h2>
                <p className="text-xs text-slate-400 mt-0.5">Review and select payment method</p>
              </div>
              <button type="button" onClick={() => setShowConfirm(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Low stock warning */}
              {lowStockCartItems.length > 0 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" strokeWidth={1.75} />
                  <p className="text-xs text-amber-800">
                    Low stock: {lowStockCartItems.map((l) => `${l.product.name} (${l.product.availableQuantity} left)`).join(', ')}
                  </p>
                </div>
              )}

              {/* Walk-in customer */}
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <span className="text-xs font-medium text-slate-500">Customer</span>
                <span className="text-xs font-semibold text-slate-700">Walk-in</span>
              </div>

              {/* Cart summary */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 divide-y divide-slate-100">
                {cart.map((line) => (
                  <div key={line.product.id} className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-sm text-slate-700">{line.product.name} <span className="text-slate-400">×{line.qty}</span></span>
                    <span className="text-sm font-semibold text-slate-900">{ugx(line.product.sellingPrice * line.qty)}</span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between rounded-xl bg-[#1B4332]/5 px-4 py-3">
                <span className="text-sm font-semibold text-slate-900">Total</span>
                <span className="text-xl font-black text-[#1B4332]">{ugx(cartTotal)}</span>
              </div>

              {/* Payment method */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Payment method
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {enabledMethods.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPaymentMethod(opt.value)}
                      className={`rounded-xl border px-3 py-3 text-sm font-bold transition active:scale-95 ${
                        paymentMethod === opt.value
                          ? 'border-[#1B4332] bg-[#1B4332] text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transaction reference (non-cash only) */}
              {paymentMethod !== 'cash' && (
                <input
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="Transaction reference (optional)"
                  style={{ fontSize: '16px' }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10"
                />
              )}

              {err && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
                  <AlertTriangle size={13} className="shrink-0 text-rose-500" strokeWidth={1.75} />
                  <p className="text-xs text-rose-700">{err}</p>
                </div>
              )}
            </div>

            <div
              className="sticky bottom-0 flex gap-3 border-t border-slate-100 bg-white px-5 pt-4"
              style={{ paddingBottom: mobileSafeAreaBottom }}
            >
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saleMutation.isPending}
                onClick={() => { setErr(''); saleMutation.mutate(); }}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-50"
                style={{ background: '#1B4332' }}
              >
                {saleMutation.isPending ? 'Processing…' : `Charge ${ugx(cartTotal)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sale success modal ── */}
      {completedSaleId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">

            {/* Success header */}
            <div className="px-6 pt-6 pb-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: '#1B4332' }}>
                <CheckCircle2 size={28} strokeWidth={1.75} className="text-white" />
              </div>
              <h2 className="mt-3 text-xl font-bold text-slate-900">Sale Complete</h2>
              {receipt && (
                <p className="mt-0.5 font-mono text-xs text-slate-400">#{receipt.receiptNumber}</p>
              )}
            </div>

            {/* Receipt preview */}
            {receiptQuery.isLoading && (
              <p className="pb-4 text-center text-sm text-slate-400">Loading receipt…</p>
            )}
            {receipt && (
              <div className="mx-5 mb-4 max-h-48 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-4 font-mono text-xs">
                <div className="divide-y divide-slate-100">
                  {receipt.items.map((item) => (
                    <div key={item.productId} className="flex justify-between py-1.5">
                      <span className="text-slate-600">{item.productName} <span className="text-slate-400">×{item.quantity}</span></span>
                      <span className="font-semibold text-slate-800">{ugx(item.total)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 space-y-1 border-t border-dashed border-slate-300 pt-2">
                  {receipt.discount > 0 && (
                    <div className="flex justify-between text-slate-500">
                      <span>Discount</span><span>-{ugx(receipt.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>Total</span><span>{ugx(receipt.total)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Payment</span>
                    <span>{PAYMENT_OPTIONS.find((o) => o.value === receipt.paymentMethod)?.label ?? receipt.paymentMethod}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={printReceipt}
                disabled={!receipt}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <Printer size={15} strokeWidth={1.75} />
                Print
              </button>
              <button
                type="button"
                onClick={() => { setCompletedSaleId(null); searchRef.current?.focus(); }}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white"
                style={{ background: '#1B4332' }}
              >
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Cart panel
// ──────────────────────────────────────────────────────────────

interface CartPanelProps {
  cart: CartLine[];
  total: number;
  notes: string;
  currentShift: boolean;
  err: string;
  isPending: boolean;
  onSetQty: (id: string, qty: number) => void;
  onNotes: (v: string) => void;
  onOpenConfirm: () => void;
  onClose: () => void;
  isDesktop?: boolean;
}

function CartPanel({
  cart, total, notes, currentShift, err, isPending,
  onSetQty, onNotes, onOpenConfirm, onClose, isDesktop = false,
}: CartPanelProps) {
  const canCharge = currentShift && cart.length > 0 && !isPending;
  const mobileSafeAreaBottom = 'calc(env(safe-area-inset-bottom, 0px) + 0.85rem)';

  return (
    <div className={`flex h-full min-h-0 flex-col ${isDesktop ? 'hidden w-[320px] shrink-0 border-l border-slate-100 bg-white lg:flex' : 'bg-white'}`}>

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-900">Current Sale</h2>
          {cart.length > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: '#1B4332' }}>
              {cart.reduce((s, l) => s + l.qty, 0)}
            </span>
          )}
        </div>
        {!isDesktop && (
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Cart items */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-slate-300">
            <ShoppingCart size={30} strokeWidth={1.25} />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-400">No items yet</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50 px-4">
            {cart.map((line) => (
              <li key={line.product.id} className="py-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="flex-1 text-sm font-medium leading-snug text-slate-900">
                    {line.product.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => onSetQty(line.product.id, 0)}
                    className="shrink-0 rounded-md p-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-400"
                  >
                    <X size={13} strokeWidth={2} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSetQty(line.product.id, line.qty - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 active:scale-95"
                    >
                      <Minus size={12} strokeWidth={2} />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-slate-900">{line.qty}</span>
                    <button
                      type="button"
                      onClick={() => onSetQty(line.product.id, line.qty + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 active:scale-95"
                    >
                      <Plus size={12} strokeWidth={2} />
                    </button>
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#1B4332' }}>
                    {ugx(line.product.sellingPrice * line.qty)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div
        className="shrink-0 border-t border-slate-100 bg-white px-4 pt-3 space-y-2.5"
        style={{ paddingBottom: isDesktop ? '1rem' : mobileSafeAreaBottom }}
      >
        {/* Walk-in customer */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Customer</span>
          <span className="text-xs font-medium text-slate-600">Walk-in</span>
        </div>

        {/* Total */}
        <div className="flex items-center justify-between rounded-xl border border-[#1B4332]/15 bg-[#1B4332]/5 px-3 py-3">
          <span className="text-sm font-bold text-slate-900">Total</span>
          <span className="text-lg font-black" style={{ color: '#1B4332' }}>{ugx(total)}</span>
        </div>

        {/* Note */}
        <input
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          placeholder="Note (optional)"
          style={{ fontSize: '16px' }}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1B4332]/40 focus:bg-white"
        />

        {err && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
            <AlertTriangle size={12} className="shrink-0 text-rose-500" strokeWidth={1.75} />
            <p className="text-xs text-rose-700">{err}</p>
          </div>
        )}

        {/* Charge button */}
        <button
          type="button"
          disabled={!canCharge}
          onClick={onOpenConfirm}
          className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: canCharge ? '#1B4332' : '#94A3B8' }}
        >
          {isPending
            ? 'Processing…'
            : !currentShift
            ? 'Open a shift first'
            : cart.length === 0
            ? 'No items yet'
            : 'Review sale'}
        </button>
      </div>
    </div>
  );
}
