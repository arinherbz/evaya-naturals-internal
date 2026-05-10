import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import type { ProductListItem } from '../types';

const ugx = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

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
    <div className="flex min-h-screen" style={{ background: '#0A0F0D', color: '#E2E8E4' }}>
      <Sidebar />
      <main className="flex-1 px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl space-y-6">

          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: '#3ADB82' }}>Products</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Products</h1>
            <p className="mt-1 text-sm" style={{ color: '#6B7F73' }}>Manage your product catalogue.</p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-800/40 bg-rose-900/30 px-4 py-3 text-sm text-rose-300">
              {pageError}
            </div>
          )}

          {/* Product form */}
          <div className="rounded-2xl p-6" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}>
            <h2 className="mb-4 text-lg font-bold text-white">
              {editingProduct ? `Edit: ${editingProduct.name}` : 'New product'}
            </h2>
            <form onSubmit={handleProductSubmit} className="space-y-4">
              <input
                value={productForm.name}
                onChange={(e) => setProductForm((c) => ({ ...c, name: e.target.value }))}
                placeholder="Product name"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                required
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input
                  value={productForm.sku}
                  onChange={(e) => setProductForm((c) => ({ ...c, sku: e.target.value }))}
                  placeholder="SKU (optional)"
                  className="rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                />
                <input
                  value={productForm.barcode}
                  onChange={(e) => setProductForm((c) => ({ ...c, barcode: e.target.value }))}
                  placeholder="Barcode (optional)"
                  className="rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                />
                <select
                  value={productForm.unitType}
                  onChange={(e) => setProductForm((c) => ({ ...c, unitType: e.target.value }))}
                  className="rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
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
                  className="rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
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
                  className="rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                  required
                />
                <input
                  type="number"
                  min="0"
                  value={productForm.costPrice}
                  onChange={(e) => setProductForm((c) => ({ ...c, costPrice: e.target.value }))}
                  placeholder="Cost price (optional)"
                  className="rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4' }}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={productMutation.isPending || !productForm.categoryId}
                  className="rounded-xl px-6 py-3 text-sm font-bold transition disabled:opacity-60"
                  style={{ background: '#1B4332', color: '#3ADB82' }}
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
                    className="rounded-xl px-6 py-3 text-sm font-semibold transition hover:bg-white/8"
                    style={{ background: '#1A2420', color: '#A0ABA4' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Product list */}
          <div className="rounded-2xl" style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex items-center justify-between px-6 py-5">
              <h2 className="text-lg font-bold text-white">Product list</h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.08)', color: '#E2E8E4', width: '220px' }}
              />
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 px-4 pb-4 md:hidden">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="rounded-xl px-4 py-4"
                  style={{ background: '#141A15', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-white">{product.name}</p>
                      <p className="text-xs" style={{ color: '#6B7F73' }}>
                        {product.unitType.toUpperCase()} · low stock: {product.lowStockThreshold}
                      </p>
                    </div>
                    <p className="shrink-0 font-mono-nums text-sm font-bold" style={{ color: '#3ADB82' }}>
                      {ugx(product.sellingPrice)}
                    </p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditingProduct(product); setProductForm(toProductForm(product)); window.scrollTo(0, 0); }}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:brightness-110"
                      style={{ background: '#1A2E25', color: '#3ADB82' }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingProductId(product.id)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                      style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {products.length === 0 && !productsQuery.isLoading && (
                <p className="py-6 text-center text-sm" style={{ color: '#6B7F73' }}>No products found</p>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y text-sm" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {['Product', 'Unit', 'Selling price', 'Low stock level', 'Actions'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B7F73' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-white">{product.name}</p>
                        {product.sku && <p className="text-xs" style={{ color: '#6B7F73' }}>SKU: {product.sku}</p>}
                      </td>
                      <td className="px-5 py-4 text-xs font-semibold" style={{ color: '#A0ABA4' }}>
                        {product.unitType.toUpperCase()}
                      </td>
                      <td className="px-5 py-4 font-mono-nums font-bold" style={{ color: '#3ADB82' }}>
                        {ugx(product.sellingPrice)}
                      </td>
                      <td className="px-5 py-4" style={{ color: '#A0ABA4' }}>
                        {product.lowStockThreshold}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setEditingProduct(product); setProductForm(toProductForm(product)); window.scrollTo(0, 0); }}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:brightness-110"
                            style={{ background: '#1A2E25', color: '#3ADB82' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingProductId(product.id)}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                            style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && !productsQuery.isLoading && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm" style={{ color: '#6B7F73' }}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: '#0D1610', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <h2 className="text-lg font-bold text-white">Delete product?</h2>
            <p className="mt-2 text-sm" style={{ color: '#A0ABA4' }}>
              <strong className="text-white">{deletingProduct.name}</strong> will be deactivated and removed from all views. This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deletingProductId)}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-60"
                style={{ background: 'rgba(239,68,68,0.2)', color: '#F87171' }}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => setDeletingProductId(null)}
                className="flex-1 rounded-xl py-3 text-sm font-semibold transition hover:bg-white/8"
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
