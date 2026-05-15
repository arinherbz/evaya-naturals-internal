import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Plus, Search, AlertTriangle, X } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { InventoryRow } from '../types';
import { SkeletonRows, EmptyState, DestructiveModal } from './ProductsPage';

function getErrorMessage(e: unknown) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

const iCls = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10';

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

  const canManageInventory = ['Admin', 'Branch Manager'].includes(user?.role.name ?? '');

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
      queryClient.invalidateQueries({ queryKey: ['pos-reports-today'] }),
      queryClient.invalidateQueries({ queryKey: ['report-summary'] }),
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
        if (delta !== 0) {
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

  const colCount = canManageInventory ? 5 : 4;

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-12 pt-[76px] sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-5xl space-y-6">

          {/* Header */}
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Inventory</h1>
              <p className="mt-0.5 text-sm text-slate-400">Track stock levels and receive new batches.</p>
            </div>
            {canManageInventory && (
              <button
                type="button"
                onClick={() => setShowAddStock(true)}
                className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ background: '#1B4332' }}
              >
                <Plus size={15} strokeWidth={2} />
                Add Stock
              </button>
            )}
          </div>

          {pageError && (
            <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" />
              {pageError}
            </div>
          )}

          {/* Stock list */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">
                Stock List
                {inventory.length > 0 && (
                  <span className="ml-2 font-normal text-slate-400">({inventory.length})</span>
                )}
              </h2>
              <div className="relative ml-auto w-full sm:w-auto">
                <Search size={14} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-4 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10 sm:w-52"
                />
              </div>
            </div>

            {/* Desktop table */}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Product', 'Unit', 'Quantity', 'Low stock level', ...(canManageInventory ? ['Actions'] : [])].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-400 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {inventoryQuery.isLoading && (
                    <tr>
                      <td colSpan={colCount}>
                        <SkeletonRows n={5} />
                      </td>
                    </tr>
                  )}
                  {!inventoryQuery.isLoading && inventory.length === 0 && (
                    <tr>
                      <td colSpan={colCount}>
                        <EmptyState
                          icon={Database}
                          text={search ? `No results for "${search}"` : 'No inventory records yet'}
                          action={search ? { label: 'Clear search', onClick: () => setSearch('') } : undefined}
                        />
                      </td>
                    </tr>
                  )}
                  {inventory.map((row) => {
                    const isLow = row.quantity <= row.lowStockThreshold;
                    const isOut = row.quantity === 0;
                    return (
                      <tr key={row.id} className="transition hover:bg-slate-50/60">
                        <td className="max-w-[200px] px-5 py-3.5">
                          <p className="truncate font-medium text-slate-900">{row.productName}</p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {row.unitType.toUpperCase()}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <span className={`text-lg font-bold ${isOut ? 'text-rose-500' : isLow ? 'text-amber-600' : 'text-[#1B4332]'}`}>
                            {row.quantity}
                          </span>
                          {isOut && <span className="ml-2 text-xs text-rose-400">Out of stock</span>}
                          {!isOut && isLow && <span className="ml-2 text-xs text-amber-500">Low</span>}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-sm text-slate-500">
                          {row.lowStockThreshold}
                        </td>
                        {canManageInventory && (
                          <td className="whitespace-nowrap px-5 py-3.5">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => openEdit(row)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeactivatingRow(row)}
                                className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-100"
                              >
                                Deactivate
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* ── Add Stock Modal ── */}
      {showAddStock && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) closeAddStock(); }}
        >
          <div className="my-4 w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl sm:my-auto">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Add Stock</h2>
              <button type="button" onClick={closeAddStock} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100" aria-label="Close">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            {stockError && (
              <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
                <AlertTriangle size={13} strokeWidth={1.75} className="shrink-0" />
                {stockError}
              </div>
            )}

            <form onSubmit={handleAddStock} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Product <span className="text-rose-400">*</span>
                </label>
                <select value={stockProductId} onChange={(e) => setStockProductId(e.target.value)} className={iCls} required>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Quantity <span className="text-rose-400">*</span>
                  </label>
                  <input type="number" min="1" value={stockQty} onChange={(e) => setStockQty(e.target.value)} placeholder="0" className={iCls} required />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Expiry Date <span className="text-rose-400">*</span>
                  </label>
                  <input type="date" value={stockExpiry} onChange={(e) => setStockExpiry(e.target.value)} className={iCls} required />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Batch Number <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input value={stockBatch} onChange={(e) => setStockBatch(e.target.value)} placeholder="Auto-generated if empty" className={iCls} />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={addStockMutation.isPending} className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-60" style={{ background: '#1B4332' }}>
                  {addStockMutation.isPending ? 'Adding…' : 'Add Stock'}
                </button>
                <button type="button" onClick={closeAddStock} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
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
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}
        >
          <div className="my-4 w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl sm:my-auto">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Edit Stock Record</h2>
              <button type="button" onClick={closeEdit} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100" aria-label="Close">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            {editError && (
              <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
                <AlertTriangle size={13} strokeWidth={1.75} className="shrink-0" />
                {editError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Product Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className={iCls} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Quantity
                    <span className="ml-1 font-normal text-slate-400">(was {editingRow.quantity})</span>
                  </label>
                  <input type="number" min="0" value={editQty} onChange={(e) => setEditQty(e.target.value)} className={iCls} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">Low stock level</label>
                  <input type="number" min="0" value={editThreshold} onChange={(e) => setEditThreshold(e.target.value)} className={iCls} />
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => editMutation.mutate()} disabled={editMutation.isPending} className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-60" style={{ background: '#1B4332' }}>
                  {editMutation.isPending ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" onClick={closeEdit} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Deactivate Confirmation ── */}
      {deactivatingRow && (
        <DestructiveModal
          title="Deactivate product?"
          description={<>
            <strong className="text-slate-900">{deactivatingRow.productName}</strong> will be removed from Inventory, Products, and POS. Sales history is kept.
          </>}
          confirmLabel={deactivateMutation.isPending ? 'Deactivating…' : 'Deactivate'}
          isPending={deactivateMutation.isPending}
          onConfirm={() => deactivateMutation.mutate(deactivatingRow.productId)}
          onCancel={() => setDeactivatingRow(null)}
        />
      )}
    </div>
  );
}
