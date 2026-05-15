import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Printer, AlertTriangle } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { formatUGX as ugx } from '../lib/currency';
import { EmptyState, DestructiveModal } from './ProductsPage';

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
function weekStartStr() { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); }
function monthStartStr() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

type QuickRange = 'today' | 'week' | 'month' | 'custom';

function printExpenses(
  expenses: { title: string; category: string; amount: number; expenseDate: string; paymentMethod: string; description?: string | null; recordedByName?: string | null }[],
  total: number,
  label: string,
) {
  const rows = expenses.map((e) => `
    <tr>
      <td>${e.title}</td><td>${e.category}</td><td>${ugx(e.amount)}</td>
      <td>${e.paymentMethod.replace(/_/g, ' ')}</td>
      <td>${new Date(e.expenseDate).toLocaleDateString()}</td>
      <td>${e.recordedByName ?? ''}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html><head><title>Expenses — Evaya Naturals</title>
<style>body{font-family:sans-serif;font-size:12px;color:#111;padding:24px}h1{font-size:18px;margin-bottom:4px}.meta{color:#666;margin-bottom:20px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 10px;background:#f3f4f6;border-bottom:2px solid #e5e7eb}td{padding:8px 10px;border-bottom:1px solid #e5e7eb}.total{text-align:right;font-weight:bold;margin-top:16px;font-size:14px}.footer{margin-top:24px;color:#888;font-size:10px}</style>
</head><body>
<h1>Evaya Naturals — Expenses</h1>
<p class="meta">Period: ${label} · Generated: ${new Date().toLocaleString()}</p>
<table><thead><tr><th>Title</th><th>Category</th><th>Amount</th><th>Payment</th><th>Date</th><th>Recorded by</th></tr></thead><tbody>${rows}</tbody></table>
<p class="total">Total: ${ugx(total)}</p>
<p class="footer">Evaya Naturals Internal System</p>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => { win.print(); }, 400); }
}

const iCls = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10';
const iClsInline = 'rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10';

const QUICK_RANGES: { label: string; value: QuickRange }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Custom', value: 'custom' },
];

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
  const [deletingExpense, setDeletingExpense] = useState<{ id: string; title: string } | null>(null);

  const canManageExpenses = ['Admin', 'Branch Manager'].includes(user?.role.name ?? '');
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
    onSuccess: async () => { setDeletingExpense(null); setPageError(''); await refreshExpenses(); },
    onError: (e) => { setPageError(getErrorMessage(e)); setDeletingExpense(null); },
  });

  const expenses = expensesQuery.data?.expenses ?? [];
  const categories = expensesQuery.data?.categories ?? [];
  const total = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);

  const periodLabel =
    quickRange === 'today' ? 'Today'
    : quickRange === 'week' ? 'This Week'
    : quickRange === 'month' ? 'This Month'
    : `${startDate} → ${endDate}`;

  function resetForm() {
    setExpenseId(''); setTitle(''); setCategory(categories[0] ?? 'Rent');
    setAmount(''); setPaymentMethod('cash'); setExpenseDate(todayStr()); setDescription('');
  }

  function loadExpense(expense: typeof expenses[number]) {
    setExpenseId(expense.id); setTitle(expense.title); setCategory(expense.category);
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
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-12 pt-[76px] sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Expenses</h1>
            <p className="mt-0.5 text-sm text-slate-400">Record and review business spending.</p>
          </div>

          {pageError && (
            <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" />
              {pageError}
            </div>
          )}

          {/* Filter bar */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
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

              {quickRange === 'custom' && (
                <>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={iClsInline} />
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={iClsInline} />
                </>
              )}

              <div className="ml-auto flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-slate-500">{periodLabel}</p>
                  <p className="text-sm font-bold text-rose-600">{ugx(total)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => printExpenses(expenses, total, periodLabel)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  <Printer size={13} strokeWidth={1.75} />
                  Print
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[360px_1fr]">

            {/* Expense form */}
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">{expenseId ? 'Edit expense' : 'Add expense'}</h2>
                {expenseId && (
                  <button type="button" onClick={resetForm} className="text-xs font-medium text-slate-400 transition hover:text-slate-600">
                    Clear
                  </button>
                )}
              </div>
              <form className="space-y-3" onSubmit={handleSubmit}>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Expense title" disabled={!canManageExpenses} className={iCls} required />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={!canManageExpenses} className={iCls}>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (UGX)" disabled={!canManageExpenses} className={iCls} required />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as (typeof paymentMethodOptions)[number]['value'])} disabled={!canManageExpenses} className={iCls}>
                    {paymentMethodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} disabled={!canManageExpenses} className={iCls} required />
                </div>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description (optional)" disabled={!canManageExpenses} className={`${iCls} resize-none`} />
                <button type="submit" disabled={!canManageExpenses || expenseMutation.isPending} className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60" style={{ background: '#1B4332' }}>
                  {expenseMutation.isPending ? 'Saving…' : expenseId ? 'Save expense' : 'Add expense'}
                </button>
              </form>
            </div>

            {/* Expense list */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  {periodLabel}
                  <span className="ml-2 font-normal text-slate-400">({expenses.length})</span>
                </h2>
                <p className="text-sm font-bold text-rose-600">{ugx(total)}</p>
              </div>

              {expensesQuery.isLoading && (
                <div className="px-5 py-8 text-center text-sm text-slate-400">Loading…</div>
              )}
              {!expensesQuery.isLoading && expenses.length === 0 && (
                <EmptyState icon={CreditCard} text="No expenses for this period" />
              )}

              <div className="divide-y divide-slate-50">
                {expenses.map((expense) => (
                  <div key={expense.id} className="px-5 py-4 transition hover:bg-slate-50/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{expense.title}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {expense.category} · {new Date(expense.expenseDate).toLocaleDateString('en-UG')}
                          {expense.recordedByName ? ` · ${expense.recordedByName}` : ''}
                        </p>
                        {expense.description && (
                          <p className="mt-1 text-xs text-slate-400">{expense.description}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <p className="text-sm font-bold text-slate-900">{ugx(expense.amount)}</p>
                        {canManageExpenses && (
                          <button type="button" onClick={() => loadExpense(expense)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
                            Edit
                          </button>
                        )}
                        {canDeleteExpenses && (
                          <button type="button" onClick={() => setDeletingExpense({ id: expense.id, title: expense.title })} disabled={deleteMutation.isPending} className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-100 disabled:opacity-60">
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

      {deletingExpense && (
        <DestructiveModal
          title="Delete expense?"
          description={<>
            <strong className="text-slate-900">"{deletingExpense.title}"</strong> will be permanently removed. This cannot be undone.
          </>}
          confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deletingExpense.id)}
          onCancel={() => setDeletingExpense(null)}
        />
      )}
    </div>
  );
}
