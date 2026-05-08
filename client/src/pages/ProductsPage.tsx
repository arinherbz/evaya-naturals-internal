import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Category, ProductListItem } from '../types';

const currencyFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0,
});

type CategoryFormState = {
  name: string;
  description: string;
  isActive: boolean;
};

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
  isActive: boolean;
};

const emptyCategoryForm: CategoryFormState = {
  name: '',
  description: '',
  isActive: true,
};

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
  isActive: true,
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
    visibilityBranchIds: product.visibleBranches.map((branch) => branch.branchId),
    isActive: product.isActive,
  };
}

export default function ProductsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm);
  const [editingProduct, setEditingProduct] = useState<ProductListItem | null>(null);
  const [pageError, setPageError] = useState('');

  const isAdmin = user?.role.name === 'Admin';

  const branchesQuery = useQuery({
    queryKey: ['catalog-branches'],
    queryFn: () => api.branches.list(),
  });

  const branches = branchesQuery.data?.branches ?? [];
  const primaryBranch = branches.find((branch) => branch.name === 'Evaya Naturals') ?? branches[0];

  useEffect(() => {
    if (!productForm.categoryId && branchesQuery.data && productForm.visibilityBranchIds.length === 0) {
      const defaultBranches = primaryBranch?.id ? [primaryBranch.id] : [];
      setProductForm((current) => ({ ...current, visibilityBranchIds: defaultBranches }));
    }
  }, [branchesQuery.data, primaryBranch?.id, productForm.categoryId, productForm.visibilityBranchIds.length]);

  const categoriesQuery = useQuery({
    queryKey: ['catalog-categories', showInactive],
    queryFn: () => api.categories.list(showInactive),
  });

  const productsQuery = useQuery({
    queryKey: ['catalog-products', search, showInactive],
    queryFn: () => api.products.list({
      search,
      includeInactive: showInactive,
    }),
  });

  useEffect(() => {
    const categories = categoriesQuery.data?.categories ?? [];
    if (!productForm.categoryId && categories.length > 0) {
      setProductForm((current) => ({ ...current, categoryId: categories[0].id }));
    }
  }, [categoriesQuery.data, productForm.categoryId]);

  const refreshSlice = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog-categories'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] }),
    ]);
  };

  const categoryMutation = useMutation({
    mutationFn: async () => {
      if (editingCategory) {
        return api.categories.update(editingCategory.id, {
          name: categoryForm.name,
          description: categoryForm.description || null,
          isActive: categoryForm.isActive,
        });
      }

      return api.categories.create({
        name: categoryForm.name,
        description: categoryForm.description || null,
      });
    },
    onSuccess: async () => {
      setEditingCategory(null);
      setCategoryForm(emptyCategoryForm);
      setShowCategoryDialog(false);
      setPageError('');
      await refreshSlice();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => api.categories.remove(id),
    onSuccess: refreshSlice,
    onError: (error) => setPageError(getErrorMessage(error)),
  });

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
        isActive: productForm.isActive,
      };

      if (editingProduct) {
        return api.products.update(editingProduct.id, payload);
      }

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
      await refreshSlice();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const productStatusMutation = useMutation({
    mutationFn: ({ product, isActive }: { product: ProductListItem; isActive: boolean }) =>
      api.products.update(product.id, {
        isActive,
        visibilityBranchIds: product.visibleBranches.map((branch) => branch.branchId),
      }),
    onSuccess: refreshSlice,
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const handleCategorySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await categoryMutation.mutateAsync();
  };

  const handleProductSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await productMutation.mutateAsync();
  };

  const categories = categoriesQuery.data?.categories ?? [];
  const products = productsQuery.data?.products ?? [];

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-6 pt-24 sm:px-6 lg:px-8 lg:pt-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Slice 1</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">Products</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  Add products quickly, choose a category, and keep pricing clean for daily operations.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="Categories" value={String(categories.length)} />
                <MetricCard label="Products" value={String(products.length)} />
                <MetricCard label="Operating branch" value={primaryBranch?.name ?? 'Evaya Naturals'} />
              </div>
            </div>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Product master</h2>
                <p className="mt-1 text-sm text-slate-500">Keep the catalog clean, searchable, and ready for daily operations.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,280px)_auto]">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search product name"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                />
                <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                  <span className="text-slate-500">Show inactive</span>
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(event) => setShowInactive(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                </label>
              </div>
            </div>

            <form className="grid gap-5 rounded-[30px] bg-slate-50/80 p-5 lg:grid-cols-[minmax(0,1fr)_280px]" onSubmit={handleProductSubmit}>
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={productForm.name}
                    onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Product name"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Category</span>
                      {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategory(null);
                          setCategoryForm(emptyCategoryForm);
                          setShowCategoryDialog(true);
                        }}
                        className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                      >
                        Manage Categories
                      </button>
                      )}
                    </div>
                    <select
                      value={productForm.categoryId}
                      onChange={(event) => setProductForm((current) => ({ ...current, categoryId: event.target.value }))}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    >
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <select
                    value={productForm.unitType}
                    onChange={(event) => setProductForm((current) => ({ ...current, unitType: event.target.value }))}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  >
                    {['piece', 'kg', 'g', 'ml', 'l', 'box', 'jar', 'pack'].map((unit) => (
                      <option key={unit} value={unit}>{unit.toUpperCase()}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    value={productForm.sellingPrice}
                    onChange={(event) => setProductForm((current) => ({ ...current, sellingPrice: event.target.value }))}
                    placeholder="Selling price (UGX)"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                  <input
                    type="number"
                    min="0"
                    value={productForm.lowStockThreshold}
                    onChange={(event) => setProductForm((current) => ({ ...current, lowStockThreshold: event.target.value }))}
                    placeholder="Low-stock threshold"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-3xl bg-white px-4 py-4">
                  <p className="text-sm font-medium text-slate-700">Operating branch</p>
                  <p className="mt-1 text-xs text-slate-400">Locked to Evaya Naturals.</p>
                  <div className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
                    {primaryBranch?.name ?? 'Evaya Naturals'}
                  </div>
                </div>

                <label className="flex items-center justify-between rounded-3xl bg-white px-4 py-4 text-sm">
                  <span className="text-slate-500">Active</span>
                  <input
                    type="checkbox"
                    checked={productForm.isActive}
                    onChange={(event) => setProductForm((current) => ({ ...current, isActive: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                </label>

                <div className="flex flex-col gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={productMutation.isPending}
                    className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {productMutation.isPending ? 'Saving…' : editingProduct ? 'Save product' : 'Create product'}
                  </button>
                  {editingProduct && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProduct(null);
                        setProductForm({
                          ...emptyProductForm,
                          categoryId: categories[0]?.id ?? '',
                          visibilityBranchIds: primaryBranch?.id ? [primaryBranch.id] : [],
                        });
                      }}
                      className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
              </div>
            </form>

            <div className="mt-8 space-y-3 md:hidden">
              {products.map((product) => (
                <div key={product.id} className="rounded-[28px] bg-white px-4 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{product.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{product.categoryName}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${product.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {product.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MobileValue label="Selling price" value={currencyFormatter.format(product.sellingPrice)} />
                    <MobileValue label="Cost price" value={product.costPrice == null ? '—' : currencyFormatter.format(product.costPrice)} />
                    <MobileValue label="Stock threshold" value={String(product.lowStockThreshold)} />
                    <MobileValue label="Unit" value={product.unitType.toUpperCase()} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProduct(product);
                        setProductForm(toProductForm(product));
                      }}
                      className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => productStatusMutation.mutate({
                        product,
                        isActive: !product.isActive,
                      })}
                      className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      {product.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 hidden overflow-x-auto rounded-[28px] bg-white md:block">
              <table className="min-w-[760px] divide-y divide-slate-100 text-left text-sm">
                <thead className="bg-slate-50/70 text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Product</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Selling price</th>
                    <th className="px-5 py-3 font-medium">Cost price</th>
                    <th className="px-5 py-3 font-medium">Stock threshold</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td className="px-5 py-4.5">
                        <div className="font-medium text-slate-900">{product.name}</div>
                        <div className="mt-1 text-xs text-slate-400">{product.unitType.toUpperCase()}</div>
                      </td>
                      <td className="px-5 py-4.5">{product.categoryName}</td>
                      <td className="px-5 py-4.5">{currencyFormatter.format(product.sellingPrice)}</td>
                      <td className="px-5 py-4.5">{product.costPrice == null ? '—' : currencyFormatter.format(product.costPrice)}</td>
                      <td className="px-5 py-4.5">{product.lowStockThreshold}</td>
                      <td className="px-5 py-4.5">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${product.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {product.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-4.5">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProduct(product);
                              setProductForm(toProductForm(product));
                            }}
                            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => productStatusMutation.mutate({
                              product,
                              isActive: !product.isActive,
                            })}
                            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            {product.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {isAdmin && showCategoryDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-white/80 bg-[#fbfaf7] p-6 shadow-[0_30px_90px_rgba(15,23,42,0.16)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Categories</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  {editingCategory ? 'Edit category' : 'Create category'}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Save and return straight to products.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCategoryDialog(false);
                  setEditingCategory(null);
                  setCategoryForm(emptyCategoryForm);
                }}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <form className="grid gap-3 rounded-[28px] bg-white p-5" onSubmit={handleCategorySubmit}>
                <input
                  value={categoryForm.name}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Category name"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  required
                />
                <label className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                  <span className="text-slate-500">Active</span>
                  <input
                    type="checkbox"
                    checked={categoryForm.isActive}
                    onChange={(event) => setCategoryForm((current) => ({ ...current, isActive: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                </label>
                <textarea
                  value={categoryForm.description}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Short description"
                  rows={4}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                />
                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={categoryMutation.isPending}
                    className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {categoryMutation.isPending ? 'Saving…' : editingCategory ? 'Save category' : 'Create category'}
                  </button>
                  {editingCategory && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(null);
                        setCategoryForm(emptyCategoryForm);
                      }}
                      className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      New category
                    </button>
                  )}
                </div>
              </form>

              <div className="space-y-3 rounded-[28px] bg-white p-5">
                {categories.map((category) => (
                  <div key={category.id} className="rounded-3xl bg-slate-50 px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{category.name}</p>
                        <p className="mt-1 text-xs text-slate-400">{category.description || 'No description'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${category.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {category.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategory(category);
                            setCategoryForm({
                              name: category.name,
                              description: category.description ?? '',
                              isActive: category.isActive,
                            });
                          }}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void api.categories.update(category.id, { isActive: !category.isActive }).then(refreshSlice).catch((error) => setPageError(getErrorMessage(error)))}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                        >
                          {category.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategoryMutation.mutate(category.id)}
                          disabled={deleteCategoryMutation.isPending}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
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
