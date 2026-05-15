import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';

type UpdateReason = 'stock_count_correction' | 'damaged' | 'expired' | 'returned' | 'other';

type UpdateStockFormState = {
  productId: string;
  branchId: string;
  reason: UpdateReason;
  quantityChange: string;
  explanation: string;
};

const emptyForm: UpdateStockFormState = {
  productId: '',
  branchId: '',
  reason: 'stock_count_correction',
  quantityChange: '',
  explanation: '',
};

const reasonOptions: Array<{
  value: UpdateReason;
  label: string;
  movementType: 'adjustment' | 'damaged' | 'expired' | 'returned';
}> = [
  { value: 'stock_count_correction', label: 'Stock count correction', movementType: 'adjustment' },
  { value: 'damaged', label: 'Damaged', movementType: 'damaged' },
  { value: 'expired', label: 'Expired', movementType: 'expired' },
  { value: 'returned', label: 'Returned', movementType: 'returned' },
  { value: 'other', label: 'Other', movementType: 'adjustment' },
];

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

const iCls = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10';

export default function InventoryUpdatePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pageError, setPageError] = useState('');
  const [form, setForm] = useState<UpdateStockFormState>(emptyForm);

  const canManageInventory = ['Admin', 'Branch Manager'].includes(user?.role.name ?? '');
  const selectedProductId = searchParams.get('productId');

  const branchesQuery = useQuery({
    queryKey: ['catalog-branches'],
    queryFn: () => api.branches.list(),
  });

  const productsQuery = useQuery({
    queryKey: ['catalog-products-for-inventory-update'],
    queryFn: () => api.products.list({ includeInactive: true }),
  });

  const branches = branchesQuery.data?.branches ?? [];
  const products = productsQuery.data?.products ?? [];
  const primaryBranch = branches.find((branch) => branch.name === 'Evaya Naturals') ?? branches[0];

  useEffect(() => {
    if (!form.branchId && primaryBranch?.id) {
      setForm((current) => ({ ...current, branchId: primaryBranch.id }));
    }
  }, [form.branchId, primaryBranch?.id]);

  useEffect(() => {
    if (form.productId) return;
    if (selectedProductId && products.some((product) => product.id === selectedProductId)) {
      setForm((current) => ({ ...current, productId: selectedProductId }));
      return;
    }
    if (products.length > 0) {
      setForm((current) => ({ ...current, productId: products[0].id }));
    }
  }, [form.productId, products, selectedProductId]);

  const selectedReason = useMemo(
    () => reasonOptions.find((option) => option.value === form.reason) ?? reasonOptions[0],
    [form.reason],
  );

  const updateMutation = useMutation({
    mutationFn: () => api.inventory.adjust({
      productId: form.productId,
      branchId: form.branchId,
      batchId: null,
      movementType: selectedReason.movementType,
      quantityDelta: Number(form.quantityChange),
      reason: form.explanation.trim() || selectedReason.label,
    }),
    onSuccess: async () => {
      setPageError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['catalog-inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-batches'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-products-for-inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-products-for-inventory-update'] }),
        queryClient.invalidateQueries({ queryKey: ['pos-products'] }),
        queryClient.invalidateQueries({ queryKey: ['report-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['report-today'] }),
      ]);
      navigate('/inventory');
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await updateMutation.mutateAsync();
  };

  if (!canManageInventory) return null;

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-12 pt-[76px] sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-lg space-y-6">

          {/* Header */}
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Update Stock</h1>
              <p className="mt-0.5 text-sm text-slate-400">Fix counts and record a clear reason.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft size={14} strokeWidth={1.75} />
              Back
            </button>
          </div>

          {pageError && (
            <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" />
              {pageError}
            </div>
          )}

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Product</label>
                <select
                  value={form.productId}
                  onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))}
                  className={iCls}
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Reason</label>
                <select
                  value={form.reason}
                  onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value as UpdateReason }))}
                  className={iCls}
                >
                  {reasonOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Quantity change <span className="font-normal text-slate-400">(use negative to remove)</span>
                </label>
                <input
                  type="number"
                  value={form.quantityChange}
                  onChange={(event) => setForm((current) => ({ ...current, quantityChange: event.target.value }))}
                  placeholder="e.g. 50 or −10"
                  className={iCls}
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Explanation <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  value={form.explanation}
                  onChange={(event) => setForm((current) => ({ ...current, explanation: event.target.value }))}
                  rows={3}
                  placeholder="Additional context…"
                  className={`${iCls} resize-none`}
                />
              </div>

              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="rounded-xl py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                style={{ background: '#1B4332' }}
              >
                {updateMutation.isPending ? 'Saving…' : 'Update Stock'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
