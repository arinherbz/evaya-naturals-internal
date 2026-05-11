import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { InventoryRow } from '../types';

type AddStockFormState = {
  productId: string;
  branchId: string;
  expiryDate: string;
  quantity: string;
  batchNumber: string;
  notes: string;
};

const emptyAddStockForm: AddStockFormState = {
  productId: '',
  branchId: '',
  expiryDate: '',
  quantity: '',
  batchNumber: '',
  notes: '',
};

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

function stockBadge(qty: number) {
  if (qty === 0) return { label: 'Out of Stock', cls: 'bg-rose-100 text-rose-700' };
  if (qty <= 5) return { label: 'Low in Stock', cls: 'bg-amber-100 text-amber-700' };
  return { label: 'High in Stock', cls: 'bg-emerald-100 text-emerald-700' };
}

const inputCls = 'rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400';

export default function InventoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pageError, setPageError] = useState('');
  const [addStockForm, setAddStockForm] = useState<AddStockFormState>(emptyAddStockForm);
  const [editingRow, setEditingRow] = useState<InventoryRow | null>(null);
  const [editThreshold, setEditThreshold] = useState('');
  const [deletingRow, setDeletingRow] = useState<InventoryRow | null>(null);

  const canManageInventory = ['Admin', 'Branch Manager', 'Inventory Officer'].includes(user?.role.name ?? '');

  const branchesQuery = useQuery({
    queryKey: ['catalog-branches'],
    queryFn: () => api.branches.list(),
  });

  const productsQuery = useQuery({
    queryKey: ['catalog-products-for-inventory'],
    queryFn: () => api.products.list({ includeInactive: true }),
  });

  const inventoryQuery = useQuery({
    queryKey: ['catalog-inventory', search, statusFilter],
    queryFn: () => api.inventory.list({ search, status: statusFilter }),
  });

  const branches = branchesQuery.data?.branches ?? [];
  const primaryBranch = branches.find((b) => b.name === 'Evaya Naturals') ?? branches[0];
  const products = productsQuery.data?.products ?? [];
  const inventory = inventoryQuery.data?.inventory ?? [];

  useEffect(() => {
    if (!addStockForm.branchId && primaryBranch?.id) {
      setAddStockForm((cur) => ({ ...cur, branchId: primaryBranch.id }));
    }
    if (!addStockForm.productId && products.length > 0) {
      setAddStockForm((cur) => ({ ...cur, productId: products[0].id }));
    }
  }, [addStockForm.branchId, addStockForm.productId, primaryBranch?.id, products]);

  const invalidateInventory = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog-inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-products'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-today-summary'] }),
    ]);

  const addStockMutation = useMutation({
    mutationFn: () => {
      const batchNum = addStockForm.batchNumber.trim() ||
        `EVA-${addStockForm.productId.slice(0, 4).toUpperCase()}-${Date.now()}`;
      return api.inventory.createBatch({
        productId: addStockForm.productId,
        branchId: addStockForm.branchId,
        supplierId: null,
        batchNumber: batchNum,
        expiryDate: addStockForm.expiryDate,
        quantityReceived: Number(addStockForm.quantity),
        costPrice: 0,
        sellingPrice: null,
      });
    },
    onSuccess: async () => {
      setAddStockForm({ ...emptyAddStockForm, branchId: addStockForm.branchId, productId: addStockForm.productId });
      setPageError('');
      await invalidateInventory();
    },
    onError: (e) => setPageError(getErrorMessage(e)),
  });

  const updateThresholdMutation = useMutation({
    mutationFn: ({ id, threshold }: { id: string; threshold: number }) =>
      api.inventory.updateThreshold(id, threshold),
    onSuccess: async () => {
      setEditingRow(null);
      setEditThreshold('');
      await invalidateInventory();
    },
    onError: (e) => setPageError(getErrorMessage(e)),
  });

  const deleteStockMutation = useMutation({
    mutationFn: (row: InventoryRow) =>
      api.inventory.adjust({
        productId: row.productId,
        branchId: row.branchId,
        movementType: 'adjustment',
        quantityDelta: -row.quantity,
        reason: 'Stock write-off',
      }),
    onSuccess: async () => {
      setDeletingRow(null);
      await invalidateInventory();
    },
    onError: (e) => { setPageError(getErrorMessage(e)); setDeletingRow(null); },
  });

  const handleAddStock = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPageError('');
    await addStockMutation.mutateAsync();
  };

  const lowStockCount = inventory.filter((r) => r.quantity > 0 && r.quantity <= 5).length;
  const outOfStockCount = inventory.filter((r) => r.quantity === 0).length;
  const highStockCount = inventory.filter((r) => r.quantity > 5).length;

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl space-y-6">

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Inventory</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Inventory</h1>
            <p className="mt-1 text-sm text-slate-500">Track stock levels and receive new stock.</p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          {/* Summary */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[28px] border border-emerald-100 bg-emerald-50/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700/70">High in Stock</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{highStockCount}</p>
            </div>
            <div className="rounded-[28px] border border-amber-100 bg-amber-50/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700/70">Low in Stock</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{lowStockCount}</p>
            </div>
            <div className="rounded-[28px] border border-rose-100 bg-rose-50/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-700/70">Out of Stock</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{outOfStockCount}</p>
            </div>
          </div>

          {/* Add stock form */}
          {canManageInventory && (
            <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Add Stock</h2>
              <form onSubmit={handleAddStock} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    value={addStockForm.productId}
                    onChange={(e) => setAddStockForm((cur) => ({ ...cur, productId: e.target.value }))}
                    className={inputCls}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={addStockForm.quantity}
                    onChange={(e) => setAddStockForm((cur) => ({ ...cur, quantity: e.target.value }))}
                    placeholder="Quantity"
                    className={inputCls}
                    required
                  />
                  <input
                    value={addStockForm.batchNumber}
                    onChange={(e) => setAddStockForm((cur) => ({ ...cur, batchNumber: e.target.value }))}
                    placeholder="Batch number (optional)"
                    className={inputCls}
                  />
                  <input
                    type="date"
                    value={addStockForm.expiryDate}
                    onChange={(e) => setAddStockForm((cur) => ({ ...cur, expiryDate: e.target.value }))}
                    className={inputCls}
                    required
                  />
                </div>
                <input
                  value={addStockForm.notes}
                  onChange={(e) => setAddStockForm((cur) => ({ ...cur, notes: e.target.value }))}
                  placeholder="Notes (optional)"
                  className={`w-full ${inputCls}`}
                />
                <button
                  type="submit"
                  disabled={addStockMutation.isPending}
                  className="rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {addStockMutation.isPending ? 'Adding…' : 'Add Stock'}
                </button>
              </form>
            </div>
          )}

          {/* Inventory list */}
          <div className="rounded-[28px] border border-white/70 bg-white/90 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center gap-3 px-6 py-5">
              <h2 className="flex-1 text-lg font-semibold text-slate-900">Stock List</h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, SKU, batch…"
                className="w-[240px] rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-400"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-400"
              >
                <option value="all">All</option>
                <option value="low">Low stock</option>
                <option value="expiring">Expiring soon</option>
                <option value="expired">Expired</option>
              </select>
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 px-4 pb-4 md:hidden">
              {inventory.map((row) => {
                const badge = stockBadge(row.quantity);
                return (
                  <div key={row.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-slate-900">{row.productName}</p>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-1 text-2xl font-bold text-emerald-700">{row.quantity}</p>
                    {canManageInventory && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setEditingRow(row); setEditThreshold(String(row.lowStockThreshold)); }}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                        >
                          Edit
                        </button>
                        {row.quantity > 0 && (
                          <button
                            type="button"
                            onClick={() => setDeletingRow(row)}
                            className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {inventory.length === 0 && !inventoryQuery.isLoading && (
                <p className="py-6 text-center text-sm text-slate-400">No inventory records found</p>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Product', 'Quantity', 'Status', 'Low stock level', 'Alerts', 'Actions'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {inventory.map((row) => {
                    const badge = stockBadge(row.quantity);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/50">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-900">{row.productName}</p>
                          {row.sku && <p className="text-xs text-slate-400">SKU: {row.sku}</p>}
                        </td>
                        <td className="px-5 py-4 text-lg font-bold text-emerald-700">
                          {row.quantity}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-500">
                          {row.lowStockThreshold}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1">
                            {row.expiringSoonCount > 0 && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                {row.expiringSoonCount} expiring
                              </span>
                            )}
                            {row.expiredCount > 0 && (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                                {row.expiredCount} expired
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {canManageInventory && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => { setEditingRow(row); setEditThreshold(String(row.lowStockThreshold)); }}
                                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                              >
                                Edit
                              </button>
                              {row.quantity > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setDeletingRow(row)}
                                  className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {inventory.length === 0 && !inventoryQuery.isLoading && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                        No inventory records found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Edit threshold modal */}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Edit: {editingRow.productName}</h2>
            <p className="mt-1 text-sm text-slate-500">Update the low stock threshold</p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-400">Current quantity</p>
                <p className="text-2xl font-bold text-emerald-700">{editingRow.quantity}</p>
              </div>
              <input
                type="number"
                min="0"
                value={editThreshold}
                onChange={(e) => setEditThreshold(e.target.value)}
                placeholder="Low stock threshold"
                className={`w-full ${inputCls}`}
              />
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => updateThresholdMutation.mutate({ id: editingRow.id, threshold: Number(editThreshold) })}
                disabled={updateThresholdMutation.isPending}
                className="flex-1 rounded-full bg-slate-900 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {updateThresholdMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deletingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Write off stock?</h2>
            <p className="mt-2 text-sm text-slate-500">
              This will zero out all <strong className="text-slate-900">{deletingRow.quantity}</strong> units of{' '}
              <strong className="text-slate-900">{deletingRow.productName}</strong>. This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => deleteStockMutation.mutate(deletingRow)}
                disabled={deleteStockMutation.isPending}
                className="flex-1 rounded-full bg-rose-600 py-3 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deleteStockMutation.isPending ? 'Writing off…' : 'Write off'}
              </button>
              <button
                type="button"
                onClick={() => setDeletingRow(null)}
                className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
