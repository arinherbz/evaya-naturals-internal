import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api } from '../services/api';
import type { Receipt } from '../types';

const ugx = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

const paymentLabel = (m: string) =>
  ({ cash: 'Cash', mtn_mobile_money: 'MTN MoMo', airtel_money: 'Airtel Money', bank_card: 'Card', bank_transfer: 'Bank Transfer' }[m] ?? m);

export default function ReceiptsPage() {
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<Receipt | null>(null);

  const receiptsQuery = useQuery({
    queryKey: ['receipts', search, fromDate, toDate],
    queryFn: () => api.pos.receipts({ search: search || undefined, startDate: fromDate || undefined, endDate: toDate || undefined }),
  });

  const receipts = receiptsQuery.data?.receipts ?? [];

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-24 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-4xl space-y-6">

          <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Sales</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Receipts</h1>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receipt # or customer…"
              className="flex-1 min-w-[180px] rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-400"
            />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-400"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-400"
            />
            {(search || fromDate || toDate) && (
              <button
                type="button"
                onClick={() => { setSearch(''); setFromDate(''); setToDate(''); }}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-500 transition hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>

          {/* List */}
          <div className="space-y-2">
            {receiptsQuery.isLoading && (
              <div className="py-10 text-center text-sm text-slate-400">Loading receipts…</div>
            )}
            {!receiptsQuery.isLoading && receipts.length === 0 && (
              <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/60 py-10 text-center text-sm text-slate-400">
                No receipts found
              </div>
            )}
            {receipts.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r)}
                className="w-full rounded-[28px] border border-white/70 bg-white/90 p-5 text-left shadow-[0_20px_50px_rgba(15,23,42,0.05)] transition hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{r.receiptNumber}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {r.customerName ?? 'Walk-in'} · {paymentLabel(r.paymentMethod)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {new Date(r.createdAt).toLocaleString('en-UG')} · {r.cashierName}
                    </p>
                  </div>
                  <p className="shrink-0 text-base font-bold text-emerald-700">{ugx(r.total)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* Receipt Preview Modal */}
      {selected && (
        <ReceiptModal receipt={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function ReceiptModal({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const handlePrint = () => window.print();

  const handleSavePdf = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-sm rounded-[28px] bg-white shadow-2xl">
        {/* Non-print controls */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 print:hidden">
          <p className="text-sm font-semibold text-slate-900">{receipt.receiptNumber}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
            >
              Print
            </button>
            <button
              type="button"
              onClick={handleSavePdf}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>

        {/* Receipt body */}
        <div className="px-6 py-5 text-sm" id="receipt-print-area">
          <div className="text-center mb-4">
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

          <div className="border-t border-slate-100 pt-3 mb-3 space-y-1">
            {receipt.items.map((item) => (
              <div key={item.id} className="flex justify-between text-xs">
                <span className="text-slate-700">{item.productName} × {item.quantity}</span>
                <span className="text-slate-900 font-medium">{ugx(item.total)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 pt-3 space-y-1 text-xs">
            {receipt.discount > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Discount</span><span>-{ugx(receipt.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm text-slate-900">
              <span>Total</span><span>{ugx(receipt.total)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Payment</span><span>{({ cash: 'Cash', mtn_mobile_money: 'MTN MoMo', airtel_money: 'Airtel Money', bank_card: 'Card', bank_transfer: 'Bank Transfer' }[receipt.paymentMethod] ?? receipt.paymentMethod)}</span>
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
