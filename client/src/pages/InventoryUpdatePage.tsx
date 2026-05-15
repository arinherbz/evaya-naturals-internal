import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

  if (!canManageInventory) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-6 pt-24 sm:px-6 lg:px-8 lg:pt-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Inventory</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">Update Stock</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  Fix counts and save a clear reason.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/inventory')}
                className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Back to Inventory
              </button>
            </div>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <select
                value={form.productId}
                onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>

              <select
                value={form.reason}
                onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value as UpdateReason }))}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
              >
                {reasonOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              <input
                type="number"
                value={form.quantityChange}
                onChange={(event) => setForm((current) => ({ ...current, quantityChange: event.target.value }))}
                placeholder="Quantity change"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                required
              />

              <textarea
                value={form.explanation}
                onChange={(event) => setForm((current) => ({ ...current, explanation: event.target.value }))}
                rows={4}
                placeholder="Explanation (optional)"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
              />

              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="justify-self-start rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {updateMutation.isPending ? 'Saving…' : 'Update Stock'}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
