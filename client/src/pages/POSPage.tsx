import { useDeferredValue, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { PosProduct, Receipt } from '../types';

const currencyFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0,
});

const paymentMethodOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'mtn_mobile_money', label: 'MTN Mobile Money' },
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'bank_card', label: 'Bank Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
] as const;

type CartLine = {
  product: PosProduct;
  quantity: number;
};

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

export default function POSPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<(typeof paymentMethodOptions)[number]['value']>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pageError, setPageError] = useState('');
  const [latestReceipt, setLatestReceipt] = useState<Receipt | null>(null);
  const deferredSearch = useDeferredValue(search);

  const canCheckout = ['Admin', 'Cashier'].includes(user?.role.name ?? '');

  const productsQuery = useQuery({
    queryKey: ['pos-products', deferredSearch],
    queryFn: () => api.pos.products({ search: deferredSearch }),
  });

  const customersQuery = useQuery({
    queryKey: ['pos-customers'],
    queryFn: () => api.pos.customers(),
    enabled: canCheckout,
  });

  const todayQuery = useQuery({
    queryKey: ['pos-today'],
    queryFn: () => api.pos.today(),
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => api.pos.createSale({
      customerId: customerId || null,
      discount: Number(discount || 0),
      paymentMethod,
      paymentReference: paymentReference || null,
      notes: notes || null,
      items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
    }),
    onSuccess: async (payload) => {
      const receipt = await api.pos.receipt(payload.sale.id);
      setLatestReceipt(receipt.receipt);
      setCart([]);
      setCustomerId('');
      setDiscount('0');
      setPaymentMethod('cash');
      setPaymentReference('');
      setNotes('');
      setPageError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pos-products'] }),
        queryClient.invalidateQueries({ queryKey: ['pos-today'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-inventory'] }),
      ]);
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const products = productsQuery.data?.products ?? [];
  const customers = customersQuery.data?.customers ?? [];
  const today = todayQuery.data;
  const subtotal = cart.reduce((sum, line) => sum + line.product.sellingPrice * line.quantity, 0);
  const total = Math.max(0, subtotal - Number(discount || 0));

  const addToCart = (product: PosProduct) => {
    if (!canCheckout) return;
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (!existing) {
        return [...current, { product, quantity: 1 }];
      }
      return current.map((line) => (
        line.product.id === product.id
          ? { ...line, quantity: Math.min(line.quantity + 1, line.product.availableQuantity) }
          : line
      ));
    });
  };

  const updateQuantity = (productId: string, nextQuantity: number) => {
    setCart((current) => current
      .map((line) => (
        line.product.id === productId
          ? { ...line, quantity: Math.max(1, Math.min(nextQuantity, line.product.availableQuantity)) }
          : line
      )));
  };

  const removeLine = (productId: string) => {
    setCart((current) => current.filter((line) => line.product.id !== productId));
  };

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Evaya Naturals POS</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">Fast cashier checkout</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  Search products, add them quickly, and complete batch-aware sales without leaving the one-branch workflow.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="Today's sales" value={currencyFormatter.format(today?.totalSales ?? 0)} />
                <MetricCard label="Receipts today" value={String(today?.salesCount ?? 0)} />
                <MetricCard label="Cash-up" value={today?.pendingCashUp ? 'Pending' : 'Clear'} />
              </div>
            </div>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          {!canCheckout && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              You can view products and today’s receipts, but your role cannot complete checkout.
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="space-y-6">
              <div className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr_auto]">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by product, SKU, or barcode"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  />
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                    Operating branch: Evaya Naturals
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    {products.length} sellable products
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {productsQuery.isLoading && (
                  <div className="md:col-span-2 rounded-[28px] border border-dashed border-slate-200 bg-white/80 p-8 text-center text-sm text-slate-500">
                    Loading POS catalog…
                  </div>
                )}
                {!productsQuery.isLoading && products.length === 0 && (
                  <div className="md:col-span-2 rounded-[28px] border border-dashed border-slate-200 bg-white/80 p-8 text-center text-sm text-slate-500">
                    No sellable products matched this search.
                  </div>
                )}
                {products.map((product) => {
                  const cartLine = cart.find((line) => line.product.id === product.id);
                  const inCartQuantity = cartLine?.quantity ?? 0;

                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToCart(product)}
                      disabled={!canCheckout}
                      className="rounded-[28px] border border-white/70 bg-white/90 p-5 text-left shadow-[0_20px_50px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(15,23,42,0.08)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-lg font-semibold">{product.name}</p>
                          <p className="mt-1 text-sm text-slate-500">{product.categoryName} · {product.unitType.toUpperCase()}</p>
                          <p className="mt-2 text-xs text-slate-400">
                            {product.sku || 'No SKU'} · {product.barcode || 'No barcode'}
                          </p>
                        </div>
                        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                          {product.availableQuantity} left
                        </div>
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-4">
                        <div>
                          <p className="text-xl font-semibold">{currencyFormatter.format(product.sellingPrice)}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {product.nextExpiryDate ? `Next expiry ${new Date(product.nextExpiryDate).toLocaleDateString()}` : 'No expiry tracked'}
                          </p>
                        </div>
                        <div className="text-right">
                          {product.lowStock && (
                            <span className="inline-flex rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                              Low stock
                            </span>
                          )}
                          {inCartQuantity > 0 && (
                            <p className="mt-2 text-xs font-medium text-emerald-700">{inCartQuantity} in cart</p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Cart</h2>
                <p className="mt-1 text-sm text-slate-500">Review quantities, apply a discount, and complete the receipt.</p>

                <div className="mt-5 space-y-3">
                  {cart.length === 0 && (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      Cart is empty. Tap a product card to add it.
                    </div>
                  )}
                  {cart.map((line) => (
                    <div key={line.product.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-slate-900">{line.product.name}</p>
                          <p className="mt-1 text-xs text-slate-400">{currencyFormatter.format(line.product.sellingPrice)} each</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.product.id)}
                          className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateQuantity(line.product.id, line.quantity - 1)}
                            className="h-9 w-9 rounded-full border border-slate-200 text-lg text-slate-700 hover:bg-white"
                          >
                            -
                          </button>
                          <div className="w-10 text-center text-sm font-medium">{line.quantity}</div>
                          <button
                            type="button"
                            onClick={() => updateQuantity(line.product.id, line.quantity + 1)}
                            className="h-9 w-9 rounded-full border border-slate-200 text-lg text-slate-700 hover:bg-white"
                          >
                            +
                          </button>
                        </div>
                        <p className="font-semibold text-slate-900">{currencyFormatter.format(line.product.sellingPrice * line.quantity)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid gap-3">
                  <select
                    value={customerId}
                    onChange={(event) => setCustomerId(event.target.value)}
                    disabled={!canCheckout}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
                  >
                    <option value="">Walk-in customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} · {customer.phone}
                      </option>
                    ))}
                  </select>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="number"
                      min="0"
                      value={discount}
                      onChange={(event) => setDiscount(event.target.value)}
                      disabled={!canCheckout}
                      placeholder="Discount (UGX)"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
                    />
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}
                      disabled={!canCheckout}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
                    >
                      {paymentMethodOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  {paymentMethod !== 'cash' && (
                    <input
                      value={paymentReference}
                      onChange={(event) => setPaymentReference(event.target.value)}
                      disabled={!canCheckout}
                      placeholder="Payment reference"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
                    />
                  )}
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    disabled={!canCheckout}
                    placeholder="Notes (optional)"
                    rows={3}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
                  />
                </div>

                <div className="mt-5 rounded-3xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between text-sm text-slate-500">
                    <span>Subtotal</span>
                    <span>{currencyFormatter.format(subtotal)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                    <span>Discount</span>
                    <span>{currencyFormatter.format(Number(discount || 0))}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-base font-semibold text-slate-900">
                    <span>Total</span>
                    <span>{currencyFormatter.format(total)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!canCheckout || cart.length === 0 || checkoutMutation.isPending}
                  onClick={() => {
                    setPageError('');
                    checkoutMutation.mutate();
                  }}
                  className="mt-5 w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checkoutMutation.isPending ? 'Completing sale…' : 'Checkout'}
                </button>
              </div>

              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Latest receipt</h2>
                <p className="mt-1 text-sm text-slate-500">A quick confirmation after checkout.</p>
                {!latestReceipt && (
                  <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No receipt yet in this session.
                  </div>
                )}
                {latestReceipt && (
                  <div className="mt-5 rounded-3xl bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Evaya Naturals</p>
                        <p className="mt-2 text-lg font-semibold">{latestReceipt.receiptNumber}</p>
                        <p className="mt-1 text-xs text-slate-400">{new Date(latestReceipt.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                        {formatPaymentMethod(latestReceipt.paymentMethod)}
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {latestReceipt.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <span>{item.productName} × {item.quantity}</span>
                          <span>{currencyFormatter.format(item.total)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 space-y-1 border-t border-slate-200 pt-4 text-sm">
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Subtotal</span>
                        <span>{currencyFormatter.format(latestReceipt.subtotal)}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Discount</span>
                        <span>{currencyFormatter.format(latestReceipt.discount)}</span>
                      </div>
                      <div className="flex items-center justify-between font-semibold text-slate-900">
                        <span>Total</span>
                        <span>{currencyFormatter.format(latestReceipt.total)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Today&apos;s receipts</h2>
                <p className="mt-1 text-sm text-slate-500">Recent completed sales for Evaya Naturals.</p>
                <div className="mt-5 space-y-3">
                  {(today?.sales ?? []).length === 0 && (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      No completed receipts yet today.
                    </div>
                  )}
                  {(today?.sales ?? []).map((sale) => (
                    <div key={sale.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium text-slate-900">{sale.receiptNumber}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {sale.cashierName} · {new Date(sale.createdAt).toLocaleTimeString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-900">{currencyFormatter.format(sale.total)}</p>
                          <p className="mt-1 text-xs text-slate-400">{formatPaymentMethod(sale.paymentMethod)}</p>
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function formatPaymentMethod(value: string) {
  const match = paymentMethodOptions.find((option) => option.value === value);
  return match?.label ?? value;
}
