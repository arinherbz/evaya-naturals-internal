import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import type { ProductListItem } from '../types';
import { formatUGX as ugx } from '../lib/currency';

type ProductFormState = {
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  unitType: string;
  sellingPrice: string;
  costPrice: string;
  lowStockThreshold: string;
  description: string;
  usageInstructions: string;
  ingredients: string;
  allergyWarning: string;
  visibilityBranchIds: string[];
};

const allowedUnits = ['piece', 'kg', 'g', 'ml', 'l', 'box', 'jar', 'pack'] as const;

const emptyProductForm: ProductFormState = {
  name: '',
  sku: '',
  barcode: '',
  categoryId: '',
  unitType: 'piece',
  sellingPrice: '',
  costPrice: '',
  lowStockThreshold: '10',
  description: '',
  usageInstructions: '',
  ingredients: '',
  allergyWarning: '',
  visibilityBranchIds: [],
};

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

function toProductForm(product: ProductListItem): ProductFormState {
  return {
    name: product.name,
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    categoryId: product.categoryId,
    unitType: product.unitType,
    sellingPrice: String(product.sellingPrice),
    costPrice: product.costPrice == null ? '' : String(product.costPrice),
    lowStockThreshold: String(product.lowStockThreshold),
    description: product.description ?? '',
    usageInstructions: product.usageInstructions ?? '',
    ingredients: product.ingredients ?? '',
    allergyWarning: product.allergyWarning ?? '',
    visibilityBranchIds: product.visibleBranches.map((b) => b.branchId),
  };
}

