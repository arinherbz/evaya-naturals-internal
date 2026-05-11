import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api } from '../services/api';
import type { Receipt } from '../types';
import { formatUGX as ugx } from '../lib/currency';

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

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  mtn_mobile_money: 'MTN MoMo',
  airtel_money: 'Airtel Money',
  bank_card: 'Bank Card',
  bank_transfer: 'Bank Transfer',
};

export default function OrdersPage() {
  const [quickRange, setQuickRange] = useState<QuickRange>('today');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const setRange = (range: QuickRange) => {
    setQuickRange(range);
    const today = todayStr();
    if (range === 'today') { setStartDate(today); setEndDate(today); }
    else if (range === 'week') { setStartDate(weekStartStr()); setEndDate(today); }
    else if (range === 'month') { setStartDate(monthStartStr()); setEndDate(today); }
  };

  const receiptsQuery = useQuery({
    queryKey: ['receipts', startDate, endDate, search],
    queryFn: () => api.pos.receipts({ startDate, endDate, search: search || undefined }),
  });

  const receipts = receiptsQuery.data?.receipts ?? [];
  const total = receipts.reduce((sum, r) => sum + r.total, 0);

  const periodLabel = quickRange === 'today' ? 'Today'
    : quickRange === 'week' ? 'This Week'
    : quickRange === 'month' ? 'This Month'
    : `${startDate} to ${endDate}`;

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-4xl space-y-6">

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Sales</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Sales &amp; Receipts</h1>
            <p className="mt-1 text-sm text-slate-500">View all completed sales transactions.</p>
          </section>

          {/* Filter bar */}
          <div className="rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center gap-3">
              {(['today', 'week', 'month', 'custom'] as QuickRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                    quickRange === r
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
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
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-400"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-400"
                  />
                </>
              )}

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search receipt #…"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-400"
              />

              <div className="ml-auto text-right">
                <p className="text-xs text-slate-500">{periodLabel} · {receipts.length} sales</p>
                <p className="font-bold text-emerald-700">{ugx(total)}</p>
              </div>
            </div>
          </div>

          {/* Receipts list */}
          <div className="space-y-3">
            {receiptsQuery.isLoading && (
              <p className="py-8 text-center text-sm text-slate-400">Loading receipts…</p>
            )}
            {!receiptsQuery.isLoading && receipts.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-400">No sales found for this period</p>
            )}
            {receipts.map((receipt) => (
              <ReceiptRow
                key={receipt.id}
                receipt={receipt}
                expanded={expandedId === receipt.id}
                onToggle={() => setExpandedId(expandedId === receipt.id ? null : receipt.id)}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function ReceiptRow({ receipt, expanded, onToggle }: { receipt: Receipt; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white/90 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
      <button type="button" onClick={onToggle} className="w-full px-5 py-4 text-left">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-sm font-semibold text-slate-900">#{receipt.receiptNumber}</p>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                {PAYMENT_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {receipt.customerName ?? 'Walk-in'} · {receipt.cashierName} · {new Date(receipt.createdAt).toLocaleString('en-UG')}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-bold text-emerald-700">{ugx(receipt.total)}</p>
            {receipt.discount > 0 && (
              <p className="text-xs text-slate-400">disc. {ugx(receipt.discount)}</p>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-3">
          <div className="rounded-2xl border border-slate-100 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400">Item</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400">Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400">Unit price</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {receipt.items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-slate-900">{item.productName}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{item.quantity}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{ugx(item.unitPrice)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-900">{ugx(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-semibold">{ugx(receipt.subtotal)}</span>
          </div>
          {receipt.discount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Discount</span>
              <span className="font-semibold text-rose-600">-{ugx(receipt.discount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-100 pt-3 text-sm font-bold">
            <span>Total</span>
            <span className="text-emerald-700">{ugx(receipt.total)}</span>
          </div>
          {receipt.notes && (
            <p className="text-xs text-slate-400">Note: {receipt.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
