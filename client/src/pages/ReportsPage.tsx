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

export default function ReportsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isApprover = ['Admin', 'Branch Manager'].includes(user?.role.name ?? '');

  const reportQuery = useQuery({
    queryKey: ['pos-reports-today'],
    queryFn: () => api.pos.reportToday(),
  });

  const approveMutation = useMutation({
    mutationFn: (shiftId: string) => api.pos.approveShift(shiftId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pos-reports-today'] }),
        queryClient.invalidateQueries({ queryKey: ['pos-current-shift'] }),
      ]);
    },
  });

  const report = reportQuery.data;

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Daily reports</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Simple operating summary</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Today’s sales, payment mix, shift summaries, and variances for Evaya Naturals only.
            </p>
          </section>

          {approveMutation.isError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {getErrorMessage(approveMutation.error)}
            </div>
          )}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Today sales" value={currencyFormatter.format(report?.todaySales ?? 0)} />
            <MetricCard label="Receipts" value={String(report?.salesCount ?? 0)} />
            <MetricCard label="Cash total" value={currencyFormatter.format(report?.paymentTotals.cash ?? 0)} />
            <MetricCard label="Variance summary" value={currencyFormatter.format(report?.varianceSummary ?? 0)} />
          </section>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <h2 className="text-xl font-semibold">Payment totals</h2>
              <p className="mt-1 text-sm text-slate-500">The smallest useful branch payment breakdown.</p>
              <div className="mt-5 space-y-3">
                <StatusRow label="Cash" value={currencyFormatter.format(report?.paymentTotals.cash ?? 0)} />
                <StatusRow label="MTN Mobile Money" value={currencyFormatter.format(report?.paymentTotals.mtnMobileMoney ?? 0)} />
                <StatusRow label="Airtel Money" value={currencyFormatter.format(report?.paymentTotals.airtelMoney ?? 0)} />
                <StatusRow label="Bank card" value={currencyFormatter.format(report?.paymentTotals.card ?? 0)} />
                <StatusRow label="Bank transfer" value={currencyFormatter.format(report?.paymentTotals.bankTransfer ?? 0)} />
              </div>
            </section>

            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <h2 className="text-xl font-semibold">Shift summaries</h2>
              <p className="mt-1 text-sm text-slate-500">Review closings and approve them where needed.</p>
              <div className="mt-5 space-y-3">
                {(report?.shifts ?? []).length === 0 && (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No shifts recorded today.
                  </div>
                )}
                {(report?.shifts ?? []).map((shift) => (
                  <div key={shift.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{shift.cashierName}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {shift.status.toUpperCase()} · {new Date(shift.openedAt).toLocaleTimeString()}
                          {shift.closedAt ? ` - ${new Date(shift.closedAt).toLocaleTimeString()}` : ''}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                          Sales {currencyFormatter.format(shift.salesTotal)} · Expected {currencyFormatter.format(shift.expectedCash ?? shift.openingCash)} · Counted {currencyFormatter.format(shift.countedCash ?? 0)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${shift.variance === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          Variance {currencyFormatter.format(shift.variance ?? 0)}
                        </span>
                        {isApprover && shift.status === 'closed' && (
                          <button
                            type="button"
                            onClick={() => approveMutation.mutate(shift.id)}
                            disabled={approveMutation.isPending}
                            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                          >
                            Approve close
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
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
    <div className="rounded-2xl bg-white/90 px-4 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
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
