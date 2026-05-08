import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';

type BatchFormState = {
  productId: string;
  branchId: string;
  supplierId: string;
  batchNumber: string;
  expiryDate: string;
  quantityReceived: string;
  costPrice: string;
  sellingPrice: string;
};

type AdjustmentFormState = {
  productId: string;
  branchId: string;
  batchId: string;
  movementType: 'adjustment' | 'damaged' | 'expired' | 'returned';
  quantityDelta: string;
  reason: string;
};

const emptyBatchForm: BatchFormState = {
  productId: '',
  branchId: '',
  supplierId: '',
  batchNumber: '',
  expiryDate: '',
  quantityReceived: '',
  costPrice: '',
  sellingPrice: '',
};

const emptyAdjustmentForm: AdjustmentFormState = {
  productId: '',
  branchId: '',
  batchId: '',
  movementType: 'adjustment',
  quantityDelta: '',
  reason: '',
};

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

function warningBadge(count: number, label: string, color: 'amber' | 'rose') {
  if (count === 0) return null;
  const palette = color === 'amber'
    ? 'bg-amber-50 text-amber-700 border-amber-100'
    : 'bg-rose-50 text-rose-700 border-rose-100';
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${palette}`}>
      {count} {label}
    </span>
  );
}

export default function InventoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pageError, setPageError] = useState('');
  const [batchForm, setBatchForm] = useState<BatchFormState>(emptyBatchForm);
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentFormState>(emptyAdjustmentForm);
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});

  const canManageInventory = ['Admin', 'Branch Manager', 'Inventory Officer'].includes(user?.role.name ?? '');

  const branchesQuery = useQuery({
    queryKey: ['catalog-branches'],
    queryFn: () => api.branches.list(),
  });

  const branches = branchesQuery.data?.branches ?? [];
  const primaryBranch = branches.find((branch) => branch.name === 'Evaya Naturals') ?? branches[0];

  const productsQuery = useQuery({
    queryKey: ['catalog-products-for-inventory'],
    queryFn: () => api.products.list({ includeInactive: true }),
  });

  const inventoryQuery = useQuery({
    queryKey: ['catalog-inventory', search, statusFilter],
    queryFn: () => api.inventory.list({
      search,
      status: statusFilter,
    }),
  });

  const suppliersQuery = useQuery({
    queryKey: ['catalog-suppliers'],
    queryFn: () => api.suppliers.list(),
    enabled: canManageInventory,
  });

  const batchesQuery = useQuery({
    queryKey: ['catalog-batches', adjustmentForm.productId],
    queryFn: () => api.inventory.batches({
      branchId: adjustmentForm.branchId || undefined,
      productId: adjustmentForm.productId || undefined,
    }),
  });

  useEffect(() => {
    const products = productsQuery.data?.products ?? [];

    if (!batchForm.branchId && primaryBranch?.id) {
      setBatchForm((current) => ({ ...current, branchId: primaryBranch.id }));
    }
    if (!adjustmentForm.branchId && primaryBranch?.id) {
      setAdjustmentForm((current) => ({ ...current, branchId: primaryBranch.id }));
    }
    if (!batchForm.productId && products.length > 0) {
      setBatchForm((current) => ({
        ...current,
        productId: products[0].id,
        sellingPrice: String(products[0].sellingPrice),
      }));
    }
    if (!adjustmentForm.productId && products.length > 0) {
      setAdjustmentForm((current) => ({ ...current, productId: products[0].id }));
    }
  }, [
    adjustmentForm.branchId,
    adjustmentForm.productId,
    batchForm.branchId,
    batchForm.productId,
    primaryBranch?.id,
    productsQuery.data,
  ]);

  const invalidateInventory = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog-inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-batches'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-products-for-inventory'] }),
    ]);
  };

  const batchMutation = useMutation({
    mutationFn: () => api.inventory.createBatch({
      productId: batchForm.productId,
      branchId: batchForm.branchId,
      supplierId: batchForm.supplierId || null,
      batchNumber: batchForm.batchNumber,
      expiryDate: batchForm.expiryDate,
      quantityReceived: Number(batchForm.quantityReceived),
      costPrice: Number(batchForm.costPrice),
      sellingPrice: batchForm.sellingPrice ? Number(batchForm.sellingPrice) : null,
    }),
    onSuccess: async () => {
      const defaultProduct = productsQuery.data?.products?.find((product) => product.id === batchForm.productId);
      setBatchForm({
        ...emptyBatchForm,
        branchId: batchForm.branchId,
        productId: batchForm.productId,
        sellingPrice: defaultProduct ? String(defaultProduct.sellingPrice) : '',
      });
      setPageError('');
      await invalidateInventory();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const adjustmentMutation = useMutation({
    mutationFn: () => api.inventory.adjust({
      productId: adjustmentForm.productId,
      branchId: adjustmentForm.branchId,
      batchId: adjustmentForm.batchId || null,
      movementType: adjustmentForm.movementType,
      quantityDelta: Number(adjustmentForm.quantityDelta),
      reason: adjustmentForm.reason,
    }),
    onSuccess: async () => {
      setAdjustmentForm((current) => ({
        ...emptyAdjustmentForm,
        branchId: current.branchId,
        productId: current.productId,
      }));
      setPageError('');
      await invalidateInventory();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const thresholdMutation = useMutation({
    mutationFn: ({ id, threshold }: { id: string; threshold: number }) => api.inventory.updateThreshold(id, threshold),
    onSuccess: invalidateInventory,
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const handleBatchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await batchMutation.mutateAsync();
  };

  const handleAdjustmentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await adjustmentMutation.mutateAsync();
  };

  const inventory = inventoryQuery.data?.inventory ?? [];
  const products = productsQuery.data?.products ?? [];
  const suppliers = suppliersQuery.data?.suppliers ?? [];
  const batchRows = batchesQuery.data?.batches ?? [];

  const lowStockCount = inventory.filter((row) => row.lowStock).length;
  const expiringSoonCount = inventory.filter((row) => row.expiringSoonCount > 0).length;
  const expiredCount = inventory.filter((row) => row.expiredCount > 0).length;

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-6 pt-24 sm:px-6 lg:px-8 lg:pt-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Inventory</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">Current Stock</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  See what is low, add stock, and keep quantities accurate.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Low stock</p>
                  <p className="mt-1 text-2xl font-semibold">{lowStockCount}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Expiring soon</p>
                  <p className="mt-1 text-2xl font-semibold">{expiringSoonCount}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Expired</p>
                  <p className="mt-1 text-2xl font-semibold">{expiredCount}</p>
                </div>
              </div>
            </div>
          </div>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <div className="grid gap-4 rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.05)] lg:grid-cols-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
            />
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              Evaya Naturals
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
            >
              <option value="all">All items</option>
              <option value="low">Low stock</option>
              <option value="expiring">Expiring soon</option>
              <option value="expired">Expired</option>
            </select>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              {inventory.length} items
            </div>
          </div>

          {canManageInventory && (
            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Add Stock</h2>
                <p className="mt-1 text-sm text-slate-500">Add new stock and save expiry details.</p>
                <form className="mt-5 grid gap-3" onSubmit={handleBatchSubmit}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={batchForm.productId}
                      onChange={(event) => {
                        const selected = products.find((product) => product.id === event.target.value);
                        setBatchForm((current) => ({
                          ...current,
                          productId: event.target.value,
                          sellingPrice: selected ? String(selected.sellingPrice) : current.sellingPrice,
                        }));
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    >
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.name}</option>
                      ))}
                    </select>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      Adding to {primaryBranch?.name ?? 'Evaya Naturals'}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={batchForm.supplierId}
                      onChange={(event) => setBatchForm((current) => ({ ...current, supplierId: event.target.value }))}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    >
                      <option value="">No supplier</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                      ))}
                    </select>
                    <input
                      value={batchForm.batchNumber}
                      onChange={(event) => setBatchForm((current) => ({ ...current, batchNumber: event.target.value }))}
                      placeholder="Batch number"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <input
                      type="date"
                      value={batchForm.expiryDate}
                      onChange={(event) => setBatchForm((current) => ({ ...current, expiryDate: event.target.value }))}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                    <input
                      type="number"
                      min="1"
                      value={batchForm.quantityReceived}
                      onChange={(event) => setBatchForm((current) => ({ ...current, quantityReceived: event.target.value }))}
                      placeholder="Quantity"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      value={batchForm.costPrice}
                      onChange={(event) => setBatchForm((current) => ({ ...current, costPrice: event.target.value }))}
                      placeholder="Cost price"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      value={batchForm.sellingPrice}
                      onChange={(event) => setBatchForm((current) => ({ ...current, sellingPrice: event.target.value }))}
                      placeholder="Selling price"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={batchMutation.isPending}
                    className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {batchMutation.isPending ? 'Saving…' : 'Add Stock'}
                  </button>
                </form>
              </section>

              <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Update Stock</h2>
                <p className="mt-1 text-sm text-slate-500">Fix counts and record damaged, expired, or returned items.</p>
                <form className="mt-5 grid gap-3" onSubmit={handleAdjustmentSubmit}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={adjustmentForm.productId}
                      onChange={(event) => {
                        setAdjustmentForm((current) => ({
                          ...current,
                          productId: event.target.value,
                          batchId: '',
                        }));
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    >
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.name}</option>
                      ))}
                    </select>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      Updating {primaryBranch?.name ?? 'Evaya Naturals'}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <select
                      value={adjustmentForm.batchId}
                      onChange={(event) => setAdjustmentForm((current) => ({ ...current, batchId: event.target.value }))}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    >
                      <option value="">No specific batch</option>
                      {batchRows.map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {batch.batchNumber} · {batch.quantityRemaining} left
                        </option>
                      ))}
                    </select>
                    <select
                      value={adjustmentForm.movementType}
                      onChange={(event) => setAdjustmentForm((current) => ({ ...current, movementType: event.target.value as AdjustmentFormState['movementType'] }))}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    >
                      <option value="adjustment">Stock count correction</option>
                      <option value="damaged">Damaged</option>
                      <option value="expired">Expired</option>
                      <option value="returned">Returned</option>
                    </select>
                    <input
                      type="number"
                      value={adjustmentForm.quantityDelta}
                      onChange={(event) => setAdjustmentForm((current) => ({ ...current, quantityDelta: event.target.value }))}
                      placeholder="Quantity change"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                  </div>
                  <textarea
                    value={adjustmentForm.reason}
                    onChange={(event) => setAdjustmentForm((current) => ({ ...current, reason: event.target.value }))}
                    placeholder="Reason"
                    rows={3}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                  <button
                    type="submit"
                    disabled={adjustmentMutation.isPending}
                    className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {adjustmentMutation.isPending ? 'Saving…' : 'Update Stock'}
                  </button>
                </form>
              </section>
            </div>
          )}

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Current Stock</h2>
                <p className="mt-1 text-sm text-slate-500">Watch low items and products nearing expiry.</p>
              </div>
            </div>
            <div className="space-y-3 md:hidden">
              {inventory.map((row) => (
                <div key={row.id} className="rounded-[28px] bg-white px-4 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{row.productName}</p>
                      <p className="mt-1 text-sm text-slate-500">{row.categoryName}</p>
                    </div>
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {row.quantity} left
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MobileValue label="Low stock level" value={String(row.lowStockThreshold)} />
                    <MobileValue label="Batches" value={String(row.batches.length)} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {row.lowStock && (
                      <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                        Low stock
                      </span>
                    )}
                    {warningBadge(row.expiringSoonCount, 'expiring soon', 'amber')}
                    {warningBadge(row.expiredCount, 'expired batches', 'rose')}
                  </div>
                  {canManageInventory && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          value={thresholdDrafts[row.id] ?? String(row.lowStockThreshold)}
                          onChange={(event) => setThresholdDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
                          className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-400"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            thresholdMutation.mutate({
                              id: row.id,
                              threshold: Number(thresholdDrafts[row.id] ?? row.lowStockThreshold),
                            });
                          }}
                          className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          Save
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAdjustmentForm((current) => ({
                            ...current,
                            branchId: row.branchId,
                            productId: row.productId,
                          }));
                        }}
                        className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Update Stock
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-3xl border border-slate-100 md:block">
              <table className="min-w-[760px] divide-y divide-slate-100 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Quantity</th>
                    <th className="px-4 py-3 font-medium">Low stock level</th>
                    <th className="px-4 py-3 font-medium">Warnings</th>
                    {canManageInventory && <th className="px-4 py-3 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {inventory.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-4">
                        <div className="font-medium">{row.productName}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {row.categoryName} · {row.unitType.toUpperCase()}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium">{row.quantity}</div>
                        <div className="text-xs text-slate-400">{row.batches.length} batches tracked</div>
                      </td>
                      <td className="px-4 py-4">
                        {canManageInventory ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              value={thresholdDrafts[row.id] ?? String(row.lowStockThreshold)}
                              onChange={(event) => setThresholdDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
                              className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-400"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                thresholdMutation.mutate({
                                  id: row.id,
                                  threshold: Number(thresholdDrafts[row.id] ?? row.lowStockThreshold),
                                });
                              }}
                              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          row.lowStockThreshold
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          {row.lowStock && (
                            <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                              Low stock
                            </span>
                          )}
                          {warningBadge(row.expiringSoonCount, 'expiring soon', 'amber')}
                          {warningBadge(row.expiredCount, 'expired batches', 'rose')}
                        </div>
                      </td>
                      {canManageInventory && (
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustmentForm((current) => ({
                                ...current,
                                branchId: row.branchId,
                                productId: row.productId,
                              }));
                            }}
                            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Update Stock
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function MobileValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
