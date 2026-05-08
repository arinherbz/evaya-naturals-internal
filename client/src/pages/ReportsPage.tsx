import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import BrandMark from '../components/BrandMark';
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
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'custom'>('daily');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [pageError, setPageError] = useState('');

  const isApprover = ['Admin', 'Branch Manager'].includes(user?.role.name ?? '');

  const refreshOps = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['report-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['report-today'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-current-shift'] }),
    ]);
  };

  const reportQuery = useQuery({
    queryKey: ['report-summary', period, startDate, endDate],
    queryFn: () => api.pos.reportSummary({
      period,
      startDate: period === 'custom' ? startDate : undefined,
      endDate: period === 'custom' ? endDate : undefined,
    }),
  });

  const approveMutation = useMutation({
    mutationFn: (shiftId: string) => api.pos.approveShift(shiftId),
    onSuccess: async () => {
      setPageError('');
      await refreshOps();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const downloadMutation = useMutation({
    mutationFn: () => api.pos.downloadReportPdf({
      period,
      startDate: period === 'custom' ? startDate : undefined,
      endDate: period === 'custom' ? endDate : undefined,
    }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `evaya-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const report = reportQuery.data;
  const previewGeneratedAt = useMemo(
    () => (report ? new Date(report.generatedAt).toLocaleString() : 'Loading preview…'),
    [report],
  );

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <BrandMark />
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Reports</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">Preview the report before you download</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  Daily, weekly, or custom reporting for Evaya Naturals with a live preview that matches the PDF closely.
                </p>
              </div>
              <button
                type="button"
                onClick={() => downloadMutation.mutate()}
                disabled={downloadMutation.isPending}
                className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {downloadMutation.isPending ? 'Preparing PDF…' : 'Download PDF'}
              </button>
            </div>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="grid gap-3 lg:grid-cols-[220px_1fr_1fr_auto]">
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value as 'daily' | 'weekly' | 'custom')}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="custom">Custom range</option>
              </select>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                disabled={period !== 'custom'}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
              />
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                disabled={period !== 'custom'}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
              />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                {report?.periodLabel ?? 'Loading range…'}
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-slate-200 bg-[#fcfcfa] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="border-b border-slate-200 pb-5">
              <BrandMark className="justify-center sm:justify-start" />
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Report preview</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">{report?.title ?? 'Loading report'}</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {report?.periodLabel ?? 'Preparing date range'} · Generated {previewGeneratedAt}
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                  {report ? `${report.startDate} to ${report.endDate}` : 'Loading dates…'}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <PreviewMetric label="Total sales" value={currencyFormatter.format(report?.totalSales ?? 0)} />
              <PreviewMetric label="Expenses total" value={currencyFormatter.format(report?.expensesTotal ?? 0)} />
              <PreviewMetric label="Net amount" value={currencyFormatter.format(report?.netAmount ?? 0)} />
              <PreviewMetric label="Number of sales" value={String(report?.salesCount ?? 0)} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <section className="space-y-6">
                <PreviewPanel title="Payment totals" description={`Discounts ${currencyFormatter.format(report?.totalDiscounts ?? 0)}`}>
                  <StatusRow label="Cash" value={currencyFormatter.format(report?.paymentTotals.cash ?? 0)} />
                  <StatusRow label="MTN Mobile Money" value={currencyFormatter.format(report?.paymentTotals.mtnMobileMoney ?? 0)} />
                  <StatusRow label="Airtel Money" value={currencyFormatter.format(report?.paymentTotals.airtelMoney ?? 0)} />
                  <StatusRow label="Bank Card" value={currencyFormatter.format(report?.paymentTotals.card ?? 0)} />
                  <StatusRow label="Bank Transfer" value={currencyFormatter.format(report?.paymentTotals.bankTransfer ?? 0)} />
                </PreviewPanel>

                <PreviewPanel title="Best-selling products" description="Top movers in the selected range.">
                  {(report?.bestSellingProducts ?? []).length === 0 && (
                    <EmptyState text="No sales in the selected period." />
                  )}
                  {(report?.bestSellingProducts ?? []).map((item) => (
                    <StatusRow
                      key={item.productName}
                      label={`${item.productName} · ${item.quantity} sold`}
                      value={currencyFormatter.format(item.revenue)}
                    />
                  ))}
                </PreviewPanel>

                <PreviewPanel title="Low stock summary" description={`${report?.lowStockSummary.count ?? 0} products need attention.`}>
                  {(report?.lowStockSummary.items ?? []).length === 0 && (
                    <EmptyState text="No low stock products right now." />
                  )}
                  {(report?.lowStockSummary.items ?? []).map((item) => (
                    <StatusRow
                      key={item.productName}
                      label={`${item.productName} · threshold ${item.threshold}`}
                      value={`${item.quantity} left`}
                    />
                  ))}
                </PreviewPanel>
              </section>

              <section className="space-y-6">
                <PreviewPanel
                  title="Shift and cash-up summary"
                  description={`Variance ${currencyFormatter.format(report?.shiftSummary.varianceTotal ?? 0)}`}
                >
                  {(report?.shiftSummary.shifts ?? []).length === 0 && (
                    <EmptyState text="No shifts in the selected period." />
                  )}
                  {(report?.shiftSummary.shifts ?? []).map((shift) => (
                    <div key={shift.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{shift.cashierName}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {shift.status.toUpperCase()} · {new Date(shift.openedAt).toLocaleString()}
                          </p>
                          <p className="mt-2 text-sm text-slate-500">
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
                </PreviewPanel>

                <PreviewPanel title="Expense lines" description="The same entries feed the report total and PDF output.">
                  {(report?.expenses ?? []).length === 0 && (
                    <EmptyState text="No expenses in the selected period." />
                  )}
                  {(report?.expenses ?? []).map((expense) => (
                    <StatusRow
                      key={expense.id}
                      label={`${expense.title} · ${expense.category}`}
                      value={currencyFormatter.format(expense.amount)}
                    />
                  ))}
                </PreviewPanel>
              </section>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white px-4 py-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function PreviewPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
      <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-5 space-y-3">{children}</div>
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
