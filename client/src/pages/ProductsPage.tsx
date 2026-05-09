import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import type { ProductListItem } from '../types';

const currencyFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0,
});

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

const allowedUnits = ['kg', 'g', 'ml', 'l'] as const;

const emptyProductForm: ProductFormState = {
  name: '',
  sku: '',
  barcode: '',
  categoryId: '',
  unitType: 'kg',
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

function normalizeUnit(unitType: string) {
  return allowedUnits.includes(unitType as (typeof allowedUnits)[number]) ? unitType : 'kg';
}

function toProductForm(product: ProductListItem): ProductFormState {
  return {
    name: product.name,
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    categoryId: product.categoryId,
    unitType: normalizeUnit(product.unitType),
    sellingPrice: String(product.sellingPrice),
    costPrice: product.costPrice == null ? '' : String(product.costPrice),
    lowStockThreshold: String(product.lowStockThreshold),
    description: product.description ?? '',
    usageInstructions: product.usageInstructions ?? '',
    ingredients: product.ingredients ?? '',
    allergyWarning: product.allergyWarning ?? '',
    visibilityBranchIds: product.visibleBranches.map((branch) => branch.branchId),
  };
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm);
  const [editingProduct, setEditingProduct] = useState<ProductListItem | null>(null);
  const [pageError, setPageError] = useState('');

  const branchesQuery = useQuery({
    queryKey: ['catalog-branches'],
    queryFn: () => api.branches.list(),
  });

  const branches = branchesQuery.data?.branches ?? [];
  const primaryBranch = branches.find((branch) => branch.name === 'Evaya Naturals') ?? branches[0];

  useEffect(() => {
    if (branchesQuery.data && productForm.visibilityBranchIds.length === 0) {
      const defaultBranches = primaryBranch?.id ? [primaryBranch.id] : [];
      setProductForm((current) => ({ ...current, visibilityBranchIds: defaultBranches }));
    }
  }, [branchesQuery.data, primaryBranch?.id, productForm.visibilityBranchIds.length]);

  const categoriesQuery = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.categories.list(false),
  });

  const productsQuery = useQuery({
    queryKey: ['catalog-products', search],
    queryFn: () => api.products.list({
      search,
      includeInactive: false,
    }),
  });

  useEffect(() => {
    const categories = categoriesQuery.data?.categories ?? [];
    if (!productForm.categoryId && categories.length > 0) {
      setProductForm((current) => ({ ...current, categoryId: categories[0].id }));
    }
  }, [categoriesQuery.data, productForm.categoryId]);

  const refreshProducts = async () => {
    await queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
  };

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
      await refreshProducts();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const handleProductSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await productMutation.mutateAsync();
  };

  const products = productsQuery.data?.products ?? [];

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-6 pt-24 sm:px-6 lg:px-8 lg:pt-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Products</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Products</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Keep the product list clean and easy to use.
            </p>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Product list</h2>
                <p className="mt-1 text-sm text-slate-500">Short, clean, and ready for the counter.</p>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search product name"
                className="w-full max-w-[280px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
              />
            </div>

            <form className="grid gap-5 rounded-[30px] bg-slate-50/80 p-5 lg:grid-cols-[minmax(0,1fr)_280px]" onSubmit={handleProductSubmit}>
              <div className="space-y-4">
                <input
                  value={productForm.name}
                  onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Product name"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  required
                />

                <div className="grid gap-3 md:grid-cols-4">
                  <select
                    value={productForm.categoryId}
                    onChange={(event) => setProductForm((current) => ({ ...current, categoryId: event.target.value }))}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  >
                    {categoriesQuery.data?.categories?.filter((cat) => cat.isActive).map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                  <select
                    value={productForm.unitType}
                    onChange={(event) => setProductForm((current) => ({ ...current, unitType: event.target.value }))}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  >
                    {allowedUnits.map((unit) => (
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
                    value={productForm.costPrice}
                    onChange={(event) => setProductForm((current) => ({ ...current, costPrice: event.target.value }))}
                    placeholder="Cost price"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  />
                  <input
                    type="number"
                    min="0"
                    value={productForm.lowStockThreshold}
                    onChange={(event) => setProductForm((current) => ({ ...current, lowStockThreshold: event.target.value }))}
                    placeholder="Low stock level"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-3xl bg-white px-4 py-4 text-sm text-slate-500">
                  Evaya Naturals
                </div>

                {!productForm.categoryId && (
                  <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                    A product category is still required in the background before you can save.
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={productMutation.isPending || !productForm.categoryId}
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
                          categoryId: categoriesQuery.data?.categories?.[0]?.id ?? '',
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
                  <div>
                    <p className="font-medium text-slate-900">{product.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{product.unitType.toUpperCase()}</p>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MobileValue label="Selling price" value={currencyFormatter.format(product.sellingPrice)} />
                    <MobileValue label="Cost price" value={product.costPrice == null ? '—' : currencyFormatter.format(product.costPrice)} />
                    <MobileValue label="Low stock level" value={String(product.lowStockThreshold)} />
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
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 hidden overflow-x-auto rounded-[28px] bg-white md:block">
              <table className="min-w-[860px] divide-y divide-slate-100 text-left text-sm">
                <thead className="bg-slate-50/70 text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Product</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Selling price</th>
                    <th className="px-5 py-3 font-medium">Cost price</th>
                    <th className="px-5 py-3 font-medium">Low stock level</th>
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
                      <td className="px-5 py-4.5">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          {product.categoryName}
                        </span>
                      </td>
                      <td className="px-5 py-4.5">{currencyFormatter.format(product.sellingPrice)}</td>
                      <td className="px-5 py-4.5">{product.costPrice == null ? '—' : currencyFormatter.format(product.costPrice)}</td>
                      <td className="px-5 py-4.5">{product.lowStockThreshold}</td>
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
    </div>
  );
}

function MobileValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
