import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api, ApiError } from '../services/api';
import type { InventoryBatch, Supplier } from '../types';

const currencyFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0,
});

type SupplierFormState = {
  name: string;
  contactPerson: string;
  phone: string;
  whatsappNumber: string;
  location: string;
  notes: string;
  isActive: boolean;
};

type ReceivingFormState = {
  supplierId: string;
  productId: string;
  quantityReceived: string;
  costPrice: string;
  batchNumber: string;
  expiryDate: string;
  sellingPrice: string;
};

const emptySupplierForm: SupplierFormState = {
  name: '',
  contactPerson: '',
  phone: '',
  whatsappNumber: '',
  location: '',
  notes: '',
  isActive: true,
};

const emptyReceivingForm: ReceivingFormState = {
  supplierId: '',
  productId: '',
  quantityReceived: '',
  costPrice: '',
  batchNumber: '',
  expiryDate: '',
  sellingPrice: '',
};

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const [showInactive, setShowInactive] = useState(true);
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(emptySupplierForm);
  const [receivingForm, setReceivingForm] = useState<ReceivingFormState>(emptyReceivingForm);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [pageError, setPageError] = useState('');

  const suppliersQuery = useQuery({
    queryKey: ['catalog-suppliers', showInactive],
    queryFn: () => api.suppliers.list(showInactive),
  });

  const productsQuery = useQuery({
    queryKey: ['catalog-products-for-receiving'],
    queryFn: () => api.products.list({ includeInactive: true }),
  });

  const historyQuery = useQuery({
    queryKey: ['catalog-receiving-history'],
    queryFn: () => api.inventory.batches(),
  });

  useEffect(() => {
    const suppliers = suppliersQuery.data?.suppliers ?? [];
    const products = productsQuery.data?.products ?? [];

    if (!receivingForm.supplierId && suppliers.length > 0) {
      setReceivingForm((current) => ({ ...current, supplierId: suppliers[0].id }));
    }
    if (!receivingForm.productId && products.length > 0) {
      setReceivingForm((current) => ({
        ...current,
        productId: products[0].id,
        sellingPrice: String(products[0].sellingPrice),
      }));
    }
  }, [productsQuery.data, receivingForm.productId, receivingForm.supplierId, suppliersQuery.data]);

  const refreshSlice = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog-suppliers'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-receiving-history'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-inventory'] }),
    ]);
  };

  const supplierMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: supplierForm.name,
        contactPerson: supplierForm.contactPerson || null,
        phone: supplierForm.phone,
        whatsappNumber: supplierForm.whatsappNumber || null,
        location: supplierForm.location || null,
        notes: supplierForm.notes || null,
        isActive: supplierForm.isActive,
      };

      if (editingSupplier) {
        return api.suppliers.update(editingSupplier.id, payload);
      }
      return api.suppliers.create(payload);
    },
    onSuccess: async () => {
      setEditingSupplier(null);
      setSupplierForm(emptySupplierForm);
      setPageError('');
      await refreshSlice();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const deleteSupplierMutation = useMutation({
    mutationFn: (id: string) => api.suppliers.remove(id),
    onSuccess: refreshSlice,
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const receivingMutation = useMutation({
    mutationFn: (branchId: string) => api.inventory.createBatch({
      supplierId: receivingForm.supplierId,
      productId: receivingForm.productId,
      branchId,
      quantityReceived: Number(receivingForm.quantityReceived),
      costPrice: Number(receivingForm.costPrice),
      batchNumber: receivingForm.batchNumber,
      expiryDate: receivingForm.expiryDate,
      sellingPrice: Number(receivingForm.sellingPrice),
    }),
    onSuccess: async () => {
      const selectedProduct = productsQuery.data?.products.find((product) => product.id === receivingForm.productId);
      setReceivingForm({
        ...emptyReceivingForm,
        supplierId: receivingForm.supplierId,
        productId: receivingForm.productId,
        sellingPrice: selectedProduct ? String(selectedProduct.sellingPrice) : '',
      });
      setPageError('');
      await refreshSlice();
    },
    onError: (error) => setPageError(getErrorMessage(error)),
  });

  const suppliers = suppliersQuery.data?.suppliers ?? [];
  const products = productsQuery.data?.products ?? [];
  const history = (historyQuery.data?.batches ?? []).slice().sort((a, b) => (
    new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime()
  ));

  const handleSupplierSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    await supplierMutation.mutateAsync();
  };

  const handleReceivingSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError('');
    const firstBranch = products[0]?.visibleBranches?.[0]?.branchId;
    if (firstBranch) {
      await receivingMutation.mutateAsync(firstBranch);
      return;
    }
    setPageError('No branch-ready product is available for receiving');
  };

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Receiving Ops</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">Suppliers and stock receiving</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  Keep supplier records clean, receive stock quickly, and review the latest batches without ERP clutter.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="Suppliers" value={String(suppliers.length)} />
                <MetricCard label="Products ready" value={String(products.length)} />
                <MetricCard label="Receiving history" value={String(history.length)} />
              </div>
            </div>
          </section>

          {pageError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[1.05fr_1.2fr]">
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Suppliers</h2>
                  <p className="mt-1 text-sm text-slate-500">Create, update, deactivate, or remove unused suppliers.</p>
                </div>
                <label className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-500">
                  <span>Show inactive</span>
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(event) => setShowInactive(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                </label>
              </div>

              <form className="grid gap-3 rounded-3xl bg-slate-50 p-4" onSubmit={handleSupplierSubmit}>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={supplierForm.name}
                    onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Supplier name"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                  <input
                    value={supplierForm.contactPerson}
                    onChange={(event) => setSupplierForm((current) => ({ ...current, contactPerson: event.target.value }))}
                    placeholder="Contact person"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={supplierForm.phone}
                    onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="Phone number"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                  <input
                    value={supplierForm.whatsappNumber}
                    onChange={(event) => setSupplierForm((current) => ({ ...current, whatsappNumber: event.target.value }))}
                    placeholder="WhatsApp number"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                  />
                </div>
                <input
                  value={supplierForm.location}
                  onChange={(event) => setSupplierForm((current) => ({ ...current, location: event.target.value }))}
                  placeholder="Location"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                />
                <textarea
                  value={supplierForm.notes}
                  onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Notes"
                  rows={3}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500">
                    <span>Active</span>
                    <input
                      type="checkbox"
                      checked={supplierForm.isActive}
                      onChange={(event) => setSupplierForm((current) => ({ ...current, isActive: event.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={supplierMutation.isPending}
                    className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {supplierMutation.isPending ? 'Saving…' : editingSupplier ? 'Update supplier' : 'Create supplier'}
                  </button>
                  {editingSupplier && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSupplier(null);
                        setSupplierForm(emptySupplierForm);
                      }}
                      className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div className="mt-5 space-y-3">
                {suppliers.map((supplier) => (
                  <div key={supplier.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{supplier.name}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {supplier.contactPerson || 'No contact person'} · {supplier.phone}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                          {supplier.location || 'No location'} · {supplier.whatsappNumber || 'No WhatsApp'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSupplier(supplier);
                            setSupplierForm({
                              name: supplier.name,
                              contactPerson: supplier.contactPerson ?? '',
                              phone: supplier.phone,
                              whatsappNumber: supplier.whatsappNumber ?? '',
                              location: supplier.location ?? '',
                              notes: supplier.notes ?? '',
                              isActive: supplier.isActive,
                            });
                          }}
                          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void api.suppliers.update(supplier.id, { isActive: !supplier.isActive }).then(refreshSlice).catch((error) => setPageError(getErrorMessage(error)))}
                          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
                        >
                          {supplier.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSupplierMutation.mutate(supplier.id)}
                          disabled={deleteSupplierMutation.isPending}
                          className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Receive stock</h2>
                <p className="mt-1 text-sm text-slate-500">Choose a supplier, receive a batch, and update inventory in one step.</p>
                <form className="mt-5 grid gap-3" onSubmit={handleReceivingSubmit}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={receivingForm.supplierId}
                      onChange={(event) => setReceivingForm((current) => ({ ...current, supplierId: event.target.value }))}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    >
                      {suppliers.filter((supplier) => supplier.isActive).map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                      ))}
                    </select>
                    <select
                      value={receivingForm.productId}
                      onChange={(event) => {
                        const selected = products.find((product) => product.id === event.target.value);
                        setReceivingForm((current) => ({
                          ...current,
                          productId: event.target.value,
                          sellingPrice: selected ? String(selected.sellingPrice) : current.sellingPrice,
                        }));
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    >
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <input
                      type="number"
                      min="1"
                      value={receivingForm.quantityReceived}
                      onChange={(event) => setReceivingForm((current) => ({ ...current, quantityReceived: event.target.value }))}
                      placeholder="Quantity"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      value={receivingForm.costPrice}
                      onChange={(event) => setReceivingForm((current) => ({ ...current, costPrice: event.target.value }))}
                      placeholder="Cost price"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                    <input
                      value={receivingForm.batchNumber}
                      onChange={(event) => setReceivingForm((current) => ({ ...current, batchNumber: event.target.value }))}
                      placeholder="Batch number"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                    <input
                      type="date"
                      value={receivingForm.expiryDate}
                      onChange={(event) => setReceivingForm((current) => ({ ...current, expiryDate: event.target.value }))}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                      required
                    />
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={receivingForm.sellingPrice}
                    onChange={(event) => setReceivingForm((current) => ({ ...current, sellingPrice: event.target.value }))}
                    placeholder="Selling price"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400"
                    required
                  />
                  <button
                    type="submit"
                    disabled={receivingMutation.isPending}
                    className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {receivingMutation.isPending ? 'Receiving…' : 'Receive stock'}
                  </button>
                </form>
              </div>

              <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
                <h2 className="text-xl font-semibold">Receiving history</h2>
                <p className="mt-1 text-sm text-slate-500">Latest received batches with supplier, cost, quantity, and expiry.</p>
                <div className="mt-5 space-y-3">
                  {history.map((batch: InventoryBatch) => (
                    <div key={batch.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{batch.productName}</p>
                          <p className="mt-1 text-sm text-slate-500">{batch.supplierName || 'No supplier'} · {batch.batchNumber}</p>
                          <p className="mt-2 text-xs text-slate-400">
                            Qty {batch.quantityReceived} · Expires {new Date(batch.expiryDate).toLocaleDateString()} · Received {new Date(batch.receivedDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-900">{currencyFormatter.format(batch.costPrice)}</p>
                          <p className="mt-1 text-xs text-slate-400">{batch.quantityRemaining} remaining</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
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
