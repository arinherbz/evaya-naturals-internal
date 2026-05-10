import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';

const ugx = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

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

function todayStr() { return new Date().toISOString().slice(0, 10); }

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

function printExpenses(expenses: { title: string; category: string; amount: number; expenseDate: string; paymentMethod: string; description?: string | null; recordedByName?: string | null }[], total: number, label: string) {
  const rows = expenses.map((e) => `
    <tr>
      <td>${e.title}</td>
      <td>${e.category}</td>
      <td>${ugx(e.amount)}</td>
      <td>${e.paymentMethod.replace(/_/g, ' ')}</td>
      <td>${new Date(e.expenseDate).toLocaleDateString()}</td>
      <td>${e.recordedByName ?? ''}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html><html><head>
    <title>Expenses — Evaya Naturals</title>
    <style>
      body { font-family: sans-serif; font-size: 12px; color: #111; padding: 24px; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      .meta { color: #666; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; padding: 8px 10px; background: #f3f4f6; border-bottom: 2px solid #e5e7eb; }
      td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
      .total { text-align: right; font-weight: bold; margin-top: 16px; font-size: 14px; }
      .footer { margin-top: 24px; color: #888; font-size: 10px; }
    </style>
    </head><body>
    <h1>Evaya Naturals — Expenses</h1>
    <p class="meta">Period: ${label} · Generated: ${new Date().toLocaleString()}</p>
    <table>
      <thead><tr><th>Title</th><th>Category</th><th>Amount</th><th>Payment</th><th>Date</th><th>Recorded by</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="total">Total: ${ugx(total)}</p>
    <p class="footer">Evaya Naturals Internal System</p>
    </body></html>
  `;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }
}

