import { useEffect, useRef, useState, useDeferredValue } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../services/api';
import { enqueueSale } from '../lib/offlineQueue';
import { formatUGX as ugx } from '../lib/currency';
import Sidebar from '../components/Sidebar';
import type { PosProduct } from '../types';

const PAYMENT_OPTIONS = [
  { value: 'cash' as const, label: 'Cash', bg: '#1B4332', color: '#FFFFFF' },
  { value: 'mtn_mobile_money' as const, label: 'MTN MoMo', bg: '#FFD100', color: '#1B1B1B' },
  { value: 'airtel_money' as const, label: 'Airtel Money', bg: '#E4002B', color: '#FFFFFF' },
  { value: 'bank_card' as const, label: 'Bank Card', bg: '#1E293B', color: '#FFFFFF' },
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
  const [discount, setDiscount] = useState('');
  const [cashOut, setCashOut] = useState('');
  const [notes, setNotes] = useState('');
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null);
  const [openingCash, setOpeningCash] = useState('');
  const [err, setErr] = useState('');
  const deferredSearch = useDeferredValue(search);

  const productsQuery = useQuery({
    queryKey: ['pos-products', deferredSearch],
    queryFn: () => api.pos.products({ search: deferredSearch }),
  });

  const shiftQuery = useQuery({
    queryKey: ['pos-current-shift'],
    queryFn: () => api.pos.currentShift(),
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
      queryClient.invalidateQueries({ queryKey: ['pos-current-shift'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-today-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-reports-today'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-inventory'] }),
    ]);

  const openShiftMutation = useMutation({
    mutationFn: () => api.pos.openShift(Number(openingCash) || 0),
    onSuccess: async () => { setOpeningCash(''); setErr(''); await invalidate(); },
    onError: (e) => setErr(getError(e)),
  });

  const saleMutation = useMutation({
    mutationFn: () =>
      api.pos.createSale({
        customerId: null,
        quickCustomer: null,
        discount: Number(discount || 0),
        paymentMethod,
        paymentReference: paymentRef || null,
        notes: notes || null,
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.qty })),
      }),
    onSuccess: async (payload) => {
      setShowConfirm(false);
      setCompletedSaleId(payload.sale.id);
      setCart([]);
      setDiscount('');
      setCashOut('');
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
          discount: Number(discount || 0),
          paymentMethod,
          paymentReference: paymentRef || null,
          notes: notes || null,
          items: cart.map((l) => ({ productId: l.product.id, quantity: l.qty })),
        };
        await enqueueSale(salePayload);
        setShowConfirm(false);
        setCart([]);
        setDiscount('');
        setCashOut('');
        setPaymentRef('');
        setNotes('');
        setErr('Sale saved offline — will sync when connected');
      } else {
        setErr(getError(e));
      }
    },
  });

  const rawProducts = productsQuery.data?.products ?? [];
  // In-stock products first (alphabetical within each group), out-of-stock last
  const products = [...rawProducts].sort((a, b) => {
    if (a.isOutOfStock !== b.isOutOfStock) return a.isOutOfStock ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  const currentShift = shiftQuery.data?.shift ?? null;
  const enabledMethods = PAYMENT_OPTIONS.filter(
    (o) => settingsQuery.data?.paymentMethods?.[o.value] ?? true,
  );

  const subtotal = cart.reduce((s, l) => s + l.product.sellingPrice * l.qty, 0);
  const cartTotal = Math.max(0, subtotal - Number(discount || 0));
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const cashChange =
    paymentMethod === 'cash' && cashOut ? Math.max(0, Number(cashOut) - cartTotal) : null;

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

      {/* Main content — offset top by mobile topbar on small screens */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden pt-[60px] lg:pt-0">

        {/* Shift banner — shown when no active shift */}
        {!currentShift && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3">
            <span className="text-sm font-semibold text-amber-800">
              No active shift. Open a shift to start selling.
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="Opening cash (UGX)"
                className="w-40 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => { setErr(''); openShiftMutation.mutate(); }}
                disabled={openShiftMutation.isPending}
                className="rounded-xl px-4 py-2 text-sm font-bold text-white transition disabled:opacity-60"
                style={{ background: '#1B4332' }}
              >
                {openShiftMutation.isPending ? 'Opening…' : 'Open Shift'}
              </button>
            </div>
            {err && <span className="text-xs text-rose-600">{err}</span>}
          </div>
        )}

        {/* Shift status bar when shift is active */}
        {currentShift && (
          <div className="flex shrink-0 items-center gap-3 border-b border-emerald-100 bg-emerald-50/60 px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-emerald-800">
              Shift active · Opened {new Date(currentShift.openedAt).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="ml-auto text-xs text-emerald-700 font-semibold">
              {currentShift.saleCount} {currentShift.saleCount === 1 ? 'sale' : 'sales'} · {ugx(currentShift.salesTotal)}
            </span>
          </div>
        )}

        {/* Body: product list + cart */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* Product list panel */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

            {/* Search bar — max 380px, h-10 */}
            <div className="shrink-0 border-b border-black/5 bg-white px-4 py-3">
              <div className="relative w-full max-w-[380px]">
                <svg
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const available = products.filter((p) => !p.isOutOfStock);
                      if (available.length === 1) addToCart(available[0]);
                    }
                  }}
                  placeholder="Search products..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-[#F7F4EE] pl-9 pr-4 text-sm outline-none transition focus:border-[#1B4332]/50"
                />
              </div>
            </div>

            {/* Products — simple list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50 bg-white">
              {productsQuery.isLoading && (
                <p className="py-16 text-center text-sm text-slate-400">Loading catalog…</p>
              )}
              {!productsQuery.isLoading && products.length === 0 && (
                <p className="py-16 text-center text-sm text-slate-400">No products found</p>
              )}
              {products.map((product) => {
                const inCart = cart.find((l) => l.product.id === product.id)?.qty ?? 0;
                const qty = product.availableQuantity;
                const disabled = !currentShift || product.isOutOfStock;
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => addToCart(product)}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition select-none ${
                      product.isOutOfStock
                        ? 'opacity-40 cursor-not-allowed bg-white'
                        : inCart > 0
                        ? 'bg-emerald-50/60 hover:bg-emerald-50'
                        : 'hover:bg-slate-50 active:bg-slate-100'
                    }`}
                  >
                    {/* Cart qty badge or stock dot */}
                    {inCart > 0 ? (
                      <span className="flex h-7 min-w-[28px] shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold text-white"
                        style={{ background: '#1B4332' }}>
                        {inCart}
                      </span>
                    ) : (
                      <span className={`h-2 w-2 shrink-0 rounded-full ${
                        product.isOutOfStock ? 'bg-rose-400' : qty <= 5 ? 'bg-amber-400' : 'bg-emerald-400'
                      }`} />
                    )}

                    {/* Name + stock info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{product.name}</p>
                      {product.isOutOfStock ? (
                        <p className="text-xs text-rose-500">Out of stock</p>
                      ) : qty <= 5 ? (
                        <p className="text-xs text-amber-600">Only {qty} left</p>
                      ) : (
                        <p className="text-xs text-slate-400">{qty} in stock</p>
                      )}
                    </div>

                    {/* Price */}
                    <span className="shrink-0 text-sm font-bold" style={{ color: '#1B4332' }}>
                      {ugx(product.sellingPrice)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cart — desktop sidebar */}
          <CartPanel
            cart={cart}
            subtotal={subtotal}
            total={cartTotal}
            discount={discount}
            notes={notes}
            currentShift={!!currentShift}
            err={err}
            isPending={saleMutation.isPending}
            onSetQty={setQty}
            onDiscount={setDiscount}
            onNotes={setNotes}
            onOpenConfirm={() => { setErr(''); setShowConfirm(true); }}
            onClose={() => setCartOpen(false)}
            isDesktop
          />
        </div>
      </div>

      {/* Mobile FAB — cart */}
      <button
        type="button"
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition active:scale-95 lg:hidden"
        style={{ background: '#1B4332' }}
        onClick={() => setCartOpen(true)}
      >
        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        {cartCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
            {cartCount}
          </span>
        )}
      </button>

      {/* Mobile cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close cart"
            className="absolute inset-0 bg-black/40"
            onClick={() => setCartOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl">
            <CartPanel
              cart={cart}
              subtotal={subtotal}
              total={cartTotal}
              discount={discount}
              notes={notes}
              currentShift={!!currentShift}
              err={err}
              isPending={saleMutation.isPending}
              onSetQty={setQty}
              onDiscount={setDiscount}
              onNotes={setNotes}
              onOpenConfirm={() => { setCartOpen(false); setErr(''); setShowConfirm(true); }}
              onClose={() => setCartOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Sale confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl">
            <div className="px-6 pt-6 pb-2">
              <h2 className="text-xl font-bold text-slate-900">Confirm Sale</h2>
              <p className="mt-0.5 text-sm text-slate-500">Review, pick payment method, then charge.</p>

              {/* Low-stock warnings */}
              {lowStockCartItems.length > 0 && (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  ⚠ Low stock: {lowStockCartItems.map((l) => `${l.product.name} (${l.product.availableQuantity} left)`).join(', ')}
                </div>
              )}

              {/* Cart items summary */}
              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs space-y-1.5">
                {cart.map((line) => (
                  <div key={line.product.id} className="flex justify-between">
                    <span className="text-slate-600">{line.product.name} × {line.qty}</span>
                    <span className="font-semibold text-slate-900">{ugx(line.product.sellingPrice * line.qty)}</span>
                  </div>
                ))}
                {Number(discount) > 0 && (
                  <div className="flex justify-between text-slate-500 border-t border-slate-200 pt-1.5 mt-1">
                    <span>Discount</span>
                    <span>-{ugx(Number(discount))}</span>
                  </div>
                )}
              </div>

              {/* Total */}
              <div className="mt-3 flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3">
                <span className="font-bold text-slate-900">Total</span>
                <span className="text-2xl font-black" style={{ color: '#1B4332' }}>{ugx(cartTotal)}</span>
              </div>

              {/* Payment method */}
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Payment method
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {enabledMethods.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPaymentMethod(opt.value)}
                      className="rounded-xl px-3 py-2.5 text-xs font-bold transition active:scale-95"
                      style={{
                        background: opt.bg,
                        color: opt.color,
                        outline: paymentMethod === opt.value ? `2px solid ${opt.bg}` : 'none',
                        outlineOffset: '2px',
                        opacity: paymentMethod === opt.value ? 1 : 0.65,
                      } as React.CSSProperties}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transaction reference (non-cash) */}
              {paymentMethod !== 'cash' && (
                <input
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="Transaction reference"
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300"
                />
              )}

              {/* Customer pays — cash only */}
              {paymentMethod === 'cash' && (
                <input
                  type="number"
                  min="0"
                  value={cashOut}
                  onChange={(e) => setCashOut(e.target.value)}
                  placeholder="Customer pays (UGX)"
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300"
                />
              )}

              {/* Change */}
              {cashChange !== null && cashChange >= 0 && (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2">
                  <span className="text-sm font-semibold text-emerald-800">Change</span>
                  <span className="text-sm font-bold text-emerald-700">{ugx(cashChange)}</span>
                </div>
              )}

              {err && (
                <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{err}</p>
              )}
            </div>

            <div className="flex gap-3 border-t border-slate-100 p-4 mt-2">
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

      {/* Receipt preview modal — shown after successful sale */}
      {completedSaleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl">
            <div className="p-6">
              <div className="flex flex-col items-center text-center">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: '#1B4332' }}
                >
                  <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="mt-3 text-xl font-bold text-slate-900">Sale Complete!</h2>
                {receipt && (
                  <p className="mt-1 text-sm text-slate-400">Receipt #{receipt.receiptNumber}</p>
                )}
              </div>

              {receiptQuery.isLoading && (
                <p className="mt-4 text-center text-sm text-slate-400">Loading receipt…</p>
              )}

              {receipt && (
                <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 font-mono text-xs">
                  <p className="mb-1 text-center font-bold text-slate-900">EVAYA NATURALS</p>
                  <p className="mb-3 text-center text-slate-400">
                    {new Date(receipt.createdAt).toLocaleString()}
                  </p>
                  <div className="space-y-1 border-t border-dashed border-slate-300 pt-2">
                    {receipt.items.map((item) => (
                      <div key={item.productId} className="flex justify-between">
                        <span className="text-slate-700">{item.productName} ×{item.quantity}</span>
                        <span className="font-semibold">{ugx(item.total)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 space-y-1 border-t border-dashed border-slate-300 pt-2">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal</span><span>{ugx(receipt.subtotal)}</span>
                    </div>
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
                      <span>
                        {PAYMENT_OPTIONS.find((o) => o.value === receipt.paymentMethod)?.label ?? receipt.paymentMethod}
                      </span>
                    </div>
                  </div>
                  {receipt.receiptFooterMessage && (
                    <p className="mt-3 border-t border-dashed border-slate-300 pt-2 text-center text-slate-400">
                      {receipt.receiptFooterMessage}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={printReceipt}
                disabled={!receipt}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
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

interface CartPanelProps {
  cart: CartLine[];
  subtotal: number;
  total: number;
  discount: string;
  notes: string;
  currentShift: boolean;
  err: string;
  isPending: boolean;
  onSetQty: (id: string, qty: number) => void;
  onDiscount: (v: string) => void;
  onNotes: (v: string) => void;
  onOpenConfirm: () => void;
  onClose: () => void;
  isDesktop?: boolean;
}

function CartPanel({
  cart, subtotal, total, discount, notes, currentShift, err, isPending,
  onSetQty, onDiscount, onNotes, onOpenConfirm, onClose, isDesktop = false,
}: CartPanelProps) {
  const canCharge = currentShift && cart.length > 0 && !isPending;

  return (
    <div className={`flex flex-col ${isDesktop ? 'hidden w-[300px] shrink-0 border-l border-black/[0.06] bg-white lg:flex' : 'h-full bg-white'}`}>

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-bold text-slate-900">Current Sale</h2>
        {!isDesktop && (
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Cart items list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-slate-400">
            <svg className="h-8 w-8 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Tap a product to add
          </div>
        ) : (
          <ul className="divide-y divide-slate-50 px-4 py-2">
            {cart.map((line) => (
              <li key={line.product.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex-1 text-sm font-semibold leading-snug text-slate-900">
                    {line.product.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => onSetQty(line.product.id, 0)}
                    className="mt-0.5 rounded-md p-0.5 text-slate-300 transition hover:text-rose-400"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => onSetQty(line.product.id, line.qty - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-sm text-slate-600 transition hover:bg-slate-50 active:scale-95">
                      −
                    </button>
                    <span className="w-7 text-center text-sm font-bold">{line.qty}</span>
                    <button type="button" onClick={() => onSetQty(line.product.id, line.qty + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-sm text-slate-600 transition hover:bg-slate-50 active:scale-95">
                      +
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

      {/* Bottom — totals + charge */}
      <div className="shrink-0 space-y-2.5 border-t border-slate-100 p-4">

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Subtotal</span>
          <span className="font-semibold text-slate-900">{ugx(subtotal)}</span>
        </div>

        <input
          type="number"
          min="0"
          value={discount}
          onChange={(e) => onDiscount(e.target.value)}
          placeholder="Discount (UGX)"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300"
        />

        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-900">Total</span>
          <span className="text-xl font-black" style={{ color: '#1B4332' }}>{ugx(total)}</span>
        </div>

        <input
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300"
        />

        {err && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{err}</p>
        )}

        {/* Complete Sale */}
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
            ? 'Cart is empty'
            : `Complete Sale — ${ugx(total)}`}
        </button>
      </div>
    </div>
  );
}
