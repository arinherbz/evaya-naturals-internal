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
  if (qty === 0) {
    return { label: 'Out of Stock', bg: 'rgba(239,68,68,0.12)', text: '#F87171' };
  }
  if (qty <= 5) {
    return { label: 'Low in Stock', bg: 'rgba(245,158,11,0.12)', text: '#F59E0B' };
  }
  return { label: 'High in Stock', bg: 'rgba(58,219,130,0.12)', text: '#3ADB82' };
}

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
    <div className="flex min-h-screen" style={{ background: '#0A0F0D', color: '#E2E8E4' }}>
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl space-y-6">

          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: '#3ADB82' }}>Inventory</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Inventory</h1>
            <p className="mt-1 text-sm" style={{ color: '#6B7F73' }}>Track stock levels and receive new stock.</p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-800/40 bg-rose-900/30 px-4 py-3 text-sm text-rose-300">
              {pageError}
            </div>
          )}

          {/* Summary */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'High in Stock', value: highStockCount, color: '#3ADB82' },
              { label: 'Low in Stock', value: lowStockCount, color: '#F59E0B' },
              { label: 'Out of Stock', value: outOfStockCount, color: '#F87171' },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl p-5"
                style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}
              >
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
                <p className="mt-2 font-mono-nums text-3xl font-black text-white">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Add stock form */}
          {canManageInventory && (
            <div className="rounded-2xl p-6" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}>
              <h2 className="mb-4 text-lg font-bold text-white">Add Stock</h2>
              <form onSubmit={handleAddStock} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    value={addStockForm.productId}
                    onChange={(e) => setAddStockForm((cur) => ({ ...cur, productId: e.target.value }))}
                    className="rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
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
                    className="rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                    required
                  />
                  <input
                    value={addStockForm.batchNumber}
                    onChange={(e) => setAddStockForm((cur) => ({ ...cur, batchNumber: e.target.value }))}
                    placeholder="Batch number (optional)"
                    className="rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                  />
                  <input
                    type="date"
                    value={addStockForm.expiryDate}
                    onChange={(e) => setAddStockForm((cur) => ({ ...cur, expiryDate: e.target.value }))}
                    className="rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                    required
                  />
                </div>
                <input
                  value={addStockForm.notes}
                  onChange={(e) => setAddStockForm((cur) => ({ ...cur, notes: e.target.value }))}
                  placeholder="Notes (optional)"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                />
                <button
                  type="submit"
                  disabled={addStockMutation.isPending}
                  className="rounded-xl px-6 py-3 text-sm font-bold transition disabled:opacity-60 hover:brightness-110"
                  style={{ background: '#1B4332', color: '#3ADB82' }}
                >
                  {addStockMutation.isPending ? 'Adding…' : 'Add Stock'}
                </button>
              </form>
            </div>
          )}

          {/* Inventory list */}
          <div className="rounded-2xl" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex flex-wrap items-center gap-3 px-6 py-5">
              <h2 className="flex-1 text-lg font-bold text-white">Stock List</h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, SKU, batch…"
                className="rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4', width: '240px' }}
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
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
                  <div
                    key={row.id}
                    className="rounded-xl px-4 py-4"
                    style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-white">{row.productName}</p>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{ background: badge.bg, color: badge.text }}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-1 font-mono-nums text-2xl font-black" style={{ color: '#3ADB82' }}>
                      {row.quantity}
                    </p>
                    {canManageInventory && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setEditingRow(row); setEditThreshold(String(row.lowStockThreshold)); }}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                          style={{ background: '#1A2E25', color: '#3ADB82' }}
                        >
                          Edit
                        </button>
                        {row.quantity > 0 && (
                          <button
                            type="button"
                            onClick={() => setDeletingRow(row)}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                            style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}
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
                <p className="py-6 text-center text-sm" style={{ color: '#6B7F73' }}>No inventory records found</p>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y text-sm" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {['Product', 'Quantity', 'Status', 'Low stock level', 'Alerts', 'Actions'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B7F73' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((row) => {
                    const badge = stockBadge(row.quantity);
                    return (
                      <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-white">{row.productName}</p>
                          {row.sku && <p className="text-xs" style={{ color: '#6B7F73' }}>SKU: {row.sku}</p>}
                        </td>
                        <td className="px-5 py-4 font-mono-nums text-lg font-black" style={{ color: '#3ADB82' }}>
                          {row.quantity}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                            style={{ background: badge.bg, color: badge.text }}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-5 py-4" style={{ color: '#A0ABA4' }}>
                          {row.lowStockThreshold}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1">
                            {row.expiringSoonCount > 0 && (
                              <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
                                {row.expiringSoonCount} expiring
                              </span>
                            )}
                            {row.expiredCount > 0 && (
                              <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}>
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
                                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                                style={{ background: '#1A2E25', color: '#3ADB82' }}
                              >
                                Edit
                              </button>
                              {row.quantity > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setDeletingRow(row)}
                                  className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                                  style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}
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
                      <td colSpan={6} className="py-8 text-center text-sm" style={{ color: '#6B7F73' }}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <h2 className="text-lg font-bold text-white">Edit: {editingRow.productName}</h2>
            <p className="mt-1 text-sm" style={{ color: '#6B7F73' }}>Update the low stock threshold</p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-semibold" style={{ color: '#6B7F73' }}>Current quantity</p>
                <p className="font-mono-nums text-2xl font-black" style={{ color: '#3ADB82' }}>{editingRow.quantity}</p>
              </div>
              <input
                type="number"
                min="0"
                value={editThreshold}
                onChange={(e) => setEditThreshold(e.target.value)}
                placeholder="Low stock threshold"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
              />
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => updateThresholdMutation.mutate({ id: editingRow.id, threshold: Number(editThreshold) })}
                disabled={updateThresholdMutation.isPending}
                className="flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-60 hover:brightness-110"
                style={{ background: '#1B4332', color: '#3ADB82' }}
              >
                {updateThresholdMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="flex-1 rounded-xl py-3 text-sm font-semibold"
                style={{ background: '#1A2420', color: '#A0ABA4' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deletingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <h2 className="text-lg font-bold text-white">Write off stock?</h2>
            <p className="mt-2 text-sm" style={{ color: '#A0ABA4' }}>
              This will zero out all <strong className="text-white">{deletingRow.quantity}</strong> units of{' '}
              <strong className="text-white">{deletingRow.productName}</strong>. This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => deleteStockMutation.mutate(deletingRow)}
                disabled={deleteStockMutation.isPending}
                className="flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-60"
                style={{ background: 'rgba(239,68,68,0.2)', color: '#F87171' }}
              >
                {deleteStockMutation.isPending ? 'Writing off…' : 'Write off'}
              </button>
              <button
                type="button"
                onClick={() => setDeletingRow(null)}
                className="flex-1 rounded-xl py-3 text-sm font-semibold"
                style={{ background: '#1A2420', color: '#A0ABA4' }}
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
