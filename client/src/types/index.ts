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
  categoryName: string;
  visibleBranches: ProductBranchVisibility[];
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email?: string;
  isActive: boolean;
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
  categoryName: string;
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
  movementType: 'stock_received' | 'adjustment' | 'damaged' | 'expired' | 'returned';
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
