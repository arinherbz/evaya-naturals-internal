import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import type { ProductListItem } from '../types';
import { formatUGX as ugx } from '../lib/currency';

const UNITS = ['kg', 'g', 'ml', 'l'] as const;
type UnitType = (typeof UNITS)[number];

type ProductForm = {
  name: string;
  unitType: UnitType;
  sellingPrice: string;
  costPrice: string;
  lowStockThreshold: string;
  description: string;
};

const emptyForm: ProductForm = {
  name: '',
  unitType: 'kg',
  sellingPrice: '',
  costPrice: '',
  lowStockThreshold: '10',
  description: '',
};

function toForm(p: ProductListItem): ProductForm {
  return {
    name: p.name,
    unitType: (UNITS.includes(p.unitType as UnitType) ? p.unitType : 'kg') as UnitType,
    sellingPrice: String(p.sellingPrice),
    costPrice: p.costPrice != null ? String(p.costPrice) : '',
    lowStockThreshold: String(p.lowStockThreshold),
    description: p.description ?? '',
  };
}

function validate(f: ProductForm): string | null {
  if (!f.name.trim() || f.name.trim().length < 2) return 'Product name must be at least 2 characters.';
  if (!f.sellingPrice || Number(f.sellingPrice) < 0) return 'Selling price is required.';
  if (f.costPrice === '' || Number(f.costPrice) < 0) return 'Cost price is required (enter 0 if unknown).';
  if (f.lowStockThreshold === '' || Number(f.lowStockThreshold) < 0) return 'Low stock level must be 0 or more.';
  return null;
}

function getErrorMessage(e: unknown) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

