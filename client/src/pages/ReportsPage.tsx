import { FormEvent, useState } from 'react';
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

const paymentMethodOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'mtn_mobile_money', label: 'MTN Mobile Money' },
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'bank_card', label: 'Bank Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
] as const;

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
  const [expenseId, setExpenseId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Rent');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<(typeof paymentMethodOptions)[number]['value']>('cash');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [pageError, setPageError] = useState('');

  const isApprover = ['Admin', 'Branch Manager'].includes(user?.role.name ?? '');
  const canManageExpenses = ['Admin', 'Branch Manager', 'Accountant'].includes(user?.role.name ?? '');
  const canDeleteExpenses = user?.role.name === 'Admin';

  const refreshOps = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['report-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['report-today'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-expenses'] }),
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

  const expensesQuery = useQuery({
    queryKey: ['pos-expenses', startDate, endDate],
    queryFn: () => api.pos.expenses({
      startDate: period === 'custom' ? startDate : undefined,
      endDate: period === 'custom' ? endDate : undefined,
    }),
    enabled: canManageExpenses,
  });

  const approveMutation = useMutation({
    mutationFn: (shiftId: string) => api.pos.approveShift(shiftId),
    onSuccess: async () => {
      setPageError('');
      await refreshOps();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const expenseMutation = useMutation({
    mutationFn: () => (
      expenseId
        ? api.pos.updateExpense(expenseId, {
            title,
            category,
            amount: Number(amount),
            paymentMethod,
            expenseDate,
            description: description || null,
          })
        : api.pos.createExpense({
            title,
            category,
            amount: Number(amount),
            paymentMethod,
            expenseDate,
            description: description || null,
          })
    ),
    onSuccess: async () => {
      resetExpenseForm();
      setPageError('');
      await refreshOps();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => api.pos.deleteExpense(id),
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
  const expenses = expensesQuery.data?.expenses ?? [];
  const categories = expensesQuery.data?.categories ?? [];

  function resetExpenseForm() {
    setExpenseId('');
    setTitle('');
    setCategory(categories[0] ?? 'Rent');
    setAmount('');
    setPaymentMethod('cash');
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setDescription('');
  }

  function loadExpense(expense: typeof expenses[number]) {
    setExpenseId(expense.id);
    setTitle(expense.title);
    setCategory(expense.category);
    setAmount(String(expense.amount));
    setPaymentMethod(expense.paymentMethod as (typeof paymentMethodOptions)[number]['value']);
    setExpenseDate(expense.expenseDate.slice(0, 10));
    setDescription(expense.description ?? '');
  }

  const handleExpenseSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await expenseMutation.mutateAsync();
  };

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <BrandMark />
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Reports and expenses</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">Clean operating reports with PDF download</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  Daily, weekly, or custom date reporting with sales, expenses, low stock, and cash-up summaries for Evaya Naturals.
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

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total sales" value={currencyFormatter.format(report?.totalSales ?? 0)} />
            <MetricCard label="Sales count" value={String(report?.salesCount ?? 0)} />
            <MetricCard label="Expenses" value={currencyFormatter.format(report?.expensesTotal ?? 0)} />
            <MetricCard label="Net after expenses" value={currencyFormatter.format(report?.netAmount ?? 0)} />
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="space-y-6">
              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Payment totals</h2>
                <div className="mt-5 space-y-3">
                  <StatusRow label="Cash" value={currencyFormatter.format(report?.paymentTotals.cash ?? 0)} />
                  <StatusRow label="MTN Mobile Money" value={currencyFormatter.format(report?.paymentTotals.mtnMobileMoney ?? 0)} />
                  <StatusRow label="Airtel Money" value={currencyFormatter.format(report?.paymentTotals.airtelMoney ?? 0)} />
                  <StatusRow label="Bank Card" value={currencyFormatter.format(report?.paymentTotals.card ?? 0)} />
                  <StatusRow label="Bank Transfer" value={currencyFormatter.format(report?.paymentTotals.bankTransfer ?? 0)} />
                  <StatusRow label="Discounts" value={currencyFormatter.format(report?.totalDiscounts ?? 0)} />
                </div>
              </div>

              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Best-selling products</h2>
                <div className="mt-5 space-y-3">
                  {(report?.bestSellingProducts ?? []).length === 0 && (
                    <EmptyState text="No sales in the selected period." />
                  )}
                  {(report?.bestSellingProducts ?? []).map((item) => (
                    <div key={item.productName} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">{item.productName}</p>
                        <p className="mt-1 text-xs text-slate-400">{item.quantity} units sold</p>
                      </div>
                      <span className="text-sm font-medium text-slate-900">{currencyFormatter.format(item.revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Shift and cash-up summary</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Variance summary {currencyFormatter.format(report?.shiftSummary.varianceTotal ?? 0)}.
                </p>
                <div className="mt-5 space-y-3">
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
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Low stock summary</h2>
                <p className="mt-1 text-sm text-slate-500">{report?.lowStockSummary.count ?? 0} products need attention.</p>
                <div className="mt-5 space-y-3">
                  {(report?.lowStockSummary.items ?? []).length === 0 && (
                    <EmptyState text="No low stock products right now." />
                  )}
                  {(report?.lowStockSummary.items ?? []).map((item) => (
                    <div key={item.productName} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">{item.productName}</p>
                        <p className="mt-1 text-xs text-slate-400">Threshold {item.threshold}</p>
                      </div>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                        {item.quantity} left
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{expenseId ? 'Edit expense' : 'Add expense'}</h2>
                    <p className="mt-1 text-sm text-slate-500">Simple branch expenses that feed directly into reports.</p>
                  </div>
                  {expenseId && (
                    <button
                      type="button"
                      onClick={resetExpenseForm}
                      className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      New expense
                    </button>
                  )}
                </div>
                <form className="mt-5 grid gap-3" onSubmit={handleExpenseSubmit}>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Expense title"
                    disabled={!canManageExpenses}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
                    required
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      disabled={!canManageExpenses}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
                    >
                      {categories.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="Amount (UGX)"
                      disabled={!canManageExpenses}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
                      required
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value as (typeof paymentMethodOptions)[number]['value'])}
                      disabled={!canManageExpenses}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
                    >
                      {paymentMethodOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={expenseDate}
                      onChange={(event) => setExpenseDate(event.target.value)}
                      disabled={!canManageExpenses}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
                      required
                    />
                  </div>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    placeholder="Description (optional)"
                    disabled={!canManageExpenses}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 disabled:bg-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={!canManageExpenses || expenseMutation.isPending}
                    className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {expenseMutation.isPending ? 'Saving…' : expenseId ? 'Save expense' : 'Add expense'}
                  </button>
                </form>
              </div>

              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Expenses list</h2>
                <p className="mt-1 text-sm text-slate-500">Operational spending for the selected period.</p>
                <div className="mt-5 space-y-3">
                  {expenses.length === 0 && (
                    <EmptyState text="No expenses in the selected period." />
                  )}
                  {expenses.map((expense) => (
                    <div key={expense.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{expense.title}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {expense.category} · {new Date(expense.expenseDate).toLocaleDateString()} · {expense.recordedByName}
                          </p>
                          {expense.description && <p className="mt-2 text-sm text-slate-500">{expense.description}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{currencyFormatter.format(expense.amount)}</span>
                          {canManageExpenses && (
                            <button
                              type="button"
                              onClick={() => loadExpense(expense)}
                              className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-white"
                            >
                              Edit
                            </button>
                          )}
                          {canDeleteExpenses && (
                            <button
                              type="button"
                              onClick={() => deleteExpenseMutation.mutate(expense.id)}
                              className="rounded-full border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                            >
                              Delete
                            </button>
                          )}
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
