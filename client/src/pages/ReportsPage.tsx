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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function weekStartStr() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

function monthStartStr() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

type QuickRange = 'today' | 'week' | 'month' | 'custom';

export default function ReportsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [quickRange, setQuickRange] = useState<QuickRange>('today');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [pageError, setPageError] = useState('');
  const [showPdfModal, setShowPdfModal] = useState(false);

  const isApprover = ['Admin', 'Branch Manager'].includes(user?.role.name ?? '');

  const apiPeriod = quickRange === 'today' ? 'daily' : quickRange === 'week' ? 'weekly' : 'custom';
  const apiStart = quickRange === 'custom' ? startDate : quickRange === 'today' ? undefined : quickRange === 'week' ? weekStartStr() : monthStartStr();
  const apiEnd = quickRange === 'custom' ? endDate : quickRange === 'today' ? undefined : todayStr();

  const reportQuery = useQuery({
    queryKey: ['report-summary', apiPeriod, apiStart, apiEnd],
    queryFn: () => api.pos.reportSummary({
      period: apiPeriod,
      startDate: apiPeriod === 'custom' ? apiStart : undefined,
      endDate: apiPeriod === 'custom' ? apiEnd : undefined,
    }),
  });

  const refreshOps = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['report-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['report-today'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-current-shift'] }),
    ]);
  };

  const approveMutation = useMutation({
    mutationFn: (shiftId: string) => api.pos.approveShift(shiftId),
    onSuccess: async () => {
      setPageError('');
      await refreshOps();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  function setRange(r: QuickRange) {
    setQuickRange(r);
    if (r === 'today') { setStartDate(todayStr()); setEndDate(todayStr()); }
    else if (r === 'week') { setStartDate(weekStartStr()); setEndDate(todayStr()); }
    else if (r === 'month') { setStartDate(monthStartStr()); setEndDate(todayStr()); }
  }

  const report = reportQuery.data;
  const previewGeneratedAt = useMemo(
    () => (report ? new Date(report.generatedAt).toLocaleString() : 'Loading…'),
    [report],
  );

  function printReport() {
    const win = window.open('', '_blank');
    if (!win) return;
    const dateRange = report ? `${report.startDate} to ${report.endDate}` : '';
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Evaya Report</title>
<style>
  body{font-family:system-ui,sans-serif;margin:0;padding:32px;color:#0f172a;background:#fff}
  h1{font-size:24px;font-weight:700;margin:0 0 4px}
  p{margin:0 0 4px;font-size:13px;color:#64748b}
  table{width:100%;border-collapse:collapse;margin-top:24px;font-size:13px}
  th{text-align:left;border-bottom:2px solid #e2e8f0;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  td{border-bottom:1px solid #f1f5f9;padding:10px 12px}
  .header{border-bottom:2px solid #0f172a;padding-bottom:20px;margin-bottom:24px}
  .brand{font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.5px}
  .brand span{color:#16a34a}
  .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:20px 0}
  .metric{border:1px solid #e2e8f0;border-radius:12px;padding:16px}
  .metric-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:8px}
  .metric-value{font-size:20px;font-weight:700;color:#0f172a}
  h3{font-size:14px;font-weight:600;margin:24px 0 8px}
  @media print{body{padding:0}}
</style></head><body>
<div class="header">
  <div class="brand">EVAYA <span>NATURALS</span></div>
  <h1 style="margin-top:12px">${report?.businessName ?? 'Evaya Naturals'} · ${report?.title ?? 'Report'}</h1>
  <p>${dateRange} · Generated ${previewGeneratedAt}</p>
</div>
<div class="metrics">
  <div class="metric"><div class="metric-label">Sales</div><div class="metric-value">${currencyFormatter.format(report?.totalSales ?? 0)}</div></div>
  <div class="metric"><div class="metric-label">Expenses</div><div class="metric-value">${currencyFormatter.format(report?.expensesTotal ?? 0)}</div></div>
  <div class="metric"><div class="metric-label">Net</div><div class="metric-value">${currencyFormatter.format(report?.netAmount ?? 0)}</div></div>
  <div class="metric"><div class="metric-label">Receipts</div><div class="metric-value">${report?.salesCount ?? 0}</div></div>
</div>
<h3>Best Sellers</h3>
<table><thead><tr><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr></thead><tbody>
${(report?.bestSellingProducts ?? []).map((item) => `<tr><td>${item.productName}</td><td>${item.quantity}</td><td>${currencyFormatter.format(item.revenue)}</td></tr>`).join('')}
</tbody></table>
<h3>Expenses</h3>
<table><thead><tr><th>Title</th><th>Category</th><th>Amount</th></tr></thead><tbody>
${(report?.expenses ?? []).map((e) => `<tr><td>${e.title}</td><td>${e.category}</td><td>${currencyFormatter.format(e.amount)}</td></tr>`).join('')}
</tbody></table>
<h3>Low Stock</h3>
<table><thead><tr><th>Product</th><th>Quantity</th><th>Threshold</th></tr></thead><tbody>
${(report?.lowStockSummary.items ?? []).map((item) => `<tr><td>${item.productName}</td><td>${item.quantity}</td><td>${item.threshold}</td></tr>`).join('')}
</tbody></table>
${report?.reportFooterMessage ? `<p style="margin-top:32px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px">${report.reportFooterMessage}</p>` : ''}
</body></html>`);
    win.document.close();
    win.print();
  }

  return (
    <div className="flex min-h-screen" style={{ background: '#0A0F0D', color: '#e2e8f0' }}>
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-24 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-5xl space-y-6">

          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#3ADB82]/70">Reports</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-100">Reports</h1>
            </div>
            <button
              type="button"
              onClick={() => setShowPdfModal(true)}
              className="rounded-xl px-4 py-2 text-sm font-medium transition"
              style={{ background: '#1B4332', color: '#3ADB82' }}
            >
              Preview & Print
            </button>
          </div>

          {pageError && (
            <div className="rounded-xl border border-rose-800/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-400">
              {pageError}
            </div>
          )}

          <div className="rounded-2xl p-5" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex flex-wrap gap-2 mb-4">
              {(['today', 'week', 'month', 'custom'] as QuickRange[]).map((r) => {
                const labels: Record<QuickRange, string> = { today: 'Today', week: 'This Week', month: 'This Month', custom: 'Custom Range' };
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    className="rounded-xl px-4 py-2 text-sm font-medium transition"
                    style={{
                      background: quickRange === r ? '#1B4332' : '#141A15',
                      color: quickRange === r ? '#3ADB82' : '#94a3b8',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {labels[r]}
                  </button>
                );
              })}
            </div>
            {quickRange === 'custom' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                />
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500">{report?.periodLabel ?? 'Loading range…'}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Sales', value: currencyFormatter.format(report?.totalSales ?? 0) },
              { label: 'Expenses', value: currencyFormatter.format(report?.expensesTotal ?? 0) },
              { label: 'Net', value: currencyFormatter.format(report?.netAmount ?? 0) },
              { label: 'Receipts', value: String(report?.salesCount ?? 0) },
            ].map((metric) => (
              <div key={metric.label} className="rounded-2xl p-5" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold text-[#3ADB82]">{metric.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <ReportPanel title="Best Sellers" description="Top products this period.">
              {(report?.bestSellingProducts ?? []).length === 0 && (
                <EmptyState text="No sales in selected period." />
              )}
              {(report?.bestSellingProducts ?? []).map((item) => (
                <DataRow
                  key={item.productName}
                  label={`${item.productName} · ${item.quantity} sold`}
                  value={currencyFormatter.format(item.revenue)}
                />
              ))}
            </ReportPanel>

            <ReportPanel title="Low Stock" description={`${report?.lowStockSummary.count ?? 0} products need attention.`}>
              {(report?.lowStockSummary.items ?? []).length === 0 && (
                <EmptyState text="No low stock products." />
              )}
              {(report?.lowStockSummary.items ?? []).map((item) => (
                <DataRow
                  key={item.productName}
                  label={`${item.productName} · threshold ${item.threshold}`}
                  value={`${item.quantity} left`}
                />
              ))}
            </ReportPanel>

            <ReportPanel title="Expenses" description="All expenses in this period.">
              {(report?.expenses ?? []).length === 0 && (
                <EmptyState text="No expenses in selected period." />
              )}
              {(report?.expenses ?? []).map((expense) => (
                <DataRow
                  key={expense.id}
                  label={`${expense.title} · ${expense.category}`}
                  value={currencyFormatter.format(expense.amount)}
                />
              ))}
            </ReportPanel>

            <ReportPanel
              title="Cash-Up"
              description={`Variance ${currencyFormatter.format(report?.shiftSummary.varianceTotal ?? 0)}`}
            >
              {(report?.shiftSummary.shifts ?? []).length === 0 && (
                <EmptyState text="No shifts in selected period." />
              )}
              {(report?.shiftSummary.shifts ?? []).map((shift) => (
                <div key={shift.id} className="rounded-xl p-4" style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-200">{shift.cashierName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {shift.status.toUpperCase()} · {new Date(shift.openedAt).toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Sales {currencyFormatter.format(shift.salesTotal)} · Expected {currencyFormatter.format(shift.expectedCash ?? shift.openingCash)} · Counted {currencyFormatter.format(shift.countedCash ?? 0)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${shift.variance === 0 ? 'bg-emerald-900/30 text-[#3ADB82]' : 'bg-amber-900/30 text-amber-400'}`}>
                        {currencyFormatter.format(shift.variance ?? 0)}
                      </span>
                      {isApprover && shift.status === 'closed' && (
                        <button
                          type="button"
                          onClick={() => approveMutation.mutate(shift.id)}
                          disabled={approveMutation.isPending}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                          style={{ background: '#1B4332', color: '#3ADB82' }}
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </ReportPanel>
          </div>
        </div>
      </main>

      {showPdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between mb-6">
              <BrandMark />
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                className="text-slate-500 hover:text-slate-300 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <h2 className="text-xl font-semibold text-slate-100">
              {report?.businessName ?? 'Evaya Naturals'} · {report?.title ?? 'Report'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">{report?.periodLabel ?? '—'} · Generated {previewGeneratedAt}</p>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Sales', value: currencyFormatter.format(report?.totalSales ?? 0) },
                { label: 'Expenses', value: currencyFormatter.format(report?.expensesTotal ?? 0) },
                { label: 'Net', value: currencyFormatter.format(report?.netAmount ?? 0) },
                { label: 'Receipts', value: String(report?.salesCount ?? 0) },
              ].map((m) => (
                <div key={m.label} className="rounded-xl p-3" style={{ background: '#141A15' }}>
                  <p className="text-xs uppercase tracking-wider text-slate-500">{m.label}</p>
                  <p className="mt-1 text-base font-semibold text-[#3ADB82]">{m.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Best Sellers</p>
                {(report?.bestSellingProducts ?? []).slice(0, 5).map((item) => (
                  <DataRow key={item.productName} label={`${item.productName} · ${item.quantity} sold`} value={currencyFormatter.format(item.revenue)} />
                ))}
                {(report?.bestSellingProducts ?? []).length === 0 && <p className="text-sm text-slate-500">None</p>}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Expenses</p>
                {(report?.expenses ?? []).slice(0, 5).map((e) => (
                  <DataRow key={e.id} label={`${e.title} · ${e.category}`} value={currencyFormatter.format(e.amount)} />
                ))}
                {(report?.expenses ?? []).length === 0 && <p className="text-sm text-slate-500">None</p>}
              </div>
            </div>

            {report?.reportFooterMessage && (
              <p className="mt-6 text-sm text-slate-500 border-t pt-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                {report.reportFooterMessage}
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={printReport}
                className="rounded-xl px-5 py-3 text-sm font-medium transition"
                style={{ background: '#1B4332', color: '#3ADB82' }}
              >
                Print / Save PDF
              </button>
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                className="rounded-xl px-5 py-3 text-sm font-medium text-slate-400 hover:text-slate-200 transition"
                style={{ background: '#141A15' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.06)' }}>
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      <div className="mt-4 space-y-2">{children}</div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: '#141A15' }}>
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-200">{value}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl px-4 py-6 text-center text-sm text-slate-500" style={{ border: '1px dashed rgba(255,255,255,0.08)' }}>
      {text}
    </div>
  );
}
