import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Receipt, ChevronDown } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { api } from '../services/api';
import type { Receipt as ReceiptType } from '../types';
import { formatUGX as ugx } from '../lib/currency';
import { SkeletonRows, EmptyState } from './ProductsPage';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function weekStartStr() {
  const d = new Date(); d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}
function monthStartStr() {
  const d = new Date(); d.setDate(1);
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

const iCls = 'rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10';

const QUICK_RANGES: { label: string; value: QuickRange }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Custom', value: 'custom' },
];

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

  const periodLabel =
    quickRange === 'today' ? 'Today'
    : quickRange === 'week' ? 'This Week'
    : quickRange === 'month' ? 'This Month'
    : `${startDate} → ${endDate}`;

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-12 pt-[76px] sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-4xl space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Sales &amp; Orders</h1>
            <p className="mt-0.5 text-sm text-slate-400">View all completed sales transactions.</p>
          </div>

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
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={iCls} />
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={iCls} />
                </>
              )}

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search receipt #…"
                className={`${iCls} ml-auto`}
              />
            </div>

            {!receiptsQuery.isLoading && receipts.length > 0 && (
              <div className="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-500">{periodLabel} · {receipts.length} {receipts.length === 1 ? 'sale' : 'sales'}</p>
                <p className="text-sm font-bold text-[#1B4332]">{ugx(total)}</p>
              </div>
            )}
          </div>

          {/* Receipts list */}
          <div className="space-y-2">
            {receiptsQuery.isLoading && (
              <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
                <SkeletonRows n={6} />
              </div>
            )}
            {!receiptsQuery.isLoading && receipts.length === 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
                <EmptyState icon={Receipt} text="No sales found for this period" />
              </div>
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

function ReceiptRow({ receipt, expanded, onToggle }: { receipt: ReceiptType; expanded: boolean; onToggle: () => void }) {
  const payLabel = PAYMENT_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <button type="button" onClick={onToggle} className="w-full px-5 py-4 text-left transition hover:bg-slate-50/60">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-sm font-semibold text-slate-900">#{receipt.receiptNumber}</p>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                {payLabel}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {receipt.customerName ?? 'Walk-in'} · {receipt.cashierName} · {new Date(receipt.createdAt).toLocaleString('en-UG')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="font-bold text-[#1B4332]">{ugx(receipt.total)}</p>
              {receipt.discount > 0 && (
                <p className="text-xs text-slate-400">disc. {ugx(receipt.discount)}</p>
              )}
            </div>
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="overflow-hidden rounded-xl border border-slate-100">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400">Item</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400">Qty</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400">Unit price</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {receipt.items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-slate-900">{item.productName}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{ugx(item.unitPrice)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-900">{ugx(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium text-slate-900">{ugx(receipt.subtotal)}</span>
            </div>
            {receipt.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Discount</span>
                <span className="font-medium text-rose-600">−{ugx(receipt.discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold">
              <span>Total</span>
              <span className="text-[#1B4332]">{ugx(receipt.total)}</span>
            </div>
            {receipt.notes && (
              <p className="text-xs text-slate-400 pt-1">Note: {receipt.notes}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