const iCls =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30';

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductListItem | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [formError, setFormError] = useState('');
  const [pageError, setPageError] = useState('');

  const categoriesQuery = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.categories.list(false),
  });

  const branchesQuery = useQuery({
    queryKey: ['catalog-branches'],
    queryFn: () => api.branches.list(),
  });

  const productsQuery = useQuery({
    queryKey: ['catalog-products', search],
    queryFn: () => api.products.list({ search, includeInactive: false }),
  });

  const primaryBranch =
    (branchesQuery.data?.branches ?? []).find((b) => b.name === 'Evaya Naturals') ??
    branchesQuery.data?.branches?.[0];
  const firstCategoryId = categoriesQuery.data?.categories?.[0]?.id ?? '';

  useEffect(() => {
    // ensure a category is set if switching from an old product without one
  }, [categoriesQuery.data]);

  const refreshAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-products-for-inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-products'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-products-dashboard'] }),
    ]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const catId = editingProduct?.categoryId || firstCategoryId;
      if (!catId) throw new Error('No product category found. Please add a category first.');
      const payload = {
        name: form.name.trim(),
        sku: null,
        barcode: null,
        categoryId: catId,
        unitType: form.unitType,
        sellingPrice: Number(form.sellingPrice),
        costPrice: Number(form.costPrice),
        lowStockThreshold: Number(form.lowStockThreshold),
        description: form.description.trim() || null,
        usageInstructions: null,
        ingredients: null,
        allergyWarning: null,
        visibilityBranchIds: primaryBranch?.id ? [primaryBranch.id] : [],
        isActive: true,
      };
      if (editingProduct) return api.products.update(editingProduct.id, payload);
      return api.products.create(payload);
    },
    onSuccess: async () => {
      setShowModal(false);
      setEditingProduct(null);
      setForm(emptyForm);
      setFormError('');
      setPageError('');
      await refreshAll();
    },
    onError: (e) => setFormError(getErrorMessage(e)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.products.remove(id),
    onSuccess: async () => {
      setDeletingProductId(null);
      setPageError('');
      await refreshAll();
    },
    onError: (e) => {
      setPageError(getErrorMessage(e));
      setDeletingProductId(null);
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const err = validate(form);
    if (err) { setFormError(err); return; }
    setFormError('');
    saveMutation.mutate();
  };

  const openAdd = () => {
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (p: ProductListItem) => {
    setEditingProduct(p);
    setForm(toForm(p));
    setFormError('');
    setShowModal(true);
  };

  const closeModal = () => {
    if (saveMutation.isPending) return;
    setShowModal(false);
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError('');
  };

  const products = productsQuery.data?.products ?? [];
  const deletingProduct = products.find((p) => p.id === deletingProductId);

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-5xl space-y-6">

          {/* Header */}
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.05)] sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Products</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Products</h1>
              <p className="mt-1 text-sm text-slate-500">Manage your product catalogue.</p>
            </div>
            <button
              type="button"
              onClick={openAdd}
              className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 active:scale-95"
            >
              + Add Product
            </button>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          {/* Product list */}
          <div className="rounded-[28px] border border-white/70 bg-white/90 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6 sm:py-5">
              <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
                Product list
                {products.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-slate-400">({products.length})</span>
                )}
              </h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, unit, description…"
                className="ml-auto w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-400 sm:w-[260px]"
              />
            </div>

            {/* Mobile cards (< sm) */}
            <div className="space-y-2 px-4 pb-4 sm:hidden">
              {productsQuery.isLoading && (
                <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
              )}
              {!productsQuery.isLoading && products.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">No products found</p>
              )}
              {products.map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{p.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {p.unitType.toUpperCase()} · Cost: {ugx(p.costPrice ?? 0)}
                      </p>
                      {p.description && (
                        <p className="mt-1 line-clamp-1 text-xs text-slate-400">{p.description}</p>
                      )}
                    </div>
                    <p className="shrink-0 text-sm font-bold text-emerald-700">{ugx(p.sellingPrice)}</p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingProductId(p.id)}
                      className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                    >
                      Deactivate
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Tablet / Desktop table (>= sm) */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Product', 'Unit', 'Cost price', 'Selling price', 'Low stock', 'Actions'].map((h) => (
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
                  {productsQuery.isLoading && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-slate-400">Loading…</td>
                    </tr>
                  )}
                  {!productsQuery.isLoading && products.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-slate-400">No products found</td>
                    </tr>
                  )}
                  {products.map((p) => (
                    <tr key={p.id} className="transition hover:bg-slate-50/60">
                      <td className="max-w-[200px] px-4 py-3">
                        <p className="truncate font-semibold text-slate-900">{p.name}</p>
                        {p.description && (
                          <p className="mt-0.5 truncate text-xs text-slate-400">{p.description}</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-500">
                        {p.unitType.toUpperCase()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {ugx(p.costPrice ?? 0)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-bold text-emerald-700">
                        {ugx(p.sellingPrice)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {p.lowStockThreshold}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingProductId(p.id)}
                            className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                          >
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* ── Add / Edit Product Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="my-4 w-full max-w-md rounded-[28px] border border-white/70 bg-white p-5 shadow-2xl sm:my-auto sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingProduct ? `Edit: ${editingProduct.name}` : 'Add Product'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {formError && (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  Product Name <span className="text-rose-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                  placeholder="e.g. Shea Butter 250ml"
                  className={iCls}
                  required
                  minLength={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Unit <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={form.unitType}
                    onChange={(e) => setForm((c) => ({ ...c, unitType: e.target.value as UnitType }))}
                    className={iCls}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Low Stock Level <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.lowStockThreshold}
                    onChange={(e) => setForm((c) => ({ ...c, lowStockThreshold: e.target.value }))}
                    placeholder="10"
                    className={iCls}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Selling Price (UGX) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.sellingPrice}
                    onChange={(e) => setForm((c) => ({ ...c, sellingPrice: e.target.value }))}
                    placeholder="0"
                    className={iCls}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Cost Price (UGX) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.costPrice}
                    onChange={(e) => setForm((c) => ({ ...c, costPrice: e.target.value }))}
                    placeholder="0"
                    className={iCls}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
                  rows={2}
                  placeholder="Optional product details"
                  className={`${iCls} resize-none`}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saveMutation.isPending || !firstCategoryId}
                  className="flex-1 rounded-full bg-slate-900 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {saveMutation.isPending ? 'Saving…' : editingProduct ? 'Save changes' : 'Create product'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Deactivate Confirmation Modal ── */}
      {deletingProductId && deletingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Deactivate product?</h2>
            <p className="mt-2 text-sm text-slate-500">
              <strong className="text-slate-900">{deletingProduct.name}</strong> will be hidden from the
              POS and all views. It stays in the database and can be restored later.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => deactivateMutation.mutate(deletingProductId)}
                disabled={deactivateMutation.isPending}
                className="flex-1 rounded-full bg-rose-600 py-3 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deactivateMutation.isPending ? 'Deactivating…' : 'Deactivate'}
              </button>
              <button
                type="button"
                onClick={() => setDeletingProductId(null)}
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
