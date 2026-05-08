import type {
  Branch,
  Category,
  CustomerOption,
  InventoryBatch,
  InventoryMovement,
  InventoryRow,
  PosProduct,
  PosTodaySummary,
  ProductListItem,
  Receipt,
  Supplier,
  ShiftSnapshot,
  TodayReport,
} from '../types';

const API_BASE_URL = '/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token');
  
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(response.status, data.error || 'An error occurred');
  }

  return data;
}

export const authApi = {
  login: (email: string, password: string) =>
    request<{ message: string; token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  
  logout: () =>
    request<{ message: string }>('/auth/logout', {
      method: 'POST',
    }),
  
  getCurrentUser: () =>
    request<{ user: any }>('/auth/me'),
};

export const api = {
  // Health check
  health: () => request<{ status: string; timestamp: string }>('/health'),
  
  // Auth
  auth: authApi,

  branches: {
    list: () => request<{ branches: Branch[] }>('/catalog/branches'),
  },

  suppliers: {
    list: (includeInactive = true) => request<{ suppliers: Supplier[] }>(`/catalog/suppliers?includeInactive=${includeInactive}`),
    create: (payload: Record<string, unknown>) =>
      request<{ supplier: Supplier }>('/catalog/suppliers', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: Record<string, unknown>) =>
      request<{ supplier: Supplier }>(`/catalog/suppliers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    remove: (id: string) =>
      request<{ message: string }>(`/catalog/suppliers/${id}`, {
        method: 'DELETE',
      }),
  },

  categories: {
    list: (includeInactive = true) =>
      request<{ categories: Category[] }>(`/catalog/categories?includeInactive=${includeInactive}`),
    create: (payload: { name: string; description?: string | null }) =>
      request<{ category: Category }>('/catalog/categories', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: { name?: string; description?: string | null; isActive?: boolean }) =>
      request<{ category: Category }>(`/catalog/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    remove: (id: string) =>
      request<{ message: string }>(`/catalog/categories/${id}`, {
        method: 'DELETE',
      }),
  },

  products: {
    list: (params?: { search?: string; branchId?: string; includeInactive?: boolean }) => {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set('search', params.search);
      if (params?.branchId) searchParams.set('branchId', params.branchId);
      if (params?.includeInactive) searchParams.set('includeInactive', 'true');
      const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return request<{ products: ProductListItem[] }>(`/catalog/products${suffix}`);
    },
    create: (payload: Record<string, unknown>) =>
      request<{ product: ProductListItem }>('/catalog/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: Record<string, unknown>) =>
      request<{ product: ProductListItem }>(`/catalog/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
  },

  inventory: {
    list: (params?: { search?: string; branchId?: string; status?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set('search', params.search);
      if (params?.branchId) searchParams.set('branchId', params.branchId);
      if (params?.status) searchParams.set('status', params.status);
      const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return request<{ inventory: InventoryRow[] }>(`/catalog/inventory${suffix}`);
    },
    batches: (params?: { branchId?: string; productId?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.branchId) searchParams.set('branchId', params.branchId);
      if (params?.productId) searchParams.set('productId', params.productId);
      const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return request<{ batches: InventoryBatch[] }>(`/catalog/inventory/batches${suffix}`);
    },
    movements: (params?: { branchId?: string; productId?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.branchId) searchParams.set('branchId', params.branchId);
      if (params?.productId) searchParams.set('productId', params.productId);
      const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return request<{ movements: InventoryMovement[] }>(`/catalog/inventory/movements${suffix}`);
    },
    createBatch: (payload: Record<string, unknown>) =>
      request<{ batch: InventoryBatch }>('/catalog/inventory/batches', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    adjust: (payload: Record<string, unknown>) =>
      request<{ movement: InventoryMovement }>('/catalog/inventory/adjustments', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateThreshold: (id: string, lowStockThreshold: number) =>
      request<{ inventory: InventoryRow }>(`/catalog/inventory/${id}/threshold`, {
        method: 'PATCH',
        body: JSON.stringify({ lowStockThreshold }),
      }),
  },

  pos: {
    products: (params?: { search?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set('search', params.search);
      const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return request<{ products: PosProduct[] }>(`/pos/products${suffix}`);
    },
    customers: () => request<{ customers: CustomerOption[] }>('/pos/customers'),
    createSale: (payload: {
      customerId?: string | null;
      discount: number;
      paymentMethod: string;
      paymentReference?: string | null;
      notes?: string | null;
      items: Array<{ productId: string; quantity: number }>;
    }) =>
      request<{ sale: { id: string; receiptNumber: string; subtotal: number; discount: number; total: number; paymentMethod: string; createdAt: string }; receiptNumber: string }>('/pos/sales', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    today: () => request<PosTodaySummary>('/pos/sales/today'),
    receipt: (id: string) => request<{ receipt: Receipt }>(`/pos/receipts/${id}`),
    currentShift: () => request<{ shift: ShiftSnapshot | null }>('/pos/shift/current'),
    openShift: (openingCash: number) =>
      request<{ shift: ShiftSnapshot }>('/pos/shift/open', {
        method: 'POST',
        body: JSON.stringify({ openingCash }),
      }),
    closeShift: (payload: { countedCash: number; notes?: string | null }) =>
      request<{ shift: ShiftSnapshot }>('/pos/shift/close', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    approveShift: (shiftId: string) =>
      request<{ shift: ShiftSnapshot }>(`/pos/shift/${shiftId}/approve`, {
        method: 'POST',
      }),
    reportToday: () => request<TodayReport>('/pos/reports/today'),
  },
};

export { ApiError };
export default api;
