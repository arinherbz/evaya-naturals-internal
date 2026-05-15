import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Printer, X, TrendingUp, Package, FileText, AlertTriangle, type LucideIcon } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import BrandMark from '../components/BrandMark';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { formatUGX } from '../lib/currency';
import { EmptyState } from './ProductsPage';

const ugx = { format: formatUGX };

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function weekStartStr() { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); }
function monthStartStr() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

type QuickRange = 'today' | 'week' | 'month' | 'custom';

const iCls = 'rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10';

const QUICK_RANGES: { label: string; value: QuickRange }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Custom', value: 'custom' },
];

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
    onSuccess: async () => { setPageError(''); await refreshOps(); },
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
<style>body{font-family:system-ui,sans-serif;margin:0;padding:32px;color:#0f172a;background:#fff}h1{font-size:24px;font-weight:700;margin:0 0 4px}p{margin:0 0 4px;font-size:13px;color:#64748b}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:13px}th{text-align:left;border-bottom:2px solid #e2e8f0;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}td{border-bottom:1px solid #f1f5f9;padding:10px 12px}.header{border-bottom:2px solid #0f172a;padding-bottom:20px;margin-bottom:24px}.brand{font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.5px}.brand span{color:#1B4332}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:20px 0}.metric{border:1px solid #e2e8f0;border-radius:12px;padding:16px}.metric-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:8px}.metric-value{font-size:20px;font-weight:700;color:#0f172a}h3{font-size:14px;font-weight:600;margin:24px 0 8px}@media print{body{padding:0}}</style>
</head><body>
<div class="header"><div class="brand">EVAYA <span>NATURALS</span></div><h1 style="margin-top:12px">${report?.businessName ?? 'Evaya Naturals'} · ${report?.title ?? 'Report'}</h1><p>${dateRange} · Generated ${previewGeneratedAt}</p></div>
<div class="metrics">
  <div class="metric"><div class="metric-label">Sales</div><div class="metric-value">${ugx.format(report?.totalSales ?? 0)}</div></div>
  <div class="metric"><div class="metric-label">Expenses</div><div class="metric-value">${ugx.format(report?.expensesTotal ?? 0)}</div></div>
  <div class="metric"><div class="metric-label">Balance</div><div class="metric-value">${ugx.format(report?.netAmount ?? 0)}</div></div>
  <div class="metric"><div class="metric-label">Receipts</div><div class="metric-value">${report?.salesCount ?? 0}</div></div>
</div>
<h3>Best Sellers</h3>
<table><thead><tr><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr></thead><tbody>
${(report?.bestSellingProducts ?? []).map((item) => `<tr><td>${item.productName}</td><td>${item.quantity}</td><td>${ugx.format(item.revenue)}</td></tr>`).join('')}
</tbody></table>
<h3>Expenses</h3>
<table><thead><tr><th>Title</th><th>Category</th><th>Amount</th></tr></thead><tbody>
${(report?.expenses ?? []).map((e) => `<tr><td>${e.title}</td><td>${e.category}</td><td>${ugx.format(e.amount)}</td></tr>`).join('')}
</tbody></table>
<h3>Low Stock</h3>
<table><thead><tr><th>Product</th><th>Quantity</th></tr></thead><tbody>
${(report?.lowStockSummary.items ?? []).map((item) => `<tr><td>${item.productName}</td><td>${item.quantity}</td></tr>`).join('')}
</tbody></table>
${report?.reportFooterMessage ? `<p style="margin-top:32px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px">${report.reportFooterMessage}</p>` : ''}
</body></html>`);
    win.document.close();
    win.print();
  }

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-12 pt-[76px] sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-5xl space-y-6">

          {/* Header */}
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
              <p className="mt-0.5 text-sm text-slate-400">Sales, expenses, and operational insights.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowPdfModal(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Printer size={14} strokeWidth={1.75} />
              Preview &amp; Print
            </button>
          </div>

          {pageError && (
            <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" />
              {pageError}
            </div>
          )}

          {/* Period selector */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {QUICK_RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRange(r.value)}
                  className={`rounded-lg px-3.5 py-2 text-xs font-medium transition ${
                    quickRange === r.value
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {quickRange === 'custom' && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={iCls} />
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={iCls} />
              </div>
            )}
            {report && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">{report.periodLabel}</p>
            )}
          </div>

          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Revenue', value: ugx.format(report?.totalSales ?? 0), color: 'text-[#1B4332]' },
              { label: 'Expenses', value: ugx.format(report?.expensesTotal ?? 0), color: 'text-rose-600' },
              { label: 'Balance', value: ugx.format(report?.netAmount ?? 0), color: 'text-slate-900' },
              { label: 'Receipts', value: String(report?.salesCount ?? 0), color: 'text-slate-900' },
            ].map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium text-slate-400">{metric.label}</p>
                <p className={`mt-2 text-2xl font-bold ${metric.color}`}>{metric.value}</p>
              </div>
            ))}
          </div>

          {/* Daily Breakdown */}
          {report && report.sales.length > 0 && quickRange !== 'today' && (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Daily Breakdown</h2>
              <p className="mt-0.5 text-xs text-slate-400">Sales per day in selected period</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-2.5 text-left text-xs font-medium text-slate-400">Date</th>
                      <th className="pb-2.5 text-right text-xs font-medium text-slate-400">Receipts</th>
                      <th className="pb-2.5 text-right text-xs font-medium text-slate-400">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {Object.entries(
                      report.sales.reduce<Record<string, { count: number; revenue: number }>>((acc, s) => {
                        const day = s.createdAt.slice(0, 10);
                        if (!acc[day]) acc[day] = { count: 0, revenue: 0 };
                        acc[day].count += 1;
                        acc[day].revenue += s.total;
                        return acc;
                      }, {}),
                    )
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([day, { count, revenue }]) => (
                        <tr key={day}>
                          <td className="py-2.5 text-slate-700">{new Date(day).toLocaleDateString('en-UG', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                          <td className="py-2.5 text-right text-slate-500">{count}</td>
                          <td className="py-2.5 text-right font-semibold text-[#1B4332]">{ugx.format(revenue)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Report panels */}
          <div className="grid gap-6 xl:grid-cols-2">
            <ReportPanel title="Best Sellers" description="Top products this period." icon={TrendingUp}>
              {(report?.bestSellingProducts ?? []).length === 0
                ? <EmptyState icon={TrendingUp} text="No sales in selected period." />
                : (report?.bestSellingProducts ?? []).map((item) => (
                    <DataRow key={item.productName} label={`${item.productName} · ${item.quantity} sold`} value={ugx.format(item.revenue)} />
                  ))}
            </ReportPanel>

            <ReportPanel title="Low Stock" description={`${report?.lowStockSummary.count ?? 0} products need attention.`} icon={Package}>
              {(report?.lowStockSummary.items ?? []).length === 0
                ? <EmptyState icon={Package} text="No low stock products." />
                : (report?.lowStockSummary.items ?? []).map((item) => (
                    <DataRow key={item.productName} label={`${item.productName}`} value={`${item.quantity} left`} />
                  ))}
            </ReportPanel>

            <ReportPanel title="Expenses" description="All expenses this period." icon={FileText}>
              {(report?.expenses ?? []).length === 0
                ? <EmptyState icon={FileText} text="No expenses in selected period." />
                : (report?.expenses ?? []).map((expense) => (
                    <DataRow key={expense.id} label={`${expense.title} · ${expense.category}`} value={ugx.format(expense.amount)} />
                  ))}
            </ReportPanel>

            <ReportPanel title="Cash-Up" description={`Variance ${ugx.format(report?.shiftSummary.varianceTotal ?? 0)}`} icon={BarChart3}>
              {(report?.shiftSummary.shifts ?? []).length === 0
                ? <EmptyState icon={BarChart3} text="No shifts in selected period." />
                : (report?.shiftSummary.shifts ?? []).map((shift) => (
                    <div key={shift.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{shift.cashierName}</p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {shift.status.toUpperCase()} · {new Date(shift.openedAt).toLocaleString()}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Sales {ugx.format(shift.salesTotal)} · Expected {ugx.format(shift.expectedCash ?? shift.openingCash)} · Counted {ugx.format(shift.countedCash ?? 0)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${shift.variance === 0 ? 'bg-emerald-50 text-[#1B4332] border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                            {ugx.format(shift.variance ?? 0)}
                          </span>
                          {isApprover && shift.status === 'closed' && (
                            <button
                              type="button"
                              onClick={() => approveMutation.mutate(shift.id)}
                              disabled={approveMutation.isPending}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
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

      {/* Print modal */}
      {showPdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-100 bg-white p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <BrandMark />
              <button type="button" onClick={() => setShowPdfModal(false)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100" aria-label="Close">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            <h2 className="text-lg font-semibold text-slate-900">
              {report?.businessName ?? 'Evaya Naturals'} · {report?.title ?? 'Report'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">{report?.periodLabel ?? '—'} · Generated {previewGeneratedAt}</p>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Revenue', value: ugx.format(report?.totalSales ?? 0) },
                { label: 'Expenses', value: ugx.format(report?.expensesTotal ?? 0) },
                { label: 'Balance', value: ugx.format(report?.netAmount ?? 0) },
                { label: 'Receipts', value: String(report?.salesCount ?? 0) },
              ].map((m) => (
                <div key={m.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-400">{m.label}</p>
                  <p className="mt-1 text-base font-bold text-slate-900">{m.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-slate-400">Best Sellers</p>
                {(report?.bestSellingProducts ?? []).slice(0, 5).map((item) => (
                  <DataRow key={item.productName} label={`${item.productName} · ${item.quantity} sold`} value={ugx.format(item.revenue)} />
                ))}
                {(report?.bestSellingProducts ?? []).length === 0 && <p className="text-sm text-slate-400">None</p>}
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-slate-400">Expenses</p>
                {(report?.expenses ?? []).slice(0, 5).map((e) => (
                  <DataRow key={e.id} label={`${e.title} · ${e.category}`} value={ugx.format(e.amount)} />
                ))}
                {(report?.expenses ?? []).length === 0 && <p className="text-sm text-slate-400">None</p>}
              </div>
            </div>

            {report?.reportFooterMessage && (
              <p className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-400">{report.reportFooterMessage}</p>
            )}

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={printReport} className="flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: '#1B4332' }}>
                <Printer size={14} strokeWidth={1.75} />
                Print / Save PDF
              </button>
              <button type="button" onClick={() => setShowPdfModal(false)} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportPanel({ title, description, icon: Icon, children }: { title: string; description: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon size={15} strokeWidth={1.75} className="text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <p className="mt-0.5 text-xs text-slate-400">{description}</p>
      <div className="mt-4 space-y-2">{children}</div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}
