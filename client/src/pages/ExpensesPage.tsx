import { FormEvent, useMemo, useState } from 'react';
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

export default function ExpensesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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

  const canManageExpenses = ['Admin', 'Branch Manager', 'Accountant'].includes(user?.role.name ?? '');
  const canDeleteExpenses = user?.role.name === 'Admin';

  const expensesQuery = useQuery({
    queryKey: ['pos-expenses-page', startDate, endDate],
    queryFn: () => api.pos.expenses({ startDate, endDate }),
  });

  const refreshExpenses = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pos-expenses'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-expenses-page'] }),
      queryClient.invalidateQueries({ queryKey: ['report-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['report-today'] }),
    ]);
  };

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
      await refreshExpenses();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => api.pos.deleteExpense(id),
    onSuccess: async () => {
      setPageError('');
      await refreshExpenses();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const expenses = expensesQuery.data?.expenses ?? [];
  const categories = expensesQuery.data?.categories ?? [];
  const totalAmount = useMemo(
    () => expenses.reduce((sum, expense) => sum + expense.amount, 0),
    [expenses],
  );

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Expenses</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">Keep daily spending tidy</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  Record only what matters, review the total quickly, and let reports pull from the same clean ledger.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SoftMetric label="Entries" value={String(expenses.length)} />
                <SoftMetric label="Total" value={currencyFormatter.format(totalAmount)} />
              </div>
            </div>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
              />
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
              />
              <button
                type="button"
                onClick={resetExpenseForm}
                className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                New expense
              </button>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{expenseId ? 'Edit expense' : 'Add expense'}</h2>
                  <p className="mt-1 text-sm text-slate-500">Short fields, quick entry, no approvals clutter.</p>
                </div>
              </div>
              <form className="mt-5 grid gap-3" onSubmit={handleSubmit}>
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
            </section>

            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Expense list</h2>
                  <p className="mt-1 text-sm text-slate-500">Only the selected date range, with a quick total at the top.</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {expenses.length === 0 && (
                  <EmptyState text="No expenses in the selected dates." />
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
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function SoftMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
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
