import { useState, useDeferredValue } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { PosProduct } from '../types';

const ugx = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

const PAYMENT_OPTIONS = [
  { value: 'mtn_mobile_money' as const, label: 'MTN Mobile Money', shortLabel: 'MTN', bg: '#FFD100', color: '#1B1B1B' },
  { value: 'airtel_money' as const, label: 'Airtel Money', shortLabel: 'Airtel', bg: '#E4002B', color: '#FFFFFF' },
  { value: 'cash' as const, label: 'Cash', shortLabel: 'Cash', bg: '#1B4332', color: '#FFFFFF' },
  { value: 'bank_card' as const, label: 'Bank Card', shortLabel: 'Card', bg: '#1E293B', color: '#FFFFFF' },
];

type PaymentValue = (typeof PAYMENT_OPTIONS)[number]['value'];

const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  Skincare: { bg: '#FEF3C7', text: '#92400E' },
  'Hair Care': { bg: '#EDE9FE', text: '#5B21B6' },
  'Body Care': { bg: '#D1FAE5', text: '#065F46' },
  'Face Care': { bg: '#FEE2E2', text: '#991B1B' },
  Oils: { bg: '#FEF9C3', text: '#713F12' },
  Supplements: { bg: '#DBEAFE', text: '#1E40AF' },
  Fragrances: { bg: '#FCE7F3', text: '#9D174D' },
  'Baby Care': { bg: '#E0F2FE', text: '#075985' },
  'Men Care': { bg: '#F1F5F9', text: '#334155' },
  'Lip Care': { bg: '#FDF2F8', text: '#BE185D' },
  Other: { bg: '#F3F4F6', text: '#374151' },
};

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
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentValue>('mtn_mobile_money');
  const [paymentRef, setPaymentRef] = useState('');
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<{ receiptNumber: string; total: number; method: PaymentValue } | null>(null);
  const [openingCash, setOpeningCash] = useState('0');
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

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pos-products'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-current-shift'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-today-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-reports-today'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-inventory'] }),
    ]);

  const openShiftMutation = useMutation({
    mutationFn: () => api.pos.openShift(Number(openingCash)),
    onSuccess: async () => { setOpeningCash('0'); setErr(''); await invalidate(); },
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
      const total = cartTotal;
      setReceipt({ receiptNumber: payload.receiptNumber, total, method: paymentMethod });
      setCart([]);
      setShowPayment(false);
      setDiscount('0');
      setPaymentRef('');
      setNotes('');
      setErr('');
      await invalidate();
    },
    onError: (e) => setErr(getError(e)),
  });

  const products = productsQuery.data?.products ?? [];
  const currentShift = shiftQuery.data?.shift ?? null;
  const enabledMethods = PAYMENT_OPTIONS.filter(
    (o) => settingsQuery.data?.paymentMethods?.[o.value] ?? true,
  );

  const categories = [...new Set(products.map((p) => p.categoryName).filter(Boolean))];
  const visibleProducts = activeCategory
    ? products.filter((p) => p.categoryName === activeCategory)
    : products;

  const subtotal = cart.reduce((s, l) => s + l.product.sellingPrice * l.qty, 0);
  const cartTotal = Math.max(0, subtotal - Number(discount || 0));
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

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
  };

  const setQty = (id: string, qty: number) => {
    if (qty <= 0) { setCart((c) => c.filter((l) => l.product.id !== id)); return; }
    const max = cart.find((l) => l.product.id === id)?.product.availableQuantity ?? qty;
    setCart((c) => c.map((l) => (l.product.id === id ? { ...l, qty: Math.min(qty, max) } : l)));
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: '#F7F4EE' }}>

      {/* ── Top header ── */}
      <header className="flex shrink-0 items-center justify-between border-b border-black/8 bg-white px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)] lg:px-6">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: '#1B4332' }}
          >
            <span className="text-base font-bold leading-none text-white">E</span>
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-slate-900">Evaya Naturals</p>
            <p className="text-xs leading-tight text-slate-400">{user?.firstName} {user?.lastName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              currentShift ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {currentShift ? 'Shift Open' : 'No Shift'}
          </span>
          <button
            type="button"
            className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 lg:hidden"
            onClick={() => setCartOpen(true)}
          >
            <svg className="h-5 w-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {cartCount > 0 && (
              <span
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: '#1B4332' }}
              >
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── Open shift banner ── */}
      {!currentShift && (
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 lg:px-6">
          <span className="text-sm font-semibold text-amber-800">Open a shift to start selling.</span>
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

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* Products panel */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Search + category chips */}
          <div className="shrink-0 border-b border-black/5 bg-white px-4 py-3 lg:px-6">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="mb-3 w-full rounded-xl border border-slate-200 bg-[#F7F4EE] px-4 py-2.5 text-sm outline-none transition focus:border-[#1B4332]/50"
            />
            <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
              <Chip active={activeCategory === null} onClick={() => setActiveCategory(null)}>All</Chip>
              {categories.map((cat) => (
                <Chip
                  key={cat}
                  active={activeCategory === cat}
                  onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                >
                  {cat}
                </Chip>
              ))}
            </div>
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-5">
            {productsQuery.isLoading && (
              <p className="py-16 text-center text-sm text-slate-400">Loading catalog…</p>
            )}
            {!productsQuery.isLoading && visibleProducts.length === 0 && (
              <p className="py-16 text-center text-sm text-slate-400">No products found</p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleProducts.map((product) => {
                const cat = product.categoryName ?? 'Other';
                const catStyle = CAT_COLORS[cat] ?? CAT_COLORS.Other;
                const inCart = cart.find((l) => l.product.id === product.id)?.qty ?? 0;
                const disabled = !currentShift || product.isOutOfStock;
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => addToCart(product)}
                    className={`group relative flex flex-col rounded-2xl border p-3 text-left transition select-none active:scale-95 ${
                      product.isOutOfStock
                        ? 'cursor-not-allowed border-rose-100 bg-rose-50 opacity-60'
                        : inCart > 0
                        ? 'border-[#1B4332]/25 bg-white shadow-md'
                        : 'cursor-pointer border-white bg-white shadow-sm hover:-translate-y-0.5 hover:shadow-md'
                    }`}
                  >
                    {inCart > 0 && (
                      <span
                        className="absolute right-2 top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                        style={{ background: '#1B4332' }}
                      >
                        {inCart}
                      </span>
                    )}
                    <span
                      className="mb-2 self-start rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest"
                      style={{ background: catStyle.bg, color: catStyle.text }}
                    >
                      {cat}
                    </span>
                    <p className="flex-1 text-sm font-semibold leading-snug text-slate-900">{product.name}</p>
                    {product.isOutOfStock ? (
                      <p className="mt-1.5 text-[10px] font-semibold text-rose-500">Out of stock</p>
                    ) : product.lowStock ? (
                      <p className="mt-1.5 text-[10px] font-semibold text-amber-500">
                        Low · {product.availableQuantity} left
                      </p>
                    ) : null}
                    <p className="mt-2 font-mono-nums text-base font-bold" style={{ color: '#1B4332' }}>
                      {ugx(product.sellingPrice)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Cart — desktop fixed right */}
        <CartDrawer
          cart={cart}
          subtotal={subtotal}
          total={cartTotal}
          discount={discount}
          notes={notes}
          currentShift={!!currentShift}
          err={err}
          onSetQty={setQty}
          onDiscount={setDiscount}
          onNotes={setNotes}
          onCheckout={() => { setErr(''); setShowPayment(true); }}
          onClose={() => setCartOpen(false)}
          isDesktop
        />
      </div>

      {/* ── Mobile cart drawer ── */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close cart"
            className="absolute inset-0 bg-black/40"
            onClick={() => setCartOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl">
            <CartDrawer
              cart={cart}
              subtotal={subtotal}
              total={cartTotal}
              discount={discount}
              notes={notes}
              currentShift={!!currentShift}
              err={err}
              onSetQty={setQty}
              onDiscount={setDiscount}
              onNotes={setNotes}
              onCheckout={() => { setCartOpen(false); setErr(''); setShowPayment(true); }}
              onClose={() => setCartOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ── Payment modal ── */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Select Payment</h2>
              <button
                type="button"
                onClick={() => setShowPayment(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              Total:{' '}
              <span className="font-mono-nums text-base font-black text-slate-900">{ugx(cartTotal)}</span>
            </p>
            {err && (
              <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {enabledMethods.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMethod(opt.value)}
                  className={`flex flex-col rounded-2xl p-4 text-left transition active:scale-95 ${
                    paymentMethod === opt.value ? 'ring-4 ring-offset-2' : 'opacity-75 hover:opacity-100'
                  }`}
                  style={{ background: opt.bg, color: opt.color } as React.CSSProperties}
                >
                  <span className="text-2xl font-black leading-none">{opt.shortLabel}</span>
                  <span className="mt-1.5 text-xs font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
            {paymentMethod !== 'cash' && (
              <input
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="Reference / transaction ID"
                className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
              />
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setShowPayment(false)}
                className="flex-1 rounded-xl border border-slate-200 py-3.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saleMutation.mutate()}
                disabled={saleMutation.isPending}
                className="flex-1 rounded-xl py-3.5 text-sm font-bold text-white transition disabled:opacity-60"
                style={{ background: '#1B4332' }}
              >
                {saleMutation.isPending ? 'Processing…' : `Pay ${ugx(cartTotal)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Receipt modal ── */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
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
              <p className="mt-1 text-sm text-slate-400">Receipt #{receipt.receiptNumber}</p>
            </div>
            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <Row label="Total paid" value={ugx(receipt.total)} bold />
              <Row
                label="Method"
                value={PAYMENT_OPTIONS.find((o) => o.value === receipt.method)?.label ?? receipt.method}
              />
              <Row label="Date &amp; time" value={new Date().toLocaleString('en-UG')} />
            </div>
            <button
              type="button"
              onClick={() => setReceipt(null)}
              className="mt-5 w-full rounded-xl py-3.5 text-sm font-bold text-white"
              style={{ background: '#1B4332' }}
            >
              New Sale
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────── sub-components ────────────

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-none whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition"
      style={
        active
          ? { background: '#1B4332', color: '#fff' }
          : { background: '#EAE7E1', color: '#374151' }
      }
    >
      {children}
    </button>
  );
}

interface CartDrawerProps {
  cart: CartLine[];
  subtotal: number;
  total: number;
  discount: string;
  notes: string;
  currentShift: boolean;
  err: string;
  onSetQty: (id: string, qty: number) => void;
  onDiscount: (v: string) => void;
  onNotes: (v: string) => void;
  onCheckout: () => void;
  onClose: () => void;
  isDesktop?: boolean;
}

function CartDrawer({
  cart,
  subtotal,
  total,
  discount,
  notes,
  currentShift,
  err,
  onSetQty,
  onDiscount,
  onNotes,
  onCheckout,
  onClose,
  isDesktop = false,
}: CartDrawerProps) {
  const canCheckout = currentShift && cart.length > 0;
  const fmtUGX = (n: number) =>
    new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

  return (
    <div
      className={`flex flex-col ${
        isDesktop
          ? 'hidden w-80 shrink-0 border-l border-black/8 bg-white lg:flex'
          : 'h-full bg-white'
      }`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-bold text-slate-900">Cart</h2>
        {!isDesktop && (
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center gap-2 text-sm text-slate-400">
            <svg className="h-8 w-8 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Tap products to add
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
                    <button
                      type="button"
                      onClick={() => onSetQty(line.product.id, line.qty - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-sm text-slate-600 transition hover:bg-slate-50 active:scale-95"
                    >
                      −
                    </button>
                    <span className="w-7 text-center text-sm font-bold">{line.qty}</span>
                    <button
                      type="button"
                      onClick={() => onSetQty(line.product.id, line.qty + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-sm text-slate-600 transition hover:bg-slate-50 active:scale-95"
                    >
                      +
                    </button>
                  </div>
                  <span className="font-mono-nums text-sm font-bold" style={{ color: '#1B4332' }}>
                    {fmtUGX(line.product.sellingPrice * line.qty)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 space-y-3 border-t border-slate-100 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Subtotal</span>
          <span className="font-mono-nums font-semibold text-slate-900">{fmtUGX(subtotal)}</span>
        </div>
        <input
          type="number"
          min="0"
          value={discount}
          onChange={(e) => onDiscount(e.target.value)}
          placeholder="Discount (UGX)"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300"
        />
        <input
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300"
        />
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-900">Total</span>
          <span className="font-mono-nums text-xl font-black" style={{ color: '#1B4332' }}>
            {fmtUGX(total)}
          </span>
        </div>
        {err && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{err}</p>
        )}
        <button
          type="button"
          disabled={!canCheckout}
          onClick={onCheckout}
          className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: canCheckout ? '#1B4332' : '#94A3B8' }}
        >
          {!currentShift
            ? 'Open a shift first'
            : cart.length === 0
            ? 'Cart is empty'
            : `Charge · ${fmtUGX(total)}`}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-slate-500" dangerouslySetInnerHTML={{ __html: label }} />
      <span className={bold ? 'font-bold text-slate-900' : 'text-slate-700'}>{value}</span>
    </div>
  );
}
