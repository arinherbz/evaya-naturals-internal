import { FormEvent, useDeferredValue, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { PosProduct } from '../types';

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
  const [openingCash, setOpeningCash] = useState('0');
  const [countedCash, setCountedCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const [quickCustomerName, setQuickCustomerName] = useState('');
  const [quickCustomerPhone, setQuickCustomerPhone] = useState('');
  const [quickCustomerWhatsapp, setQuickCustomerWhatsapp] = useState('');
  const [quickCustomerEmail, setQuickCustomerEmail] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pageError, setPageError] = useState('');
  const [latestReceiptNumber, setLatestReceiptNumber] = useState('');
  const deferredSearch = useDeferredValue(search);

  const canCheckout = ['Admin', 'Cashier'].includes(user?.role.name ?? '');

  const productsQuery = useQuery({
    queryKey: ['pos-products', deferredSearch],
    queryFn: () => api.pos.products({ search: deferredSearch }),
  });

  const customersQuery = useQuery({
    queryKey: ['pos-customers'],
    queryFn: () => api.pos.customers(),
    enabled: ['Admin', 'Cashier', 'Branch Manager', 'Accountant'].includes(user?.role.name ?? ''),
  });

  const todaySummaryQuery = useQuery({
    queryKey: ['pos-today-summary'],
    queryFn: () => api.pos.today(),
  });

  const settingsQuery = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => api.settings.public(),
  });

  const shiftQuery = useQuery({
    queryKey: ['pos-current-shift'],
    queryFn: () => api.pos.currentShift(),
    enabled: canCheckout,
  });

  const refreshOps = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pos-products'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-customers'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-today-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-current-shift'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-reports-today'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-inventory'] }),
    ]);
  };

  const createCustomerMutation = useMutation({
    mutationFn: () => api.pos.createCustomer({
      name: quickCustomerName,
      phone: quickCustomerPhone,
      whatsappNumber: quickCustomerWhatsapp || null,
      email: quickCustomerEmail || null,
    }),
    onSuccess: async (payload) => {
      setCustomerId(payload.customer.id);
      setShowQuickCustomer(false);
      setQuickCustomerName('');
      setQuickCustomerPhone('');
      setQuickCustomerWhatsapp('');
      setQuickCustomerEmail('');
      setPageError('');
      await refreshOps();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => api.pos.createSale({
      customerId: customerId || null,
      quickCustomer: !customerId && quickCustomerName && quickCustomerPhone ? {
        name: quickCustomerName,
        phone: quickCustomerPhone,
        whatsappNumber: quickCustomerWhatsapp || null,
        email: quickCustomerEmail || null,
      } : null,
      discount: Number(discount || 0),
      paymentMethod,
      paymentReference: paymentReference || null,
      notes: notes || null,
      items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
    }),
    onSuccess: async (payload) => {
      setLatestReceiptNumber(payload.receiptNumber);
      setCart([]);
      setCustomerId('');
      setDiscount('0');
      setPaymentMethod('cash');
      setPaymentReference('');
      setNotes('');
      setShowQuickCustomer(false);
      setQuickCustomerName('');
      setQuickCustomerPhone('');
      setQuickCustomerWhatsapp('');
      setQuickCustomerEmail('');
      setPageError('');
      await refreshOps();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const openShiftMutation = useMutation({
    mutationFn: () => api.pos.openShift(Number(openingCash)),
    onSuccess: async () => {
      setOpeningCash('0');
      setPageError('');
      await refreshOps();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const closeShiftMutation = useMutation({
    mutationFn: () => api.pos.closeShift({
      countedCash: Number(countedCash),
      notes: closeNotes || null,
    }),
    onSuccess: async () => {
      setCountedCash('');
      setCloseNotes('');
      setPageError('');
      await refreshOps();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const products = productsQuery.data?.products ?? [];
  const customers = customersQuery.data?.customers ?? [];
  const today = todaySummaryQuery.data;
  const enabledPaymentMethods = paymentMethodOptions.filter((option) => settingsQuery.data?.paymentMethods?.[option.value] ?? true);
  const currentShift = shiftQuery.data?.shift ?? null;
  const subtotal = cart.reduce((sum, line) => sum + line.product.sellingPrice * line.quantity, 0);
  const total = Math.max(0, subtotal - Number(discount || 0));

  useEffect(() => {
    if (!enabledPaymentMethods.some((option) => option.value === paymentMethod)) {
      setPaymentMethod(enabledPaymentMethods[0]?.value ?? 'cash');
    }
  }, [enabledPaymentMethods, paymentMethod]);

  const addToCart = (product: PosProduct) => {
    if (!canCheckout || !currentShift) return;
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
    setCart((current) => current.map((line) => (
      line.product.id === productId
        ? { ...line, quantity: Math.max(1, Math.min(nextQuantity, line.product.availableQuantity)) }
        : line
    )));
  };

  const removeLine = (productId: string) => {
    setCart((current) => current.filter((line) => line.product.id !== productId));
  };

  const handleOpenShift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await openShiftMutation.mutateAsync();
  };

  const handleCloseShift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await closeShiftMutation.mutateAsync();
  };

  const selectedCustomer = customers.find((entry) => entry.id === customerId) ?? null;

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
                  Open shift, sell quickly, capture the customer when needed, then close and reconcile cleanly.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="Today's sales" value={currencyFormatter.format(today?.totalSales ?? 0)} />
                <MetricCard label="Receipts today" value={String(today?.salesCount ?? 0)} />
                <MetricCard label="Shift" value={currentShift ? 'Open' : 'Closed'} />
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
              Only Admin and Cashier can open shifts or checkout.
            </div>
          )}

          {canCheckout && !currentShift && (
            <section className="rounded-[28px] border border-amber-200 bg-amber-50/70 p-5">
              <h2 className="text-lg font-semibold text-amber-900">Open shift first</h2>
              <p className="mt-1 text-sm text-amber-800">Checkout stays locked until the cashier opens a shift.</p>
              <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={handleOpenShift}>
                <input
                  type="number"
                  min="0"
                  value={openingCash}
                  onChange={(event) => setOpeningCash(event.target.value)}
                  placeholder="Opening cash"
                  className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                  required
                />
                <button
                  type="submit"
                  disabled={openShiftMutation.isPending}
                  className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {openShiftMutation.isPending ? 'Opening…' : 'Open shift'}
                </button>
              </form>
            </section>
          )}

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="space-y-6">
              <div className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr_auto]">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search product, SKU, or barcode"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  />
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                    {currentShift ? `Shift open · ${currencyFormatter.format(currentShift.openingCash)}` : 'Open shift before checkout'}
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
                      disabled={!canCheckout || !currentShift}
                      className="rounded-[28px] border border-white/70 bg-white/90 p-5 text-left shadow-[0_20px_50px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(15,23,42,0.08)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-lg font-semibold">{product.name}</p>
                          <p className="mt-1 text-sm text-slate-500">{product.categoryName}</p>
                        </div>
                        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                          {product.availableQuantity} left
                        </div>
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-4">
                        <div>
                          <p className="text-xl font-semibold">{currencyFormatter.format(product.sellingPrice)}</p>
                        </div>
                        <div className="text-right">
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
              <div className="rounded-[32px] bg-white/92 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Cart</h2>
                <p className="mt-1 text-sm text-slate-500">Review, take payment, and complete checkout.</p>

                <div className="mt-5 space-y-3">
                  {cart.length === 0 && (
                    <div className="rounded-3xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      No items yet
                    </div>
                  )}
                  {cart.map((line) => (
                    <div key={line.product.id} className="rounded-3xl bg-slate-50 px-4 py-4">
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
                    onChange={(event) => {
                      setCustomerId(event.target.value);
                      if (event.target.value) {
                        setShowQuickCustomer(false);
                      }
                    }}
                    disabled={!canCheckout}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
                  >
                    <option value="">Walk-in customer</option>
                    {customers.filter((entry) => entry.isActive).map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} · {customer.phone}
                      </option>
                    ))}
                  </select>
                  {selectedCustomer && (
                    <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      Linked customer: {selectedCustomer.name} · {selectedCustomer.phone}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={!canCheckout}
                    onClick={() => {
                      setShowQuickCustomer((current) => !current);
                      setCustomerId('');
                    }}
                    className="justify-self-start rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {showQuickCustomer ? 'Hide quick customer' : 'Quick create customer'}
                  </button>
                  {showQuickCustomer && (
                    <div className="grid gap-3 rounded-3xl bg-slate-50 p-4">
                      <input
                        value={quickCustomerName}
                        onChange={(event) => setQuickCustomerName(event.target.value)}
                        placeholder="Customer name"
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      />
                      <input
                        value={quickCustomerPhone}
                        onChange={(event) => setQuickCustomerPhone(event.target.value)}
                        placeholder="Phone number"
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          value={quickCustomerWhatsapp}
                          onChange={(event) => setQuickCustomerWhatsapp(event.target.value)}
                          placeholder="WhatsApp number"
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                        />
                        <input
                          value={quickCustomerEmail}
                          onChange={(event) => setQuickCustomerEmail(event.target.value)}
                          placeholder="Email"
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={createCustomerMutation.isPending || !quickCustomerName || !quickCustomerPhone}
                        onClick={() => {
                          setPageError('');
                          createCustomerMutation.mutate();
                        }}
                        className="justify-self-start rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                      >
                        {createCustomerMutation.isPending ? 'Saving…' : 'Save customer'}
                      </button>
                    </div>
                  )}
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
                      {enabledPaymentMethods.map((option) => (
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

                <div className="mt-6 rounded-3xl bg-slate-50 p-5">
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

                {latestReceiptNumber && (
                  <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    Sale complete · {latestReceiptNumber}
                  </div>
                )}

                <button
                  type="button"
                  disabled={!canCheckout || !currentShift || cart.length === 0 || checkoutMutation.isPending}
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
                <h2 className="text-xl font-semibold">Shift review</h2>
                <p className="mt-1 text-sm text-slate-500">Use this to reconcile and close the cashier session.</p>
                {!currentShift && (
                  <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No active shift yet.
                  </div>
                )}
                {currentShift && (
                  <form className="mt-5 grid gap-3" onSubmit={handleCloseShift}>
                    <div className="rounded-3xl bg-slate-50 p-4">
                      <div className="flex items-center justify-between text-sm text-slate-500">
                        <span>Expected cash</span>
                        <span>{currencyFormatter.format(currentShift.paymentTotals.cash + currentShift.openingCash)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                        <span>Digital payments</span>
                        <span>{currencyFormatter.format(currentShift.paymentTotals.mtnMobileMoney + currentShift.paymentTotals.airtelMoney + currentShift.paymentTotals.card + currentShift.paymentTotals.bankTransfer)}</span>
                      </div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={countedCash}
                      onChange={(event) => setCountedCash(event.target.value)}
                      placeholder="Counted cash"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                    <textarea
                      value={closeNotes}
                      onChange={(event) => setCloseNotes(event.target.value)}
                      placeholder="Close notes"
                      rows={3}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    />
                    <button
                      type="submit"
                      disabled={closeShiftMutation.isPending}
                      className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {closeShiftMutation.isPending ? 'Closing…' : 'Close shift'}
                    </button>
                  </form>
                )}
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
