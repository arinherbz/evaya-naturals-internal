export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roleId: string;
  branchId: string | null;
  role: {
    id: string;
    name: string;
    permissions: string[];
  };
  branch: {
    id: string;
    name: string;
    code: string;
  } | null;
}

export interface StaffUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  roleId: string;
  branchId: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  role: {
    id: string;
    name: string;
    permissions: string[];
  };
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  categoryId: string;
  unitType: string;
  sellingPrice: number;
  costPrice?: number;
  description?: string;
  usageInstructions?: string;
  ingredients?: string;
  allergyWarning?: string;
  lowStockThreshold: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductBranchVisibility {
  branchId: string;
  branchName: string;
}

export interface ProductListItem extends Product {
  visibleBranches: ProductBranchVisibility[];
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string | null;
  phone: string;
  whatsappNumber?: string | null;
  location?: string | null;
  notes?: string | null;
  email?: string | null;
  isActive: boolean;
}

export interface CustomerOption {
  id: string;
  name: string;
  phone: string;
  whatsappNumber?: string | null;
  email?: string | null;
  isActive?: boolean;
}

export interface Customer extends CustomerOption {
  isActive: boolean;
}

export interface CustomerHistory {
  customer: Customer;
  sales: PosSaleSummary[];
  totalSpent: number;
}

export interface BroadcastLink {
  customerId: string;
  customerName: string;
  phone: string;
  url: string;
}

export interface BroadcastRecord {
  id: string;
  channel: 'whatsapp' | 'sms';
  messageBody: string;
  createdBy: string;
  recipientCount: number;
  status: 'prepared' | 'sent' | 'failed' | 'provider_not_configured';
  createdAt: string;
  updatedAt: string;
}

export interface InventoryBatch {
  id: string;
  batchNumber: string;
  productId: string;
  supplierId: string | null;
  branchId: string;
  expiryDate: string;
  quantityReceived: number;
  quantityRemaining: number;
  costPrice: number;
  sellingPrice: number | null;
  receivedDate: string;
  isExpired: boolean;
  productName?: string;
  branchName?: string;
  supplierName?: string | null;
}

export interface InventoryRow {
  id: string;
  productId: string;
  branchId: string;
  quantity: number;
  lowStockThreshold: number;
  updatedAt: string;
  productName: string;
  sku?: string | null;
  barcode?: string | null;
  unitType: string;
  productLowStockThreshold: number;
  productIsActive: boolean;
  branchName: string;
  lowStock: boolean;
  expiringSoonCount: number;
  expiredCount: number;
  batches: InventoryBatch[];
}

export interface InventoryMovement {
  id: string;
  productId: string;
  branchId: string;
  batchId: string | null;
  movementType: 'sale' | 'stock_received' | 'adjustment' | 'damaged' | 'expired' | 'returned';
  quantity: number;
  referenceId?: string | null;
  referenceType?: string | null;
  reason?: string | null;
  userId: string;
  createdAt: string;
  productName: string;
  branchName: string;
  batchNumber?: string | null;
  actorName: string;
}

export interface PosProduct {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  unitType: string;
  sellingPrice: number;
  lowStockThreshold: number;
  description?: string | null;
  branchId: string;
  availableQuantity: number;
  inventoryQuantity: number;
  lowStock: boolean;
  isOutOfStock: boolean;
  nextExpiryDate?: string | null;
}

export interface PosSaleSummary {
  id: string;
  receiptNumber: string;
  total: number;
  paymentMethod: string;
  createdAt: string;
  cashierName: string;
}

export interface PosTodaySummary {
  totalSales: number;
  salesCount: number;
  pendingCashUp: boolean;
  paymentTotals: {
    cash: number;
    mtnMobileMoney: number;
    airtelMoney: number;
    card: number;
    bankTransfer: number;
  };
  sales: PosSaleSummary[];
}

export interface ShiftSnapshot {
  id: string;
  cashierId: string;
  cashierName: string;
  branchId: string;
  openingCash: number;
  countedCash?: number | null;
  expectedCash?: number | null;
  variance?: number | null;
  openedAt: string;
  closedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
  status: 'active' | 'closed' | 'approved';
  saleCount: number;
  salesTotal: number;
  paymentTotals: {
    cash: number;
    mtnMobileMoney: number;
    airtelMoney: number;
    card: number;
    bankTransfer: number;
  };
}

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  paymentMethod: string;
  expenseDate: string;
  description?: string | null;
  recordedBy: string;
  recordedByName?: string | null;
}

export interface Delivery {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  saleId?: string | null;
  receiptReference?: string | null;
  deliveryAddress: string;
  riderId?: string | null;
  riderName?: string | null;
  deliveryFee: number;
  status: 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'failed' | 'cancelled';
  deliveryDate?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface TodayReport {
  todaySales: number;
  salesCount: number;
  paymentTotals: {
    cash: number;
    mtnMobileMoney: number;
    airtelMoney: number;
    card: number;
    bankTransfer: number;
  };
  varianceSummary: number;
  shifts: ShiftSnapshot[];
}

export interface ReportSummary {
  businessName: string;
  title: string;
  period: 'daily' | 'weekly' | 'custom';
  periodLabel: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  currency: string;
  totalSales: number;
  salesCount: number;
  totalDiscounts: number;
  paymentTotals: {
    cash: number;
    mtnMobileMoney: number;
    airtelMoney: number;
    card: number;
    bankTransfer: number;
  };
  expensesTotal: number;
  netAmount: number;
  reportFooterMessage?: string | null;
  bestSellingProducts: Array<{
    productName: string;
    quantity: number;
    revenue: number;
  }>;
  lowStockSummary: {
    count: number;
    items: Array<{
      productId?: string;
      productName: string;
      quantity: number;
    }>;
  };
  shiftSummary: {
    count: number;
    varianceTotal: number;
    shifts: ShiftSnapshot[];
  };
  expenses: Expense[];
  sales: PosSaleSummary[];
}

export interface ReceiptLineItem {
  id: string;
  productId: string;
  productName: string;
  batchId: string;
  batchNumber: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  businessName: string;
  branchId: string;
  branchName: string;
  cashierId: string;
  cashierName: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  paymentReference?: string | null;
  notes?: string | null;
  receiptFooterMessage?: string | null;
  createdAt: string;
  items: ReceiptLineItem[];
}

export interface BusinessProfileSettings {
  businessName: string;
  logoDataUrl?: string | null;
  phone: string;
  email: string;
  address?: string | null;
  currency: string;
}

export interface SystemSettings {
  expiryAlertDays: number;
  lowStockDefaultThreshold: number;
  receiptFooterMessage?: string | null;
  reportFooterMessage?: string | null;
}

export interface PaymentMethodSettings {
  cash: boolean;
  mtn_mobile_money: boolean;
  airtel_money: boolean;
  bank_card: boolean;
  bank_transfer: boolean;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}
