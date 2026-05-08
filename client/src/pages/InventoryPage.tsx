import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';

type AddStockFormState = {
  productId: string;
  branchId: string;
  expiryDate: string;
  quantity: string;
  costPrice: string;
  sellingPrice: string;
};

const emptyAddStockForm: AddStockFormState = {
  productId: '',
  branchId: '',
  expiryDate: '',
  quantity: '',
  costPrice: '',
  sellingPrice: '',
};

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

function createBatchNumber(productName: string) {
  const prefix = productName
    .trim()
    .slice(0, 3)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') || 'EVA';
  return `${prefix}-${Date.now()}`;
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
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pageError, setPageError] = useState('');
  const [addStockForm, setAddStockForm] = useState<AddStockFormState>(emptyAddStockForm);

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
    queryFn: () => api.inventory.list({
      search,
      status: statusFilter,
    }),
  });

  const branches = branchesQuery.data?.branches ?? [];
  const primaryBranch = branches.find((branch) => branch.name === 'Evaya Naturals') ?? branches[0];
  const products = productsQuery.data?.products ?? [];
  const inventory = inventoryQuery.data?.inventory ?? [];

  useEffect(() => {
    if (!addStockForm.branchId && primaryBranch?.id) {
      setAddStockForm((current) => ({ ...current, branchId: primaryBranch.id }));
    }
    if (!addStockForm.productId && products.length > 0) {
      setAddStockForm((current) => ({
        ...current,
        productId: products[0].id,
        sellingPrice: String(products[0].sellingPrice),
      }));
    }
  }, [addStockForm.branchId, addStockForm.productId, primaryBranch?.id, products]);

  const invalidateInventory = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog-inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-batches'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-products-for-inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-products'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-today-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['report-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['report-today'] }),
    ]);
  };

  const addStockMutation = useMutation({
    mutationFn: () => {
      const selectedProduct = products.find((product) => product.id === addStockForm.productId);
      return api.inventory.createBatch({
        productId: addStockForm.productId,
        branchId: addStockForm.branchId,
        supplierId: null,
        batchNumber: createBatchNumber(selectedProduct?.name ?? 'Evaya'),
        expiryDate: addStockForm.expiryDate,
        quantityReceived: Number(addStockForm.quantity),
        costPrice: Number(addStockForm.costPrice),
        sellingPrice: addStockForm.sellingPrice ? Number(addStockForm.sellingPrice) : null,
      });
    },
    onSuccess: async () => {
      const selectedProduct = products.find((product) => product.id === addStockForm.productId);
      setAddStockForm({
        ...emptyAddStockForm,
        branchId: addStockForm.branchId,
        productId: addStockForm.productId,
        sellingPrice: selectedProduct ? String(selectedProduct.sellingPrice) : '',
      });
      setPageError('');
      await invalidateInventory();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const handleAddStock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await addStockMutation.mutateAsync();
  };

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
                <MetricCard label="Low stock" value={String(lowStockCount)} />
                <MetricCard label="Expiring soon" value={String(expiringSoonCount)} />
                <MetricCard label="Expired" value={String(expiredCount)} />
              </div>
            </div>
          </div>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <div className="grid gap-4 rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.05)] lg:grid-cols-[minmax(0,1.4fr)_220px_220px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
            />
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
            {canManageInventory ? (
              <button
                type="button"
                onClick={() => navigate('/inventory/update')}
                className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Update Stock
              </button>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                {inventory.length} items
              </div>
            )}
          </div>

          {canManageInventory && (
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <h2 className="text-xl font-semibold">Add Stock</h2>
              <p className="mt-1 text-sm text-slate-500">Add new stock and save expiry details.</p>
              <form className="mt-5 grid gap-3 md:grid-cols-4" onSubmit={handleAddStock}>
                <select
                  value={addStockForm.productId}
                  onChange={(event) => {
                    const selected = products.find((product) => product.id === event.target.value);
                    setAddStockForm((current) => ({
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
                <input
                  type="date"
                  value={addStockForm.expiryDate}
                  onChange={(event) => setAddStockForm((current) => ({ ...current, expiryDate: event.target.value }))}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  required
                />
                <input
                  type="number"
                  min="1"
                  value={addStockForm.quantity}
                  onChange={(event) => setAddStockForm((current) => ({ ...current, quantity: event.target.value }))}
                  placeholder="Quantity"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  required
                />
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:col-span-1">
                  <input
                    type="number"
                    min="0"
                    value={addStockForm.costPrice}
                    onChange={(event) => setAddStockForm((current) => ({ ...current, costPrice: event.target.value }))}
                    placeholder="Cost price"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                  <button
                    type="submit"
                    disabled={addStockMutation.isPending}
                    className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {addStockMutation.isPending ? 'Saving…' : 'Add Stock'}
                  </button>
                </div>
              </form>
            </section>
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
                    </div>
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {row.quantity} left
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MobileValue label="Quantity" value={String(row.quantity)} />
                    <MobileValue label="Low stock level" value={String(row.lowStockThreshold)} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {row.lowStock && (
                      <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                        Low stock
                      </span>
                    )}
                    {warningBadge(row.expiringSoonCount, 'expiring soon', 'amber')}
                    {warningBadge(row.expiredCount, 'expired', 'rose')}
                  </div>
                  {canManageInventory && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => navigate(`/inventory/update?productId=${row.productId}`)}
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
              <table className="min-w-[720px] divide-y divide-slate-100 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Quantity</th>
                    <th className="px-4 py-3 font-medium">Low stock level</th>
                    <th className="px-4 py-3 font-medium">Warning</th>
                    {canManageInventory && <th className="px-4 py-3 font-medium">Update</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {inventory.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-4 font-medium">{row.productName}</td>
                      <td className="px-4 py-4">{row.quantity}</td>
                      <td className="px-4 py-4">{row.lowStockThreshold}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          {row.lowStock && (
                            <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                              Low stock
                            </span>
                          )}
                          {warningBadge(row.expiringSoonCount, 'expiring soon', 'amber')}
                          {warningBadge(row.expiredCount, 'expired', 'rose')}
                        </div>
                      </td>
                      {canManageInventory && (
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => navigate(`/inventory/update?productId=${row.productId}`)}
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
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
