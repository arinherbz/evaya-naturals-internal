import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { InventoryRow } from '../types';

function getErrorMessage(e: unknown) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

const iCls =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30';

function XIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default function InventoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [pageError, setPageError] = useState('');

  // Add Stock modal
  const [showAddStock, setShowAddStock] = useState(false);
  const [stockProductId, setStockProductId] = useState('');
  const [stockQty, setStockQty] = useState('');
  const [stockBatch, setStockBatch] = useState('');
  const [stockExpiry, setStockExpiry] = useState('');
  const [stockError, setStockError] = useState('');

  // Edit modal
  const [editingRow, setEditingRow] = useState<InventoryRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editThreshold, setEditThreshold] = useState('');
  const [editError, setEditError] = useState('');

  // Deactivate modal
  const [deactivatingRow, setDeactivatingRow] = useState<InventoryRow | null>(null);

  const canManageInventory = ['Admin', 'Branch Manager'].includes(
    user?.role.name ?? '',
  );

  const branchesQuery = useQuery({
    queryKey: ['catalog-branches'],
    queryFn: () => api.branches.list(),
  });

  const productsQuery = useQuery({
    queryKey: ['catalog-products-for-inventory'],
    queryFn: () => api.products.list({ includeInactive: false }),
  });

  const inventoryQuery = useQuery({
    queryKey: ['catalog-inventory', search],
    queryFn: () => api.inventory.list({ search }),
  });

  const primaryBranch =
    (branchesQuery.data?.branches ?? []).find((b) => b.name === 'Evaya Naturals') ??
    branchesQuery.data?.branches?.[0];
  const products = productsQuery.data?.products ?? [];
  const inventory = inventoryQuery.data?.inventory ?? [];

  useEffect(() => {
    if (!stockProductId && products.length > 0) {
      setStockProductId(products[0].id);
    }
  }, [products, stockProductId]);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog-inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-products-for-inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-products'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-products-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-today-summary'] }),
    ]);

  // ── Add Stock ──
  const addStockMutation = useMutation({
    mutationFn: () => {
      if (!primaryBranch?.id) throw new Error('Branch not configured');
      const batchNum =
        stockBatch.trim() || `EVA-${stockProductId.slice(0, 4).toUpperCase()}-${Date.now()}`;
      return api.inventory.createBatch({
        productId: stockProductId,
        branchId: primaryBranch.id,
        supplierId: null,
        batchNumber: batchNum,
        expiryDate: stockExpiry,
        quantityReceived: Number(stockQty),
        costPrice: 0,
        sellingPrice: null,
      });
    },
    onSuccess: async () => {
      setStockQty('');
      setStockBatch('');
      setStockExpiry('');
      setStockError('');
      setShowAddStock(false);
      await invalidate();
    },
    onError: (e) => setStockError(getErrorMessage(e)),
  });

  const handleAddStock = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!stockProductId) { setStockError('Select a product'); return; }
    if (!stockQty || Number(stockQty) < 1) { setStockError('Quantity must be at least 1'); return; }
    if (!stockExpiry) { setStockError('Expiry date is required'); return; }
    setStockError('');
    addStockMutation.mutate();
  };

  const closeAddStock = () => {
    if (addStockMutation.isPending) return;
    setShowAddStock(false);
    setStockError('');
  };

  // ── Edit Row ──
  const openEdit = (row: InventoryRow) => {
    setEditingRow(row);
    setEditName(row.productName);
    setEditQty(String(row.quantity));
    setEditThreshold(String(row.lowStockThreshold));
    setEditError('');
  };

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingRow) return;
      const ops: Promise<unknown>[] = [];

      const newName = editName.trim();
      if (newName && newName !== editingRow.productName) {
        ops.push(api.products.update(editingRow.productId, { name: newName }));
      }

      const newThreshold = Number(editThreshold);
      if (!isNaN(newThreshold) && editThreshold !== '' && newThreshold !== editingRow.lowStockThreshold) {
        ops.push(api.inventory.updateThreshold(editingRow.id, newThreshold));
      }

      const newQty = Number(editQty);
      if (!isNaN(newQty) && editQty !== '' && newQty !== editingRow.quantity) {
        const delta = newQty - editingRow.quantity;
        if (delta === 0) {
          // nothing
        } else {
          ops.push(
            api.inventory.adjust({
              productId: editingRow.productId,
              branchId: editingRow.branchId,
              movementType: 'adjustment',
              quantityDelta: delta,
              reason: 'Manual stock count correction',
            }),
          );
        }
      }

      await Promise.all(ops);
    },
    onSuccess: async () => {
      setEditingRow(null);
      setEditError('');
      setPageError('');
      await invalidate();
    },
    onError: (e) => setEditError(getErrorMessage(e)),
  });

  const closeEdit = () => {
    if (editMutation.isPending) return;
    setEditingRow(null);
    setEditError('');
  };

  // ── Deactivate Product ──
  const deactivateMutation = useMutation({
    mutationFn: (productId: string) => api.products.remove(productId),
    onSuccess: async () => {
      setDeactivatingRow(null);
      setPageError('');
      await invalidate();
    },
    onError: (e) => {
      setPageError(getErrorMessage(e));
      setDeactivatingRow(null);
    },
  });

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-5xl space-y-6">

          {/* Header */}
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.05)] sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Inventory</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Inventory</h1>
            <p className="mt-1 text-sm text-slate-500">Track stock levels and receive new stock.</p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          {/* Stock list */}
          <div className="rounded-[28px] border border-white/70 bg-white/90 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6 sm:py-5">
              <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
                Stock List
                {inventory.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-slate-400">({inventory.length})</span>
                )}
              </h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-400 sm:w-[200px]"
              />
              {canManageInventory && (
                <button
                  type="button"
                  onClick={() => setShowAddStock(true)}
                  className="ml-auto rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 active:scale-95"
                >
                  + Add Stock
                </button>
              )}
            </div>

            {/* Mobile cards (< sm) */}
            <div className="space-y-2 px-4 pb-4 sm:hidden">
              {inventoryQuery.isLoading && (
                <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
              )}
              {!inventoryQuery.isLoading && inventory.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">No inventory records found</p>
              )}
              {inventory.map((row) => (
                <div key={row.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{row.productName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {row.unitType.toUpperCase()} · {row.categoryName}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-emerald-700">{row.quantity}</p>
                  </div>
                  {canManageInventory && (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeactivatingRow(row)}
                        className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                      >
                        Deactivate
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Tablet / Desktop table (>= sm) */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {[
                      'Product',
                      'Unit',
                      'Quantity',
                      'Low Stock Level',
                      ...(canManageInventory ? ['Actions'] : []),
                    ].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {inventoryQuery.isLoading && (
                    <tr>
                      <td colSpan={canManageInventory ? 5 : 4} className="py-8 text-center text-sm text-slate-400">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!inventoryQuery.isLoading && inventory.length === 0 && (
                    <tr>
                      <td colSpan={canManageInventory ? 5 : 4} className="py-8 text-center text-sm text-slate-400">
                        No inventory records found
                      </td>
                    </tr>
                  )}
                  {inventory.map((row) => (
                    <tr key={row.id} className="transition hover:bg-slate-50/60">
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="truncate font-semibold text-slate-900">{row.productName}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{row.categoryName}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-500">
                        {row.unitType.toUpperCase()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xl font-bold text-emerald-700">
                        {row.quantity}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {row.lowStockThreshold}
                      </td>
                      {canManageInventory && (
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeactivatingRow(row)}
                              className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                            >
                              Deactivate
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* ── Add Stock Modal ── */}
      {showAddStock && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) closeAddStock(); }}
        >
          <div className="my-4 w-full max-w-md rounded-[28px] border border-white/70 bg-white p-5 shadow-2xl sm:my-auto sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Add Stock</h2>
              <button
                type="button"
                onClick={closeAddStock}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100"
                aria-label="Close"
              >
                <XIcon />
              </button>
            </div>

            {stockError && (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {stockError}
              </div>
            )}

            <form onSubmit={handleAddStock} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  Product <span className="text-rose-500">*</span>
                </label>
                <select
                  value={stockProductId}
                  onChange={(e) => setStockProductId(e.target.value)}
                  className={iCls}
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Quantity <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    placeholder="0"
                    className={iCls}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Expiry Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={stockExpiry}
                    onChange={(e) => setStockExpiry(e.target.value)}
                    className={iCls}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  Batch Number <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  value={stockBatch}
                  onChange={(e) => setStockBatch(e.target.value)}
                  placeholder="Auto-generated if left empty"
                  className={iCls}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={addStockMutation.isPending}
                  className="flex-1 rounded-full bg-slate-900 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {addStockMutation.isPending ? 'Adding…' : 'Add Stock'}
                </button>
                <button
                  type="button"
                  onClick={closeAddStock}
                  className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Stock Record Modal ── */}
      {editingRow && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}
        >
          <div className="my-4 w-full max-w-md rounded-[28px] border border-white/70 bg-white p-5 shadow-2xl sm:my-auto sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Edit Stock Record</h2>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100"
                aria-label="Close"
              >
                <XIcon />
              </button>
            </div>

            {editError && (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {editError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Product Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={iCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Quantity
                    <span className="ml-1 font-normal text-slate-400">(was {editingRow.quantity})</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    className={iCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">Low Stock Level</label>
                  <input
                    type="number"
                    min="0"
                    value={editThreshold}
                    onChange={(e) => setEditThreshold(e.target.value)}
                    className={iCls}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => editMutation.mutate()}
                  disabled={editMutation.isPending}
                  className="flex-1 rounded-full bg-slate-900 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {editMutation.isPending ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Deactivate Confirmation Modal ── */}
      {deactivatingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Deactivate product?</h2>
            <p className="mt-2 text-sm text-slate-500">
              <strong className="text-slate-900">{deactivatingRow.productName}</strong> will be removed
              from Inventory, Products, and POS. Sales history is kept in the database.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => deactivateMutation.mutate(deactivatingRow.productId)}
                disabled={deactivateMutation.isPending}
                className="flex-1 rounded-full bg-rose-600 py-3 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deactivateMutation.isPending ? 'Deactivating…' : 'Deactivate'}
              </button>
              <button
                type="button"
                onClick={() => setDeactivatingRow(null)}
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