export default function ExpensesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [quickRange, setQuickRange] = useState<QuickRange>('today');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [expenseId, setExpenseId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Rent');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<(typeof paymentMethodOptions)[number]['value']>('cash');
  const [expenseDate, setExpenseDate] = useState(todayStr());
  const [description, setDescription] = useState('');
  const [pageError, setPageError] = useState('');

  const canManageExpenses = ['Admin', 'Branch Manager', 'Accountant'].includes(user?.role.name ?? '');
  const canDeleteExpenses = user?.role.name === 'Admin';

  const setRange = (range: QuickRange) => {
    setQuickRange(range);
    const today = todayStr();
    if (range === 'today') { setStartDate(today); setEndDate(today); }
    else if (range === 'week') { setStartDate(weekStartStr()); setEndDate(today); }
    else if (range === 'month') { setStartDate(monthStartStr()); setEndDate(today); }
  };

  const expensesQuery = useQuery({
    queryKey: ['pos-expenses-page', startDate, endDate],
    queryFn: () => api.pos.expenses({ startDate, endDate }),
  });

  const refreshExpenses = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pos-expenses'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-expenses-page'] }),
      queryClient.invalidateQueries({ queryKey: ['report-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['report-today'] }),
    ]);

  const expenseMutation = useMutation({
    mutationFn: () => (
      expenseId
        ? api.pos.updateExpense(expenseId, { title, category, amount: Number(amount), paymentMethod, expenseDate, description: description || null })
        : api.pos.createExpense({ title, category, amount: Number(amount), paymentMethod, expenseDate, description: description || null })
    ),
    onSuccess: async () => { resetForm(); setPageError(''); await refreshExpenses(); },
    onError: (e) => setPageError(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.pos.deleteExpense(id),
    onSuccess: async () => { setPageError(''); await refreshExpenses(); },
    onError: (e) => setPageError(getErrorMessage(e)),
  });

  const expenses = expensesQuery.data?.expenses ?? [];
  const categories = expensesQuery.data?.categories ?? [];
  const total = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);

  const periodLabel = quickRange === 'today' ? 'Today'
    : quickRange === 'week' ? 'This Week'
    : quickRange === 'month' ? 'This Month'
    : `${startDate} to ${endDate}`;

  function resetForm() {
    setExpenseId('');
    setTitle('');
    setCategory(categories[0] ?? 'Rent');
    setAmount('');
    setPaymentMethod('cash');
    setExpenseDate(todayStr());
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPageError('');
    await expenseMutation.mutateAsync();
  };

  return (
    <div className="flex min-h-screen" style={{ background: '#0A0F0D', color: '#E2E8E4' }}>
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl space-y-6">

          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: '#3ADB82' }}>Expenses</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Expenses</h1>
            <p className="mt-1 text-sm" style={{ color: '#6B7F73' }}>Record and review business spending.</p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-800/40 bg-rose-900/30 px-4 py-3 text-sm text-rose-300">
              {pageError}
            </div>
          )}

          {/* Filter bar */}
          <div className="rounded-2xl p-4" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex flex-wrap items-center gap-3">
              {(['today', 'week', 'month', 'custom'] as QuickRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold transition"
                  style={
                    quickRange === r
                      ? { background: '#1B4332', color: '#3ADB82' }
                      : { background: '#141A15', color: '#6B7F73' }
                  }
                >
                  {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : 'Custom Range'}
                </button>
              ))}

              {quickRange === 'custom' && (
                <>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="rounded-xl px-4 py-2 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded-xl px-4 py-2 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                  />
                </>
              )}

              <div className="ml-auto flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs" style={{ color: '#6B7F73' }}>{periodLabel}</p>
                  <p className="font-mono-nums font-black" style={{ color: '#3ADB82' }}>{ugx(total)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => printExpenses(expenses, total, periodLabel)}
                  className="rounded-xl px-4 py-2.5 text-xs font-semibold transition hover:brightness-110"
                  style={{ background: '#141A15', color: '#A0ABA4' }}
                >
                  Export PDF
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[360px_1fr]">

            {/* Expense form */}
            <div className="rounded-2xl p-6" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{expenseId ? 'Edit expense' : 'Add expense'}</h2>
                {expenseId && (
                  <button type="button" onClick={resetForm} className="text-xs" style={{ color: '#6B7F73' }}>
                    Clear
                  </button>
                )}
              </div>
              <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Expense title"
                  disabled={!canManageExpenses}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={!canManageExpenses}
                    className="rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Amount (UGX)"
                    disabled={!canManageExpenses}
                    className="rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as (typeof paymentMethodOptions)[number]['value'])}
                    disabled={!canManageExpenses}
                    className="rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                  >
                    {paymentMethodOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    disabled={!canManageExpenses}
                    className="rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                    required
                  />
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Description (optional)"
                  disabled={!canManageExpenses}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                />
                <button
                  type="submit"
                  disabled={!canManageExpenses || expenseMutation.isPending}
                  className="w-full rounded-xl py-3 text-sm font-bold transition disabled:opacity-60 hover:brightness-110"
                  style={{ background: '#1B4332', color: '#3ADB82' }}
                >
                  {expenseMutation.isPending ? 'Saving…' : expenseId ? 'Save expense' : 'Add expense'}
                </button>
              </form>
            </div>

            {/* Expense list */}
            <div className="rounded-2xl" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center justify-between px-6 py-5">
                <h2 className="text-lg font-bold text-white">
                  {periodLabel}
                  <span className="ml-2 text-sm font-normal" style={{ color: '#6B7F73' }}>
                    ({expenses.length} entries)
                  </span>
                </h2>
                <p className="font-mono-nums font-black" style={{ color: '#3ADB82' }}>{ugx(total)}</p>
              </div>

              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.03)' }}>
                {expenses.length === 0 && !expensesQuery.isLoading && (
                  <p className="px-6 py-8 text-center text-sm" style={{ color: '#6B7F73' }}>
                    No expenses for this period
                  </p>
                )}
                {expenses.map((expense) => (
                  <div key={expense.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white">{expense.title}</p>
                        <p className="mt-0.5 text-xs" style={{ color: '#6B7F73' }}>
                          {expense.category} · {new Date(expense.expenseDate).toLocaleDateString('en-UG')}
                          {expense.recordedByName ? ` · ${expense.recordedByName}` : ''}
                        </p>
                        {expense.description && (
                          <p className="mt-1 text-xs" style={{ color: '#A0ABA4' }}>{expense.description}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <p className="font-mono-nums font-bold text-white">{ugx(expense.amount)}</p>
                        {canManageExpenses && (
                          <button
                            type="button"
                            onClick={() => loadExpense(expense)}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                            style={{ background: '#1A2E25', color: '#3ADB82' }}
                          >
                            Edit
                          </button>
                        )}
                        {canDeleteExpenses && (
                          <button
                            type="button"
                            onClick={() => deleteMutation.mutate(expense.id)}
                            disabled={deleteMutation.isPending}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                            style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}
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
          </div>
        </div>
      </main>
    </div>
  );
}