const inputCls = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400';
const inputNwCls = 'rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400';

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm);
  const [editingProduct, setEditingProduct] = useState<ProductListItem | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [pageError, setPageError] = useState('');

  const branchesQuery = useQuery({
    queryKey: ['catalog-branches'],
    queryFn: () => api.branches.list(),
  });

  const branches = branchesQuery.data?.branches ?? [];
  const primaryBranch = branches.find((b) => b.name === 'Evaya Naturals') ?? branches[0];

  useEffect(() => {
    if (branchesQuery.data && productForm.visibilityBranchIds.length === 0 && primaryBranch?.id) {
      setProductForm((cur) => ({ ...cur, visibilityBranchIds: [primaryBranch.id] }));
    }
  }, [branchesQuery.data, primaryBranch?.id, productForm.visibilityBranchIds.length]);

  const categoriesQuery = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.categories.list(false),
  });

  const productsQuery = useQuery({
    queryKey: ['catalog-products', search],
    queryFn: () => api.products.list({ search, includeInactive: false }),
  });

  useEffect(() => {
    const cats = categoriesQuery.data?.categories ?? [];
    if (!productForm.categoryId && cats.length > 0) {
      setProductForm((cur) => ({ ...cur, categoryId: cats[0].id }));
    }
  }, [categoriesQuery.data, productForm.categoryId]);

  const refreshProducts = () => queryClient.invalidateQueries({ queryKey: ['catalog-products'] });

  const productMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: productForm.name,
        sku: productForm.sku || null,
        barcode: productForm.barcode || null,
        categoryId: productForm.categoryId,
        unitType: productForm.unitType,
        sellingPrice: Number(productForm.sellingPrice),
        costPrice: productForm.costPrice ? Number(productForm.costPrice) : null,
        lowStockThreshold: Number(productForm.lowStockThreshold),
        description: productForm.description || null,
        usageInstructions: productForm.usageInstructions || null,
        ingredients: productForm.ingredients || null,
        allergyWarning: productForm.allergyWarning || null,
        visibilityBranchIds: primaryBranch?.id ? [primaryBranch.id] : productForm.visibilityBranchIds,
        isActive: true,
      };
      if (editingProduct) return api.products.update(editingProduct.id, payload);
      return api.products.create(payload);
    },
    onSuccess: async () => {
      setEditingProduct(null);
      setProductForm({
        ...emptyProductForm,
        categoryId: categoriesQuery.data?.categories?.[0]?.id ?? '',
        visibilityBranchIds: primaryBranch?.id ? [primaryBranch.id] : [],
      });
      setPageError('');
      await refreshProducts();
    },
    onError: (e) => setPageError(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.products.remove(id),
    onSuccess: async () => {
      setDeletingProductId(null);
      setPageError('');
      await refreshProducts();
    },
    onError: (e) => { setPageError(getErrorMessage(e)); setDeletingProductId(null); },
  });

  const handleProductSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPageError('');
    await productMutation.mutateAsync();
  };

  const products = productsQuery.data?.products ?? [];
  const deletingProduct = products.find((p) => p.id === deletingProductId);

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl space-y-6">

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Products</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Products</h1>
            <p className="mt-1 text-sm text-slate-500">Manage your product catalogue.</p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          {/* Product form */}
          <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {editingProduct ? `Edit: ${editingProduct.name}` : 'New product'}
            </h2>
            <form onSubmit={handleProductSubmit} className="space-y-4">
              <input
                value={productForm.name}
                onChange={(e) => setProductForm((c) => ({ ...c, name: e.target.value }))}
                placeholder="Product name"
                className={inputCls}
                required
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <select
                  value={productForm.unitType}
                  onChange={(e) => setProductForm((c) => ({ ...c, unitType: e.target.value }))}
                  className={inputNwCls}
                >
                  {allowedUnits.map((u) => (
                    <option key={u} value={u}>{u.toUpperCase()}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  value={productForm.lowStockThreshold}
                  onChange={(e) => setProductForm((c) => ({ ...c, lowStockThreshold: e.target.value }))}
                  placeholder="Low stock level"
                  className={inputNwCls}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="number"
                  min="0"
                  value={productForm.sellingPrice}
                  onChange={(e) => setProductForm((c) => ({ ...c, sellingPrice: e.target.value }))}
                  placeholder="Selling price (UGX)"
                  className={inputNwCls}
                  required
                />
                <input
                  type="number"
                  min="0"
                  value={productForm.costPrice}
                  onChange={(e) => setProductForm((c) => ({ ...c, costPrice: e.target.value }))}
                  placeholder="Cost price (optional)"
                  className={inputNwCls}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={productMutation.isPending || !productForm.categoryId}
                  className="rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {productMutation.isPending ? 'Saving…' : editingProduct ? 'Save changes' : 'Create product'}
                </button>
                {editingProduct && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProduct(null);
                      setProductForm({
                        ...emptyProductForm,
                        categoryId: categoriesQuery.data?.categories?.[0]?.id ?? '',
                        visibilityBranchIds: primaryBranch?.id ? [primaryBranch.id] : [],
                      });
                    }}
                    className="rounded-full border border-slate-200 px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Product list */}
          <div className="rounded-[28px] border border-white/70 bg-white/90 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between px-6 py-5">
              <h2 className="text-lg font-semibold text-slate-900">Product list</h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="w-[220px] rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-400"
              />
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 px-4 pb-4 md:hidden">
              {products.map((product) => (
                <div key={product.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500">
                        {product.unitType.toUpperCase()} · low stock: {product.lowStockThreshold}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-emerald-700">
                      {ugx(product.sellingPrice)}
                    </p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditingProduct(product); setProductForm(toProductForm(product)); window.scrollTo(0, 0); }}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingProductId(product.id)}
                      className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                    >
                      Deactivate
                    </button>
                  </div>
                </div>
              ))}
              {products.length === 0 && !productsQuery.isLoading && (
                <p className="py-6 text-center text-sm text-slate-400">No products found</p>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Product', 'Unit', 'Selling price', 'Low stock level', 'Actions'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{product.name}</p>
                        {product.sku && <p className="text-xs text-slate-400">SKU: {product.sku}</p>}
                      </td>
                      <td className="px-5 py-4 text-xs font-semibold text-slate-500">
                        {product.unitType.toUpperCase()}
                      </td>
                      <td className="px-5 py-4 font-bold text-emerald-700">
                        {ugx(product.sellingPrice)}
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        {product.lowStockThreshold}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setEditingProduct(product); setProductForm(toProductForm(product)); window.scrollTo(0, 0); }}
                            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingProductId(product.id)}
                            className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                          >
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && !productsQuery.isLoading && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-slate-400">
                        No products found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Delete confirmation modal */}
      {deletingProductId && deletingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Deactivate product?</h2>
            <p className="mt-2 text-sm text-slate-500">
              <strong className="text-slate-900">{deletingProduct.name}</strong> will be deactivated and removed from all views. This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deletingProductId)}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-full bg-rose-600 py-3 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deleteMutation.isPending ? 'Deactivating…' : 'Deactivate'}
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
