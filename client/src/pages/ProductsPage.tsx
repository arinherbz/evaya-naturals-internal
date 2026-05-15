import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Search, AlertTriangle, X, type LucideIcon } from 'lucide-react';
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

const iCls = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10';

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductListItem | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [formError, setFormError] = useState('');
  const [pageError, setPageError] = useState('');

  const branchesQuery = useQuery({ queryKey: ['catalog-branches'], queryFn: () => api.branches.list() });
  const productsQuery = useQuery({
    queryKey: ['catalog-products', search],
    queryFn: () => api.products.list({ search, includeInactive: false }),
  });

  const primaryBranch =
    (branchesQuery.data?.branches ?? []).find((b) => b.name === 'Evaya Naturals') ??
    branchesQuery.data?.branches?.[0];
  const refreshAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-products-for-inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-products'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-products-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-reports-today'] }),
      queryClient.invalidateQueries({ queryKey: ['report-summary'] }),
    ]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!primaryBranch?.id) throw new Error('Evaya Naturals branch is not configured yet.');
      const payload = {
        name: form.name.trim(),
        sku: null,
        barcode: null,
        unitType: form.unitType,
        sellingPrice: Number(form.sellingPrice),
        costPrice: Number(form.costPrice),
        lowStockThreshold: Number(form.lowStockThreshold),
        description: form.description.trim() || null,
        usageInstructions: null,
        ingredients: null,
        allergyWarning: null,
        visibilityBranchIds: [primaryBranch.id],
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

  const openAdd = () => { setEditingProduct(null); setForm(emptyForm); setFormError(''); setShowModal(true); };
  const openEdit = (p: ProductListItem) => { setEditingProduct(p); setForm(toForm(p)); setFormError(''); setShowModal(true); };
  const closeModal = () => {
    if (saveMutation.isPending) return;
    setShowModal(false); setEditingProduct(null); setForm(emptyForm); setFormError('');
  };

  const products = productsQuery.data?.products ?? [];
  const deletingProduct = products.find((p) => p.id === deletingProductId);

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 pb-12 pt-[76px] sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-5xl space-y-6">

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Products</h1>
              <p className="mt-0.5 text-sm text-slate-400">Manage your product catalogue</p>
            </div>
            <button
              type="button"
              onClick={openAdd}
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              <Plus size={15} strokeWidth={2} /> Add Product
            </button>
          </div>

          {pageError && (
            <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle size={14} className="shrink-0" />
              <span className="flex-1">{pageError}</span>
              <button type="button" onClick={() => setPageError('')}><X size={14} className="text-rose-400" /></button>
            </div>
          )}

          {/* Product table card */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">
                All Products
                {products.length > 0 && <span className="ml-1.5 text-slate-400 font-normal">({products.length})</span>}
              </h2>
              <div className="relative ml-auto">
                <Search size={14} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products…"
                  className="w-[220px] rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10"
                />
              </div>
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 p-4 sm:hidden">
              {productsQuery.isLoading && <SkeletonRows n={5} />}
              {!productsQuery.isLoading && products.length === 0 && (
                <EmptyState icon={Package} text="No products yet" action={{ label: 'Add first product', onClick: openAdd }} />
              )}
              {products.map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{p.unitType.toUpperCase()} · Cost {ugx(p.costPrice ?? 0)}</p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-[#1B4332]">{ugx(p.sellingPrice)}</p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => openEdit(p)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Edit</button>
                    <button type="button" onClick={() => setDeletingProductId(p.id)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100">Deactivate</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Product', 'Unit', 'Cost price', 'Selling price', 'Low stock at', 'Actions'].map((h) => (
                      <th key={h} className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {productsQuery.isLoading && (
                    <tr><td colSpan={6}><SkeletonRows n={5} className="px-5 py-1" /></td></tr>
                  )}
                  {!productsQuery.isLoading && products.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState icon={Package} text="No products yet" action={{ label: 'Add first product', onClick: openAdd }} />
                      </td>
                    </tr>
                  )}
                  {products.map((p) => (
                    <tr key={p.id} className="transition hover:bg-slate-50/60">
                      <td className="max-w-[200px] px-5 py-3.5">
                        <p className="truncate font-medium text-slate-900">{p.name}</p>
                        {p.description && <p className="mt-0.5 truncate text-xs text-slate-400">{p.description}</p>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{p.unitType.toUpperCase()}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-slate-500">{ugx(p.costPrice ?? 0)}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 font-semibold text-[#1B4332]">{ugx(p.sellingPrice)}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-slate-500">{p.lowStockThreshold}</td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => openEdit(p)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50">Edit</button>
                          <button type="button" onClick={() => setDeletingProductId(p.id)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-100">Deactivate</button>
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

      {/* Add / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="my-4 w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl sm:my-auto">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                {editingProduct ? `Edit product` : 'New product'}
              </h2>
              <button type="button" onClick={closeModal} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            {formError && (
              <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                <AlertTriangle size={13} className="shrink-0" />
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Product name" required>
                <input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="e.g. Shea Butter 250ml" className={iCls} required minLength={2} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Unit" required>
                  <select value={form.unitType} onChange={(e) => setForm((c) => ({ ...c, unitType: e.target.value as UnitType }))} className={iCls}>
                    {UNITS.map((u) => <option key={u} value={u}>{u.toUpperCase()}</option>)}
                  </select>
                </Field>
                <Field label="Low stock level">
                  <input type="number" min="0" value={form.lowStockThreshold} onChange={(e) => setForm((c) => ({ ...c, lowStockThreshold: e.target.value }))} placeholder="10" className={iCls} required />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Selling price (UGX)" required>
                  <input type="number" min="0" step="1" value={form.sellingPrice} onChange={(e) => setForm((c) => ({ ...c, sellingPrice: e.target.value }))} placeholder="0" className={iCls} required />
                </Field>
                <Field label="Cost price (UGX)" required>
                  <input type="number" min="0" step="1" value={form.costPrice} onChange={(e) => setForm((c) => ({ ...c, costPrice: e.target.value }))} placeholder="0" className={iCls} required />
                </Field>
              </div>

              <Field label="Description">
                <textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} rows={2} placeholder="Optional product details" className={`${iCls} resize-none`} />
              </Field>

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saveMutation.isPending || !primaryBranch?.id} className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-60" style={{ background: '#1B4332' }}>
                  {saveMutation.isPending ? 'Saving…' : editingProduct ? 'Save changes' : 'Create product'}
                </button>
                <button type="button" onClick={closeModal} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate confirmation */}
      {deletingProductId && deletingProduct && (
        <DestructiveModal
          title="Deactivate product?"
          description={<>
            <strong className="text-slate-900">{deletingProduct.name}</strong> will be hidden from POS and all views. Sales history is kept in the database.
          </>}
          confirmLabel={deactivateMutation.isPending ? 'Deactivating…' : 'Deactivate'}
          isPending={deactivateMutation.isPending}
          onConfirm={() => deactivateMutation.mutate(deletingProductId)}
          onCancel={() => setDeletingProductId(null)}
        />
      )}
    </div>
  );
}

// ── Shared helpers ──────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-500">
        {label}{required && <span className="ml-0.5 text-rose-400">*</span>}
      </label>
      {children}
    </div>
  );
}

function SkeletonRows({ n, className }: { n: number; className?: string }) {
  return (
    <div className={`space-y-2 py-3 ${className ?? 'px-5'}`}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, text, action }: {
  icon: LucideIcon;
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-2">
      <Icon size={32} strokeWidth={1.25} className="text-slate-200" />
      <p className="text-sm text-slate-400">{text}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="mt-1 text-xs font-semibold text-[#1B4332] hover:underline">
          {action.label}
        </button>
      )}
    </div>
  );
}

function DestructiveModal({ title, description, confirmLabel, isPending, onConfirm, onCancel }: {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onConfirm} disabled={isPending} className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60">
            {confirmLabel}
          </button>
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export { Field, SkeletonRows, EmptyState, DestructiveModal };
