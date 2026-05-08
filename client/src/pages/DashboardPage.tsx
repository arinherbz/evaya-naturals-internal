import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';

const currencyFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0,
});

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
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

  const refreshOps = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pos-today-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-current-shift'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-reports-today'] }),
    ]);
  };

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

  const currentShift = shiftQuery.data?.shift ?? null;
  const today = todayQuery.data;
  const totalSales = today?.totalSales ?? 0;
  const salesCount = today?.salesCount ?? 0;
  const pendingCashUp = Boolean(currentShift && salesCount > 0);

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

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Evaya Naturals</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome back, {user?.firstName}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Keep the day simple: open shift, receive or sell stock, then close and reconcile.
            </p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardCard title="Today's sales" value={currencyFormatter.format(totalSales)} hint="Completed branch sales today" />
            <DashboardCard title="Receipts" value={String(salesCount)} hint="Completed checkouts today" />
            <DashboardCard title="Shift status" value={currentShift ? 'Active' : 'Not open'} hint={currentShift ? 'Cashier can keep selling' : 'Open shift before checkout'} tone={currentShift ? 'emerald' : 'amber'} />
            <DashboardCard title="Cash-up" value={pendingCashUp ? 'Pending' : 'Clear'} hint={pendingCashUp ? 'Close the active shift after selling' : 'No active cash-up reminder'} tone={pendingCashUp ? 'amber' : 'emerald'} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Cashier workflow</h2>
                  <p className="mt-1 text-sm text-slate-500">Open the shift, run POS, then close and review totals.</p>
                </div>
                <a
                  href="/pos"
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Start POS
                </a>
              </div>

              {!canCheckout && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                  Your role can review totals, but only Admin and Cashier can open or close shifts.
                </div>
              )}

              {canCheckout && !currentShift && (
                <form className="mt-5 grid gap-3 rounded-3xl bg-slate-50 p-4" onSubmit={handleOpenShift}>
                  <h3 className="text-sm font-medium text-slate-800">Open shift</h3>
                  <input
                    type="number"
                    min="0"
                    value={openingCash}
                    onChange={(event) => setOpeningCash(event.target.value)}
                    placeholder="Opening cash"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                  <button
                    type="submit"
                    disabled={openShiftMutation.isPending}
                    className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {openShiftMutation.isPending ? 'Opening…' : 'Open shift'}
                  </button>
                </form>
              )}

              {canCheckout && currentShift && (
                <form className="mt-5 grid gap-3 rounded-3xl bg-slate-50 p-4" onSubmit={handleCloseShift}>
                  <h3 className="text-sm font-medium text-slate-800">Close shift</h3>
                  <StatusRow label="Opened" value={new Date(currentShift.openedAt).toLocaleString()} />
                  <StatusRow label="Opening cash" value={currencyFormatter.format(currentShift.openingCash)} />
                  <StatusRow label="Expected cash" value={currencyFormatter.format(currentShift.paymentTotals.cash + currentShift.openingCash)} />
                  <StatusRow label="Mobile + card" value={currencyFormatter.format(currentShift.paymentTotals.mtnMobileMoney + currentShift.paymentTotals.airtelMoney + currentShift.paymentTotals.card + currentShift.paymentTotals.bankTransfer)} />
                  <input
                    type="number"
                    min="0"
                    value={countedCash}
                    onChange={(event) => setCountedCash(event.target.value)}
                    placeholder="Counted cash in drawer"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                  <textarea
                    value={closeNotes}
                    onChange={(event) => setCloseNotes(event.target.value)}
                    placeholder="Notes for close-out"
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

            <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <h2 className="text-xl font-semibold">Today at a glance</h2>
              <p className="mt-1 text-sm text-slate-500">The smallest useful summary for the branch.</p>
              <div className="mt-5 space-y-3">
                <StatusRow label="Branch" value="Evaya Naturals" />
                <StatusRow label="Today's sales" value={currencyFormatter.format(totalSales)} />
                <StatusRow label="Cash sales" value={currencyFormatter.format(today?.paymentTotals.cash ?? 0)} />
                <StatusRow label="MTN + Airtel" value={currencyFormatter.format((today?.paymentTotals.mtnMobileMoney ?? 0) + (today?.paymentTotals.airtelMoney ?? 0))} />
                <StatusRow label="Card + bank" value={currencyFormatter.format((today?.paymentTotals.card ?? 0) + (today?.paymentTotals.bankTransfer ?? 0))} />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function DashboardCard({
  title,
  value,
  hint,
  tone = 'slate',
}: {
  title: string;
  value: string;
  hint: string;
  tone?: 'slate' | 'emerald' | 'amber';
}) {
  const toneClasses = {
    slate: 'bg-white/90',
    emerald: 'bg-emerald-50',
    amber: 'bg-amber-50',
  };

  return (
    <div className={`rounded-[24px] border border-white/70 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)] ${toneClasses[tone]}`}>
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}
