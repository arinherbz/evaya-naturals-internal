import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Receipt, Search, Printer, X } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { api } from '../services/api';
import { formatUGX as ugx } from '../lib/currency';
import type { Receipt as ReceiptType } from '../types';
import { SkeletonRows, EmptyState } from './ProductsPage';

const paymentLabel = (m: string) =>
  ({ cash: 'Cash', mtn_mobile_money: 'MTN MoMo', airtel_money: 'Airtel Money', bank_card: 'Card', bank_transfer: 'Bank Transfer' }[m] ?? m);

const iCls = 'rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10';

export default function ReceiptsPage() {
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<ReceiptType | null>(null);

  const receiptsQuery = useQuery({
    queryKey: ['receipts', search, fromDate, toDate],
    queryFn: () => api.pos.receipts({ search: search || undefined, startDate: fromDate || undefined, endDate: toDate || undefined }),
  });

  const receipts = receiptsQuery.data?.receipts ?? [];
  const hasFilters = !!(search || fromDate || toDate);

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-12 pt-[76px] sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-4xl space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Receipts</h1>
            <p className="mt-0.5 text-sm text-slate-400">Search and review all issued receipts.</p>
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={14} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Receipt # or customer…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-4 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10"
                />
              </div>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={iCls} />
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={iCls} />
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setFromDate(''); setToDate(''); }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
                >
                  Clear
                </button>
              )}
            </div>
            {!receiptsQuery.isLoading && receipts.length > 0 && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
                {receipts.length} {receipts.length === 1 ? 'receipt' : 'receipts'}
              </p>
            )}
          </div>

          {/* List */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
            {receiptsQuery.isLoading && <SkeletonRows n={7} />}

            {!receiptsQuery.isLoading && receipts.length === 0 && (
              <EmptyState icon={Receipt} text="No receipts found" />
            )}

            {receipts.length > 0 && (
              <div className="divide-y divide-slate-50">
                {receipts.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelected(r)}
                    className="w-full px-5 py-4 text-left transition hover:bg-slate-50/60"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm font-semibold text-slate-900">{r.receiptNumber}</p>
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
                            {paymentLabel(r.paymentMethod)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {r.customerName ?? 'Walk-in'} · {r.cashierName}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {new Date(r.createdAt).toLocaleString('en-UG')}
                        </p>
                      </div>
                      <p className="shrink-0 font-bold text-[#1B4332]">{ugx(r.total)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {selected && <ReceiptModal receipt={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ReceiptModal({ receipt, onClose }: { receipt: ReceiptType; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-100 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 print:hidden">
          <p className="font-mono text-sm font-semibold text-slate-900">{receipt.receiptNumber}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white transition hover:opacity-90"
              style={{ background: '#1B4332' }}
            >
              <Printer size={13} strokeWidth={1.75} />
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100"
              aria-label="Close"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Receipt body */}
        <div className="px-6 py-5 text-sm" id="receipt-print-area">
          <div className="mb-4 text-center">
            <p className="text-base font-bold text-slate-900">{receipt.businessName}</p>
            <p className="text-xs text-slate-500">{receipt.branchName}</p>
          </div>

          <div className="mb-3 space-y-1 text-xs text-slate-500">
            <div className="flex justify-between">
              <span>Receipt</span><span className="font-mono text-slate-900">{receipt.receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Date</span><span>{new Date(receipt.createdAt).toLocaleString('en-UG')}</span>
            </div>
            <div className="flex justify-between">
              <span>Cashier</span><span>{receipt.cashierName}</span>
            </div>
            {receipt.customerName && (
              <div className="flex justify-between">
                <span>Customer</span><span>{receipt.customerName}</span>
              </div>
            )}
          </div>

          <div className="mb-3 space-y-1 border-t border-slate-100 pt-3">
            {receipt.items.map((item) => (
              <div key={item.id} className="flex justify-between text-xs">
                <span className="text-slate-700">{item.productName} × {item.quantity}</span>
                <span className="font-medium text-slate-900">{ugx(item.total)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1 border-t border-slate-200 pt-3 text-xs">
            {receipt.discount > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Discount</span><span>−{ugx(receipt.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-slate-900">
              <span>Total</span><span>{ugx(receipt.total)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Payment</span><span>{paymentLabel(receipt.paymentMethod)}</span>
            </div>
          </div>

          {receipt.receiptFooterMessage && (
            <p className="mt-4 text-center text-xs text-slate-400">{receipt.receiptFooterMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
