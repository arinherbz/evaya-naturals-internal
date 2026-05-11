import type {
  BroadcastLink,
  BroadcastRecord,
  Branch,
  BusinessProfileSettings,
  Category,
  Customer,
  CustomerHistory,
  Delivery,
  InventoryBatch,
  InventoryMovement,
  InventoryRow,
  Expense,
  PaymentMethodSettings,
  PosProduct,
  PosTodaySummary,
  ProductListItem,
  ReportSummary,
  Receipt,
  Role,
  StaffUser,
  Supplier,
  ShiftSnapshot,
  SystemSettings,
  TodayReport,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

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

async function requestBlob(
  url: string,
  options: RequestInit = {}
): Promise<Blob> {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = 'An error occurred';
    try {
      const data = await response.json();
      errorMessage = data.error || errorMessage;
    } catch {
      // Ignore JSON parsing for binary responses.
    }
    throw new ApiError(response.status, errorMessage);
  }

  return response.blob();
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

  settings: {
    public: () => request<{
      businessProfile: BusinessProfileSettings;
      systemSettings: SystemSettings;
      paymentMethods: PaymentMethodSettings;
    }>('/settings/public'),
    get: () => request<{
      businessProfile: BusinessProfileSettings;
      systemSettings: SystemSettings;
      paymentMethods: PaymentMethodSettings;
      roles: Role[];
      users: StaffUser[];
    }>('/settings'),
    updateBusinessProfile: (payload: {
      businessName: string;
      logoDataUrl?: string | null;
      phone: string;
      email: string;
      address?: string | null;
    }) => request<{ businessProfile: BusinessProfileSettings }>('/settings/business-profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
    updateSystem: (payload: {
      expiryAlertDays: number;
      lowStockDefaultThreshold: number;
      receiptFooterMessage?: string | null;
      reportFooterMessage?: string | null;
    }) => request<{ systemSettings: SystemSettings }>('/settings/system', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
    updatePaymentMethods: (payload: PaymentMethodSettings) => request<{ paymentMethods: PaymentMethodSettings }>('/settings/payment-methods', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
    createStaffUser: (payload: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string | null;
      roleId: string;
      password: string;
      isActive: boolean;
    }) => request<{ user: StaffUser }>('/settings/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    updateStaffUser: (id: string, payload: Partial<{
      firstName: string;
      lastName: string;
      email: string;
      phone?: string | null;
      roleId: string;
      isActive: boolean;
    }>) => request<{ user: StaffUser }>(`/settings/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
    resetStaffPassword: (id: string, password: string) => request<{ message: string }>(`/settings/staff/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
    deleteStaffUser: (id: string) =>
      request<{ message: string }>(`/settings/staff/${id}`, {
        method: 'DELETE',
      }),
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
    remove: (id: string) =>
      request<{ message: string }>(`/catalog/products/${id}`, {
        method: 'DELETE',
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
    customers: (params?: { search?: string; includeInactive?: boolean }) => {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set('search', params.search);
      if (params?.includeInactive) searchParams.set('includeInactive', 'true');
      const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return request<{ customers: Customer[] }>(`/pos/customers${suffix}`);
    },
    createCustomer: (payload: { name: string; phone: string; whatsappNumber?: string | null; email?: string | null; isActive?: boolean }) =>
      request<{ customer: Customer }>('/pos/customers', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateCustomer: (id: string, payload: Partial<{ name: string; phone: string; whatsappNumber?: string | null; email?: string | null; isActive: boolean }>) =>
      request<{ customer: Customer }>(`/pos/customers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    deleteCustomer: (id: string) =>
      request<{ message: string }>(`/pos/customers/${id}`, {
        method: 'DELETE',
      }),
    customerHistory: (id: string) => request<CustomerHistory>(`/pos/customers/${id}/history`),
    createBroadcast: (payload: { customerIds: string[]; messageBody: string; channel: 'whatsapp' | 'sms' }) =>
      request<{ broadcast: BroadcastRecord; statusLabel?: string; message?: string; links?: BroadcastLink[] }>('/pos/customers/broadcasts', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    createSale: (payload: {
      customerId?: string | null;
      quickCustomer?: { name: string; phone: string; whatsappNumber?: string | null; email?: string | null } | null;
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
    today: (params?: { paymentMethod?: string; receiptSearch?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.paymentMethod) searchParams.set('paymentMethod', params.paymentMethod);
      if (params?.receiptSearch) searchParams.set('receiptSearch', params.receiptSearch);
      const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return request<PosTodaySummary>(`/pos/sales/today${suffix}`);
    },
    receipts: (params?: { search?: string; startDate?: string; endDate?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set('search', params.search);
      if (params?.startDate) searchParams.set('startDate', params.startDate);
      if (params?.endDate) searchParams.set('endDate', params.endDate);
      const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return request<{ receipts: Receipt[] }>(`/pos/receipts${suffix}`);
    },
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
    reportSummary: (params: { period: 'daily' | 'weekly' | 'custom'; startDate?: string; endDate?: string }) => {
      const searchParams = new URLSearchParams();
      searchParams.set('period', params.period);
      if (params.startDate) searchParams.set('startDate', params.startDate);
      if (params.endDate) searchParams.set('endDate', params.endDate);
      return request<ReportSummary>(`/pos/reports/summary?${searchParams.toString()}`);
    },
    downloadReportPdf: (params: { period: 'daily' | 'weekly' | 'custom'; startDate?: string; endDate?: string }) => {
      const searchParams = new URLSearchParams();
      searchParams.set('period', params.period);
      if (params.startDate) searchParams.set('startDate', params.startDate);
      if (params.endDate) searchParams.set('endDate', params.endDate);
      return requestBlob(`/pos/reports/pdf?${searchParams.toString()}`);
    },
    expenses: (params?: { startDate?: string; endDate?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.startDate) searchParams.set('startDate', params.startDate);
      if (params?.endDate) searchParams.set('endDate', params.endDate);
      const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return request<{ expenses: Expense[]; categories: string[] }>(`/pos/expenses${suffix}`);
    },
    createExpense: (payload: { title: string; category: string; amount: number; paymentMethod: string; expenseDate: string; description?: string | null }) =>
      request<{ expense: Expense }>('/pos/expenses', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateExpense: (id: string, payload: Partial<{ title: string; category: string; amount: number; paymentMethod: string; expenseDate: string; description?: string | null }>) =>
      request<{ expense: Expense }>(`/pos/expenses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    deleteExpense: (id: string) =>
      request<{ message: string }>(`/pos/expenses/${id}`, {
        method: 'DELETE',
      }),
    deliverySupport: () =>
      request<{ riders: Array<{ id: string; firstName: string; lastName: string }>; customers: Array<{ id: string; name: string; phone: string }>; statuses: string[] }>('/pos/deliveries/support'),
    deliveries: (params?: { status?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set('status', params.status);
      const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return request<{ deliveries: Delivery[] }>(`/pos/deliveries${suffix}`);
    },
    createDelivery: (payload: { customerId: string; saleId?: string | null; receiptReference?: string | null; deliveryAddress: string; riderId?: string | null; deliveryFee: number; status?: string; deliveryDate: string; notes?: string | null }) =>
      request<{ delivery: Delivery }>('/pos/deliveries', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateDelivery: (id: string, payload: Partial<{ riderId?: string | null; status?: string; deliveryAddress?: string; deliveryFee?: number; deliveryDate?: string; notes?: string | null }>) =>
      request<{ delivery: Delivery }>(`/pos/deliveries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
  },
};

export { ApiError };
export default api;
