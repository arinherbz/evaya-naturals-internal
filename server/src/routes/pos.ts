import { Hono } from 'hono';
import { and, asc, desc, eq, gte, inArray, like, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { authMiddleware, requirePermission, type AuthUser } from '../middleware/auth.js';
import { db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { generateReportPdf } from '../lib/report-pdf.js';
import { getAppSettings } from '../lib/app-settings.js';
import { applyInventoryDelta } from '../lib/inventory.js';

const posRoutes = new Hono();
const primaryBranchName = 'Evaya Naturals';
const paymentMethods = ['cash', 'mtn_mobile_money', 'airtel_money', 'bank_card', 'bank_transfer'] as const;
const expenseCategories = ['Rent', 'Utilities', 'Salaries', 'Transport', 'Packaging', 'Supplier Payment', 'Marketing', 'Miscellaneous'] as const;
const reportPeriods = ['daily', 'weekly', 'custom'] as const;
const deliveryStatuses = ['pending', 'assigned', 'picked_up', 'delivered', 'failed', 'cancelled'] as const;

const salePayloadSchema = z.object({
  customerId: z.string().trim().min(1).optional().nullable(),
  quickCustomer: z.object({
    name: z.string().trim().min(2).max(160),
    phone: z.string().trim().min(7).max(40),
    whatsappNumber: z.string().trim().max(40).optional().nullable(),
    email: z.string().trim().email().max(160).optional().nullable().or(z.literal('')).optional(),
  }).optional().nullable(),
  discount: z.number().min(0).default(0),
  paymentMethod: z.enum(paymentMethods),
  paymentReference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z.array(z.object({
    productId: z.string().trim().min(1),
    quantity: z.number().int().positive(),
  })).min(1),
});

const quickCustomerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(7).max(40),
  whatsappNumber: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().max(160).optional().nullable().or(z.literal('')).optional(),
  isActive: z.boolean().optional(),
});

const customerUpdateSchema = quickCustomerSchema.partial();

const broadcastSchema = z.object({
  customerIds: z.array(z.string().trim().min(1)).min(1),
  messageBody: z.string().trim().min(2).max(1000),
  channel: z.enum(['whatsapp', 'sms']),
});

const shiftOpenSchema = z.object({
  openingCash: z.number().int().min(0),
});

const shiftCloseSchema = z.object({
  countedCash: z.number().int().min(0),
  notes: z.string().trim().max(500).optional().nullable(),
});

const expenseSchema = z.object({
  title: z.string().trim().min(2).max(160),
  category: z.enum(expenseCategories),
  amount: z.number().int().positive(),
  paymentMethod: z.enum(paymentMethods),
  expenseDate: z.string().trim().min(1),
  description: z.string().trim().max(500).optional().nullable(),
});

const reportQuerySchema = z.object({
  period: z.enum(reportPeriods).default('daily'),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
});

const deliverySchema = z.object({
  customerId: z.string().trim().min(1),
  saleId: z.string().trim().optional().nullable(),
  receiptReference: z.string().trim().max(120).optional().nullable(),
  deliveryAddress: z.string().trim().min(4).max(500),
  riderId: z.string().trim().optional().nullable(),
  deliveryFee: z.number().int().min(0),
  status: z.enum(deliveryStatuses).optional(),
  deliveryDate: z.string().trim().min(1),
  notes: z.string().trim().max(500).optional().nullable(),
});

const deliveryUpdateSchema = z.object({
  riderId: z.string().trim().optional().nullable(),
  status: z.enum(deliveryStatuses).optional(),
  deliveryAddress: z.string().trim().min(4).max(500).optional(),
  deliveryFee: z.number().int().min(0).optional(),
  deliveryDate: z.string().trim().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});

function canViewPos(user: AuthUser) {
  return ['Admin', 'Cashier', 'Branch Manager'].includes(user.role.name);
}

function canViewReports(user: AuthUser) {
  return ['Admin', 'Branch Manager'].includes(user.role.name);
}

function canViewCustomers(user: AuthUser) {
  return ['Admin', 'Cashier', 'Branch Manager'].includes(user.role.name);
}

function canManageCustomers(user: AuthUser) {
  return ['Admin', 'Cashier', 'Branch Manager'].includes(user.role.name);
}

function canCheckout(user: AuthUser) {
  return ['Admin', 'Cashier'].includes(user.role.name);
}

function canApproveClose(user: AuthUser) {
  return ['Admin', 'Branch Manager'].includes(user.role.name);
}

function canBroadcast(user: AuthUser) {
  return ['Admin', 'Branch Manager'].includes(user.role.name);
}

function canViewExpenses(user: AuthUser) {
  return ['Admin', 'Branch Manager'].includes(user.role.name);
}

function canManageExpenses(user: AuthUser) {
  return ['Admin', 'Branch Manager'].includes(user.role.name);
}

function canDeleteExpenses(user: AuthUser) {
  return user.role.name === 'Admin';
}

function canViewDeliveries(user: AuthUser) {
  return ['Admin', 'Branch Manager'].includes(user.role.name);
}

function canManageDeliveries(user: AuthUser) {
  return ['Admin', 'Branch Manager'].includes(user.role.name);
}

async function getPrimaryBranchId() {
  const primaryBranch = await db.select({ id: schema.branches.id })
    .from(schema.branches)
    .where(and(eq(schema.branches.name, primaryBranchName), eq(schema.branches.isActive, true)));

  if (primaryBranch.length === 0) {
    throw new Error('Evaya Naturals branch is not configured');
  }

  return primaryBranch[0].id;
}

async function resolveBranchId(user: AuthUser) {
  return user.branchId ?? await getPrimaryBranchId();
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizePhone(value: string) {
  return value.trim().replace(/\s+/g, '');
}

function toWhatsappLink(phone: string, message: string) {
  const digits = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday() {
  const date = startOfToday();
  date.setDate(date.getDate() + 1);
  return date;
}

function startOfWeek() {
  const date = startOfToday();
  date.setDate(date.getDate() - 6);
  return date;
}

function parseDateStart(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date');
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDateEnd(value: string) {
  const date = parseDateStart(value);
  date.setDate(date.getDate() + 1);
  return date;
}

function toDateKey(value: Date | string) {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createReceiptNumber() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timePart = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EVN-${datePart}-${timePart}-${suffix}`;
}

function resolveReportRange(period: 'daily' | 'weekly' | 'custom', startDate?: string, endDate?: string) {
  if (period === 'daily') {
    return {
      start: startOfToday(),
      end: endOfToday(),
      label: startOfToday().toLocaleDateString(),
      title: 'Daily Report',
    };
  }

  if (period === 'weekly') {
    return {
      start: startOfWeek(),
      end: endOfToday(),
      label: `${startOfWeek().toLocaleDateString()} to ${new Date(endOfToday().getTime() - 1000).toLocaleDateString()}`,
      title: 'Weekly Report',
    };
  }

  if (!startDate || !endDate) {
    throw new Error('Start date and end date are required for custom reports');
  }

  const start = parseDateStart(startDate);
  const end = parseDateEnd(endDate);
  return {
    start,
    end,
    label: `${start.toLocaleDateString()} to ${new Date(end.getTime() - 1000).toLocaleDateString()}`,
    title: 'Custom Report',
  };
}

async function getActiveShift(cashierId: string, branchId: string) {
  const shifts = await db.select().from(schema.shifts).where(and(
    eq(schema.shifts.cashierId, cashierId),
    eq(schema.shifts.branchId, branchId),
    eq(schema.shifts.status, 'active'),
  ));
  return shifts[0] ?? null;
}

async function getShiftSales(shiftId: string) {
  return db.select({
    id: schema.sales.id,
    subtotal: schema.sales.subtotal,
    discount: schema.sales.discount,
    total: schema.sales.total,
    paymentMethod: schema.sales.paymentMethod,
    createdAt: schema.sales.createdAt,
    receiptNumber: schema.sales.receiptNumber,
  })
    .from(schema.sales)
    .where(and(eq(schema.sales.shiftId, shiftId), eq(schema.sales.status, 'completed')))
    .orderBy(desc(schema.sales.createdAt));
}

function buildPaymentTotals(sales: Array<{ paymentMethod: string; total: number }>) {
  return sales.reduce((totals, sale) => {
    if (sale.paymentMethod === 'cash') totals.cash += sale.total;
    if (sale.paymentMethod === 'mtn_mobile_money') totals.mtnMobileMoney += sale.total;
    if (sale.paymentMethod === 'airtel_money') totals.airtelMoney += sale.total;
    if (sale.paymentMethod === 'bank_card') totals.card += sale.total;
    if (sale.paymentMethod === 'bank_transfer') totals.bankTransfer += sale.total;
    return totals;
  }, {
    cash: 0,
    mtnMobileMoney: 0,
    airtelMoney: 0,
    card: 0,
    bankTransfer: 0,
  });
}

async function buildShiftSnapshot(shiftId: string) {
  const [shift] = await db.select({
    id: schema.shifts.id,
    cashierId: schema.shifts.cashierId,
    branchId: schema.shifts.branchId,
    openingCash: schema.shifts.openingCash,
    closingCash: schema.shifts.closingCash,
    expectedCash: schema.shifts.expectedCash,
    mtnMobileMoneyTotal: schema.shifts.mtnMobileMoneyTotal,
    airtelMoneyTotal: schema.shifts.airtelMoneyTotal,
    cardTotal: schema.shifts.cardTotal,
    bankTransferTotal: schema.shifts.bankTransferTotal,
    variance: schema.shifts.variance,
    openedAt: schema.shifts.openedAt,
    closedAt: schema.shifts.closedAt,
    approvedBy: schema.shifts.approvedBy,
    approvedAt: schema.shifts.approvedAt,
    notes: schema.shifts.notes,
    status: schema.shifts.status,
    cashierName: schema.users.firstName,
    cashierLastName: schema.users.lastName,
  })
    .from(schema.shifts)
    .innerJoin(schema.users, eq(schema.shifts.cashierId, schema.users.id))
    .where(eq(schema.shifts.id, shiftId));

  if (!shift) return null;

  const sales = await getShiftSales(shiftId);
  const paymentTotals = buildPaymentTotals(sales);
  return {
    ...shift,
    cashierName: `${shift.cashierName} ${shift.cashierLastName}`.trim(),
    countedCash: shift.closingCash,
    saleCount: sales.length,
    salesTotal: sales.reduce((sum, sale) => sum + sale.total, 0),
    paymentTotals,
  };
}

async function buildSalesHistory(branchId: string, options?: { paymentMethod?: string | null; receiptSearch?: string | null }) {
  const filters = [
    eq(schema.sales.branchId, branchId),
    eq(schema.sales.status, 'completed'),
    gte(schema.sales.createdAt, startOfToday().toISOString()),
    lt(schema.sales.createdAt, endOfToday().toISOString()),
  ];

  if (options?.paymentMethod) {
    filters.push(eq(schema.sales.paymentMethod, options.paymentMethod));
  }

  if (options?.receiptSearch) {
    filters.push(like(schema.sales.receiptNumber, `%${options.receiptSearch}%`));
  }

  const sales = await db.select({
    id: schema.sales.id,
    receiptNumber: schema.sales.receiptNumber,
    total: schema.sales.total,
    paymentMethod: schema.sales.paymentMethod,
    createdAt: schema.sales.createdAt,
    cashierName: schema.users.firstName,
  })
    .from(schema.sales)
    .innerJoin(schema.users, eq(schema.sales.cashierId, schema.users.id))
    .where(and(...filters))
    .orderBy(desc(schema.sales.createdAt));

  const paymentTotals = buildPaymentTotals(sales);

  return {
    totalSales: sales.reduce((sum, sale) => sum + sale.total, 0),
    salesCount: sales.length,
    pendingCashUp: sales.length > 0,
    paymentTotals,
    sales,
  };
}

async function buildCustomerPurchaseHistory(customerId: string, branchId: string) {
  return db.select({
    id: schema.sales.id,
    receiptNumber: schema.sales.receiptNumber,
    total: schema.sales.total,
    paymentMethod: schema.sales.paymentMethod,
    createdAt: schema.sales.createdAt,
    cashierName: schema.users.firstName,
  })
    .from(schema.sales)
    .innerJoin(schema.users, eq(schema.sales.cashierId, schema.users.id))
    .where(and(
      eq(schema.sales.customerId, customerId),
      eq(schema.sales.branchId, branchId),
      eq(schema.sales.status, 'completed'),
    ))
    .orderBy(desc(schema.sales.createdAt));
}

async function buildReportSummary(branchId: string, period: 'daily' | 'weekly' | 'custom', startDate?: string, endDate?: string) {
  const settings = await getAppSettings();
  const range = resolveReportRange(period, startDate, endDate);
  const expenseStartKey = toDateKey(range.start);
  const expenseEndKey = toDateKey(range.end);
  const filters = and(
    eq(schema.sales.branchId, branchId),
    eq(schema.sales.status, 'completed'),
    gte(schema.sales.createdAt, range.start.toISOString()),
    lt(schema.sales.createdAt, range.end.toISOString()),
  );

  const sales = await db.select({
    id: schema.sales.id,
    receiptNumber: schema.sales.receiptNumber,
    total: schema.sales.total,
    subtotal: schema.sales.subtotal,
    discount: schema.sales.discount,
    paymentMethod: schema.sales.paymentMethod,
    createdAt: schema.sales.createdAt,
    cashierName: schema.users.firstName,
  })
    .from(schema.sales)
    .innerJoin(schema.users, eq(schema.sales.cashierId, schema.users.id))
    .where(filters)
    .orderBy(desc(schema.sales.createdAt));

  const paymentTotals = buildPaymentTotals(sales);
  const totalSales = sales.reduce((sum, sale) => sum + sale.total, 0);
  const totalDiscounts = sales.reduce((sum, sale) => sum + sale.discount, 0);

  const expenses = await db.select({
    id: schema.expenses.id,
    title: schema.expenses.title,
    category: schema.expenses.category,
    amount: schema.expenses.amount,
    paymentMethod: schema.expenses.paymentMethod,
    expenseDate: schema.expenses.expenseDate,
    description: schema.expenses.description,
    recordedBy: schema.expenses.recordedBy,
    recordedByName: schema.users.firstName,
  })
    .from(schema.expenses)
    .innerJoin(schema.users, eq(schema.expenses.recordedBy, schema.users.id))
    .where(and(
      eq(schema.expenses.branchId, branchId),
      gte(sql<string>`left(${schema.expenses.expenseDate}, 10)`, expenseStartKey),
      lt(sql<string>`left(${schema.expenses.expenseDate}, 10)`, expenseEndKey),
    ))
    .orderBy(desc(schema.expenses.expenseDate));

  const expensesTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  const bestSellingProducts = await db.select({
    productName: schema.products.name,
    quantity: schema.saleItems.quantity,
    revenue: schema.saleItems.total,
  })
    .from(schema.saleItems)
    .innerJoin(schema.sales, eq(schema.saleItems.saleId, schema.sales.id))
    .innerJoin(schema.products, eq(schema.saleItems.productId, schema.products.id))
    .where(filters)
    .orderBy(desc(schema.saleItems.total));

  const productMap = new Map<string, { productName: string; quantity: number; revenue: number }>();
  bestSellingProducts.forEach((row) => {
    const existing = productMap.get(row.productName) ?? { productName: row.productName, quantity: 0, revenue: 0 };
    existing.quantity += row.quantity;
    existing.revenue += row.revenue;
    productMap.set(row.productName, existing);
  });

  const inventoryRows = await db.select({
    productName: schema.products.name,
    quantity: schema.inventory.quantity,
    threshold: schema.inventory.lowStockThreshold,
  })
    .from(schema.inventory)
    .innerJoin(schema.products, eq(schema.inventory.productId, schema.products.id))
    .where(eq(schema.inventory.branchId, branchId))
    .orderBy(asc(schema.inventory.quantity));
  const inventory = inventoryRows.filter((row) => row.quantity <= row.threshold);

  const shifts = await db.select({ id: schema.shifts.id })
    .from(schema.shifts)
    .where(and(
      eq(schema.shifts.branchId, branchId),
      gte(schema.shifts.openedAt, range.start.toISOString()),
      lt(schema.shifts.openedAt, range.end.toISOString()),
    ));
  const shiftSummaries = (await Promise.all(shifts.map((shift) => buildShiftSnapshot(shift.id)))).filter((shift): shift is NonNullable<typeof shift> => Boolean(shift));

  return {
    businessName: settings.businessName,
    title: range.title,
    period,
    periodLabel: range.label,
    startDate: range.start.toISOString(),
    endDate: range.end.toISOString(),
    generatedAt: new Date().toISOString(),
    currency: settings.currency,
    totalSales,
    salesCount: sales.length,
    totalDiscounts,
    paymentTotals,
    expensesTotal,
    netAmount: totalSales - expensesTotal,
    reportFooterMessage: settings.reportFooterMessage,
    bestSellingProducts: Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5),
    lowStockSummary: {
      count: inventory.length,
      items: inventory.slice(0, 5),
    },
    shiftSummary: {
      count: shiftSummaries.length,
      varianceTotal: shiftSummaries.reduce((sum, shift) => sum + (shift?.variance ?? 0), 0),
      shifts: shiftSummaries,
    },
    expenses,
    sales,
  };
}

posRoutes.use('*', authMiddleware);

posRoutes.get('/products', async (c) => {
  const user = c.get('user');
  if (!canViewPos(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const search = c.req.query('search')?.trim();
  const productFilters = [
    eq(schema.products.isActive, true),
  ];
  if (search) {
    productFilters.push(like(schema.products.name, `%${search}%`));
  }

  const products = await db.select({
    id: schema.products.id,
    name: schema.products.name,
    sku: schema.products.sku,
    barcode: schema.products.barcode,
    categoryId: schema.products.categoryId,
    categoryName: schema.categories.name,
    unitType: schema.products.unitType,
    sellingPrice: schema.products.sellingPrice,
    lowStockThreshold: schema.products.lowStockThreshold,
    description: schema.products.description,
  })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.products.categoryId, schema.categories.id))
    .innerJoin(schema.productVisibility, eq(schema.products.id, schema.productVisibility.productId))
    .where(and(...productFilters, eq(schema.productVisibility.branchId, branchId)));

  const inventoryRows = await db.select()
    .from(schema.inventory)
    .where(eq(schema.inventory.branchId, branchId));

  const availableBatches = await db.select({
    id: schema.batches.id,
    productId: schema.batches.productId,
    quantityRemaining: schema.batches.quantityRemaining,
    expiryDate: schema.batches.expiryDate,
  })
    .from(schema.batches)
    .where(eq(schema.batches.branchId, branchId))
    .orderBy(asc(schema.batches.expiryDate), asc(schema.batches.receivedDate));

  const now = new Date();
  const data = products.map((product) => {
    const inventory = inventoryRows.find((row) => row.productId === product.id);
    const inventoryQty = inventory?.quantity ?? 0;
    const sellableBatches = availableBatches.filter((batch) => (
      batch.productId === product.id
      && batch.quantityRemaining > 0
      && new Date(batch.expiryDate) >= now
    ));
    const batchAvailable = sellableBatches.reduce((sum, batch) => sum + batch.quantityRemaining, 0);
    // If batches exist use batch availability; otherwise fall back to raw inventory qty
    const hasBatches = availableBatches.some((b) => b.productId === product.id);
    const availableQuantity = hasBatches ? batchAvailable : inventoryQty;
    return {
      ...product,
      branchId,
      availableQuantity,
      inventoryQuantity: inventoryQty,
      lowStock: availableQuantity > 0 && availableQuantity <= product.lowStockThreshold,
      isOutOfStock: availableQuantity === 0,
      nextExpiryDate: sellableBatches[0]?.expiryDate ?? null,
    };
  });

  // Return all products (including out of stock) so POS shows them with clear status
  return c.json({ products: data });
});

posRoutes.get('/customers', async (c) => {
  const user = c.get('user');
  if (!canViewCustomers(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const search = c.req.query('search')?.trim();
  const includeInactive = c.req.query('includeInactive') === 'true';
  const customerCondition = and(
    includeInactive ? undefined : eq(schema.customers.isActive, true),
    search ? or(
      like(schema.customers.name, `%${search}%`),
      like(schema.customers.phone, `%${search}%`)
    )! : undefined,
  );

  const customers = await db.select({
    id: schema.customers.id,
    name: schema.customers.name,
    phone: schema.customers.phone,
    whatsappNumber: schema.customers.whatsappNumber,
    email: schema.customers.email,
    isActive: schema.customers.isActive,
  })
    .from(schema.customers)
    .where(customerCondition)
    .orderBy(asc(schema.customers.name));

  return c.json({ customers });
});

posRoutes.post('/customers', async (c) => {
  const user = c.get('user');
  if (!canManageCustomers(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const payload = quickCustomerSchema.parse(await c.req.json());
  const [created] = await db.insert(schema.customers).values({
    name: payload.name,
    phone: normalizePhone(payload.phone),
    whatsappNumber: normalizeText(payload.whatsappNumber),
    email: normalizeText(payload.email),
    isActive: payload.isActive ?? true,
    updatedAt: new Date().toISOString(),
  }).returning();

  await db.insert(schema.auditLogs).values({
    userId: user.id,
    action: 'create_customer',
    entityType: 'customer',
    entityId: created.id,
    newValue: { name: created.name, phone: created.phone },
  });

  return c.json({ customer: created }, 201);
});

posRoutes.patch('/customers/:id', async (c) => {
  const user = c.get('user');
  if (!canManageCustomers(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const customerId = c.req.param('id');
  const payload = customerUpdateSchema.parse(await c.req.json());
  const existing = await db.select().from(schema.customers).where(eq(schema.customers.id, customerId));
  if (existing.length === 0) {
    return c.json({ error: 'Customer not found' }, 404);
  }

  const updates = {
    name: payload.name?.trim() || existing[0].name,
    phone: payload.phone ? normalizePhone(payload.phone) : existing[0].phone,
    whatsappNumber: payload.whatsappNumber !== undefined ? normalizeText(payload.whatsappNumber) : existing[0].whatsappNumber,
    email: payload.email !== undefined ? normalizeText(payload.email) : existing[0].email,
    isActive: payload.isActive ?? existing[0].isActive,
    updatedAt: new Date().toISOString(),
  };

  const [updated] = await db.update(schema.customers)
    .set(updates)
    .where(eq(schema.customers.id, customerId))
    .returning();

  await db.insert(schema.auditLogs).values({
    userId: user.id,
    action: 'update_customer',
    entityType: 'customer',
    entityId: updated.id,
    oldValue: existing[0] as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
  });

  return c.json({ customer: updated });
});

posRoutes.delete('/customers/:id', async (c) => {
  const user = c.get('user');
  if (!canManageCustomers(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const customerId = c.req.param('id');
  const [existing] = await db.select().from(schema.customers).where(eq(schema.customers.id, customerId));
  if (!existing) {
    return c.json({ error: 'Customer not found' }, 404);
  }

  await db.update(schema.customers)
    .set({ isActive: false, updatedAt: new Date().toISOString() })
    .where(eq(schema.customers.id, customerId));
  return c.json({ message: 'Customer deleted' });
});

posRoutes.get('/customers/:id/history', async (c) => {
  const user = c.get('user');
  if (!canViewCustomers(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const customerId = c.req.param('id');
  const [customer] = await db.select({
    id: schema.customers.id,
    name: schema.customers.name,
    phone: schema.customers.phone,
    whatsappNumber: schema.customers.whatsappNumber,
    email: schema.customers.email,
    isActive: schema.customers.isActive,
  }).from(schema.customers).where(eq(schema.customers.id, customerId));

  if (!customer) {
    return c.json({ error: 'Customer not found' }, 404);
  }

  const sales = await buildCustomerPurchaseHistory(customerId, branchId);
  return c.json({
    customer,
    sales,
    totalSpent: sales.reduce((sum, sale) => sum + sale.total, 0),
  });
});

posRoutes.post('/customers/broadcasts', async (c) => {
  const user = c.get('user');
  if (!canBroadcast(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const payload = broadcastSchema.parse(await c.req.json());
  const customers = await db.select({
    id: schema.customers.id,
    name: schema.customers.name,
    phone: schema.customers.phone,
    whatsappNumber: schema.customers.whatsappNumber,
    isActive: schema.customers.isActive,
  })
    .from(schema.customers)
    .where(inArray(schema.customers.id, payload.customerIds));

  const activeCustomers = customers.filter((customer) => customer.isActive);
  if (activeCustomers.length === 0) {
    return c.json({ error: 'No active customers selected' }, 400);
  }

  const nowIso = new Date().toISOString();
  if (payload.channel === 'whatsapp') {
    const recipients = activeCustomers
      .flatMap((customer) => (
        customer.whatsappNumber
          ? [{
              id: customer.id,
              name: customer.name,
              phone: customer.whatsappNumber,
            }]
          : []
      ));

    if (recipients.length === 0) {
      return c.json({ error: 'Selected customers do not have WhatsApp numbers' }, 400);
    }

    const links = recipients.map((customer) => ({
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      url: toWhatsappLink(customer.phone, payload.messageBody),
    }));

    const missingWhatsappCount = activeCustomers.length - recipients.length;

    const [broadcast] = await db.insert(schema.broadcasts).values({
      channel: 'whatsapp',
      messageBody: payload.messageBody,
      createdBy: user.id,
      recipientCount: links.length,
      status: 'prepared',
      metadata: { customerIds: links.map((link) => link.customerId) },
      updatedAt: nowIso,
    }).returning();

    return c.json({
      broadcast,
      statusLabel: missingWhatsappCount > 0
        ? `Prepared WhatsApp links. ${missingWhatsappCount} selected customers do not have WhatsApp numbers.`
        : 'Prepared WhatsApp links',
      links,
    }, 201);
  }

  const smsConfigured = Boolean(process.env.SMS_PROVIDER_URL && process.env.SMS_PROVIDER_TOKEN);
  const status = smsConfigured ? 'sent' : 'provider_not_configured';
  const [broadcast] = await db.insert(schema.broadcasts).values({
    channel: 'sms',
    messageBody: payload.messageBody,
    createdBy: user.id,
    recipientCount: activeCustomers.length,
    status,
    metadata: { customerIds: activeCustomers.map((customer) => customer.id) },
    updatedAt: nowIso,
  }).returning();

  return c.json({
    broadcast,
    message: smsConfigured ? 'SMS broadcast sent' : 'SMS provider not configured',
  }, 201);
});

posRoutes.get('/shift/current', async (c) => {
  const user = c.get('user');
  if (!canViewPos(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const activeShift = await getActiveShift(user.id, branchId);
  if (!activeShift) {
    return c.json({ shift: null });
  }

  const shift = await buildShiftSnapshot(activeShift.id);
  return c.json({ shift });
});

posRoutes.post('/shift/open', async (c) => {
  const user = c.get('user');
  if (!canCheckout(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const existing = await getActiveShift(user.id, branchId);
  if (existing) {
    return c.json({ error: 'You already have an active shift' }, 409);
  }

  const payload = shiftOpenSchema.parse(await c.req.json());
  const [shift] = await db.insert(schema.shifts).values({
    cashierId: user.id,
    branchId,
    openingCash: payload.openingCash,
    updatedAt: new Date().toISOString(),
  }).returning();

  await db.insert(schema.auditLogs).values({
    userId: user.id,
    action: 'open_shift',
    entityType: 'shift',
    entityId: shift.id,
    newValue: { openingCash: payload.openingCash },
  });

  const snapshot = await buildShiftSnapshot(shift.id);
  return c.json({ shift: snapshot }, 201);
});

posRoutes.post('/shift/close', async (c) => {
  const user = c.get('user');
  if (!canCheckout(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const activeShift = await getActiveShift(user.id, branchId);
  if (!activeShift) {
    return c.json({ error: 'Open a shift before closing it' }, 409);
  }

  const payload = shiftCloseSchema.parse(await c.req.json());
  const sales = await getShiftSales(activeShift.id);
  const paymentTotals = buildPaymentTotals(sales);
  const expectedCash = activeShift.openingCash + paymentTotals.cash;
  const variance = payload.countedCash - expectedCash;
  const closedAt = new Date().toISOString();
  const closeDate = closedAt.slice(0, 10);

  const [updatedShift] = await db.update(schema.shifts)
    .set({
      closingCash: payload.countedCash,
      expectedCash,
      mtnMobileMoneyTotal: paymentTotals.mtnMobileMoney,
      airtelMoneyTotal: paymentTotals.airtelMoney,
      cardTotal: paymentTotals.card,
      bankTransferTotal: paymentTotals.bankTransfer,
      variance,
      notes: normalizeText(payload.notes),
      closedAt,
      status: 'closed',
      updatedAt: closedAt,
    })
    .where(eq(schema.shifts.id, activeShift.id))
    .returning();

  const existingClose = await db.select().from(schema.dailyCloses).where(eq(schema.dailyCloses.shiftId, activeShift.id));
  const dailyClosePayload = {
    branchId,
    cashierId: user.id,
    shiftId: activeShift.id,
    closeDate,
    cashExpected: expectedCash,
    cashCounted: payload.countedCash,
    mtnMobileMoney: paymentTotals.mtnMobileMoney,
    airtelMobileMoney: paymentTotals.airtelMoney,
    cardPayments: paymentTotals.card,
    bankTransfers: paymentTotals.bankTransfer,
    difference: variance,
    notes: normalizeText(payload.notes),
    status: variance === 0 ? 'pending' : 'discrepant',
    updatedAt: closedAt,
  };

  if (existingClose.length === 0) {
    await db.insert(schema.dailyCloses).values(dailyClosePayload);
  } else {
    await db.update(schema.dailyCloses)
      .set(dailyClosePayload)
      .where(eq(schema.dailyCloses.id, existingClose[0].id));
  }

  await db.insert(schema.auditLogs).values({
    userId: user.id,
    action: 'close_shift',
    entityType: 'shift',
    entityId: activeShift.id,
    newValue: {
      expectedCash,
      countedCash: payload.countedCash,
      variance,
    },
  });

  const snapshot = await buildShiftSnapshot(updatedShift.id);
  return c.json({ shift: snapshot });
});

posRoutes.post('/shift/:id/approve', async (c) => {
  const user = c.get('user');
  if (!canApproveClose(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const shiftId = c.req.param('id');
  const existing = await db.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId));
  if (existing.length === 0) {
    return c.json({ error: 'Shift not found' }, 404);
  }

  if (existing[0].status === 'active') {
    return c.json({ error: 'Close the shift before approval' }, 409);
  }

  const approvedAt = new Date().toISOString();
  await db.update(schema.shifts)
    .set({
      status: 'approved',
      approvedBy: user.id,
      approvedAt,
      updatedAt: approvedAt,
    })
    .where(eq(schema.shifts.id, shiftId));

  const closeRecord = await db.select().from(schema.dailyCloses).where(eq(schema.dailyCloses.shiftId, shiftId));
  if (closeRecord.length > 0) {
    await db.update(schema.dailyCloses)
      .set({
        status: 'approved',
        approvedBy: user.id,
        approvedAt,
        updatedAt: approvedAt,
      })
      .where(eq(schema.dailyCloses.id, closeRecord[0].id));
  }

  await db.insert(schema.auditLogs).values({
    userId: user.id,
    action: 'approve_shift_close',
    entityType: 'shift',
    entityId: shiftId,
  });

  const snapshot = await buildShiftSnapshot(shiftId);
  return c.json({ shift: snapshot });
});

posRoutes.get('/sales/today', async (c) => {
  const user = c.get('user');
  if (!canViewPos(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const paymentMethod = c.req.query('paymentMethod')?.trim() || null;
  const receiptSearch = c.req.query('receiptSearch')?.trim() || null;
  const summary = await buildSalesHistory(branchId, { paymentMethod, receiptSearch });
  return c.json(summary);
});

posRoutes.get('/reports/today', async (c) => {
  const user = c.get('user');
  if (!canViewReports(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const report = await buildReportSummary(branchId, 'daily');
  return c.json({
    todaySales: report.totalSales,
    paymentTotals: report.paymentTotals,
    salesCount: report.salesCount,
    expensesTotal: report.expensesTotal,
    netAmount: report.netAmount,
    varianceSummary: report.shiftSummary.varianceTotal,
    lowStockSummary: report.lowStockSummary,
    bestSellingProducts: report.bestSellingProducts,
    shifts: report.shiftSummary.shifts,
  });
});

posRoutes.get('/reports/summary', async (c) => {
  const user = c.get('user');
  if (!canViewReports(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const query = reportQuerySchema.parse({
    period: c.req.query('period') ?? 'daily',
    startDate: c.req.query('startDate'),
    endDate: c.req.query('endDate'),
  });
  const branchId = await resolveBranchId(user);
  const report = await buildReportSummary(branchId, query.period, query.startDate, query.endDate);
  return c.json(report);
});

posRoutes.get('/reports/pdf', async (c) => {
  const user = c.get('user');
  if (!canViewReports(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const query = reportQuerySchema.parse({
    period: c.req.query('period') ?? 'daily',
    startDate: c.req.query('startDate'),
    endDate: c.req.query('endDate'),
  });
  const branchId = await resolveBranchId(user);
  const report = await buildReportSummary(branchId, query.period, query.startDate, query.endDate);
  const pdf = generateReportPdf({
    businessName: report.businessName,
    title: `${report.title} - ${report.businessName}`,
    periodLabel: report.periodLabel,
    generatedAt: new Date(report.generatedAt).toLocaleString(),
    totalSales: report.totalSales,
    salesCount: report.salesCount,
    totalDiscounts: report.totalDiscounts,
    expensesTotal: report.expensesTotal,
    netAmount: report.netAmount,
    paymentTotals: report.paymentTotals,
    bestSellingProducts: report.bestSellingProducts,
    lowStockItems: report.lowStockSummary.items,
    shifts: report.shiftSummary.shifts,
    footerMessage: report.reportFooterMessage,
  });
  const filenameDate = new Date(report.generatedAt).toISOString().slice(0, 10);
  c.header('Content-Type', 'application/pdf');
  c.header('Content-Disposition', `attachment; filename="evaya-report-${filenameDate}.pdf"`);
  return c.body(pdf);
});

posRoutes.get('/expenses', async (c) => {
  const user = c.get('user');
  if (!canViewExpenses(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const dateFilter = startDate && endDate
    ? and(
        eq(schema.expenses.branchId, branchId),
        gte(sql<string>`left(${schema.expenses.expenseDate}, 10)`, toDateKey(parseDateStart(startDate))),
        lt(sql<string>`left(${schema.expenses.expenseDate}, 10)`, toDateKey(parseDateEnd(endDate))),
      )
    : eq(schema.expenses.branchId, branchId);

  const expenses = await db.select({
    id: schema.expenses.id,
    title: schema.expenses.title,
    category: schema.expenses.category,
    amount: schema.expenses.amount,
    paymentMethod: schema.expenses.paymentMethod,
    expenseDate: schema.expenses.expenseDate,
    description: schema.expenses.description,
    recordedBy: schema.expenses.recordedBy,
    recordedByName: schema.users.firstName,
  })
    .from(schema.expenses)
    .innerJoin(schema.users, eq(schema.expenses.recordedBy, schema.users.id))
    .where(dateFilter)
    .orderBy(desc(schema.expenses.expenseDate));

  return c.json({ expenses, categories: expenseCategories });
});

posRoutes.post('/expenses', async (c) => {
  const user = c.get('user');
  if (!canManageExpenses(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const payload = expenseSchema.parse(await c.req.json());
  const [expense] = await db.insert(schema.expenses).values({
    branchId,
    title: payload.title,
    category: payload.category,
    amount: payload.amount,
    paymentMethod: payload.paymentMethod,
    expenseDate: toDateKey(parseDateStart(payload.expenseDate)),
    description: normalizeText(payload.description),
    recordedBy: user.id,
    updatedAt: new Date().toISOString(),
  }).returning();

  return c.json({ expense }, 201);
});

posRoutes.patch('/expenses/:id', async (c) => {
  const user = c.get('user');
  if (!canManageExpenses(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const expenseId = c.req.param('id');
  const payload = expenseSchema.partial().parse(await c.req.json());
  const [existing] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, expenseId));
  if (!existing || existing.branchId !== branchId) {
    return c.json({ error: 'Expense not found' }, 404);
  }

  const [expense] = await db.update(schema.expenses)
    .set({
      title: payload.title ?? existing.title,
      category: payload.category ?? existing.category,
      amount: payload.amount ?? existing.amount,
      paymentMethod: payload.paymentMethod ?? existing.paymentMethod,
      expenseDate: payload.expenseDate ? toDateKey(parseDateStart(payload.expenseDate)) : existing.expenseDate,
      description: payload.description !== undefined ? normalizeText(payload.description) : existing.description,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.expenses.id, expenseId))
    .returning();

  return c.json({ expense });
});

posRoutes.delete('/expenses/:id', async (c) => {
  const user = c.get('user');
  if (!canDeleteExpenses(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const expenseId = c.req.param('id');
  const [existing] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, expenseId));
  if (!existing || existing.branchId !== branchId) {
    return c.json({ error: 'Expense not found' }, 404);
  }

  await db.delete(schema.expenses).where(eq(schema.expenses.id, expenseId));
  return c.json({ message: 'Expense deleted' });
});

posRoutes.get('/deliveries/support', async (c) => {
  const user = c.get('user');
  if (!canViewDeliveries(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const customers = await db.select({
    id: schema.customers.id,
    name: schema.customers.name,
    phone: schema.customers.phone,
  }).from(schema.customers).where(eq(schema.customers.isActive, true));

  return c.json({ riders: [], customers, statuses: deliveryStatuses });
});

posRoutes.get('/deliveries', async (c) => {
  const user = c.get('user');
  if (!canViewDeliveries(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const status = c.req.query('status')?.trim();
  const deliveries = await db.select({
    id: schema.deliveries.id,
    customerId: schema.deliveries.customerId,
    customerName: schema.deliveries.customerName,
    customerPhone: schema.deliveries.customerPhone,
    saleId: schema.deliveries.saleId,
    receiptReference: schema.deliveries.receiptReference,
    deliveryAddress: schema.deliveries.deliveryAddress,
    riderId: schema.deliveries.riderId,
    riderName: schema.users.firstName,
    riderLastName: schema.users.lastName,
    deliveryFee: schema.deliveries.deliveryFee,
    status: schema.deliveries.status,
    deliveryDate: schema.deliveries.deliveryDate,
    notes: schema.deliveries.notes,
    createdAt: schema.deliveries.createdAt,
  })
    .from(schema.deliveries)
    .leftJoin(schema.users, eq(schema.deliveries.riderId, schema.users.id))
    .where(and(
      eq(schema.deliveries.branchId, branchId),
      status ? eq(schema.deliveries.status, status) : undefined,
    ))
    .orderBy(desc(schema.deliveries.createdAt));

  return c.json({
    deliveries: deliveries.map((delivery) => ({
      ...delivery,
      riderName: delivery.riderName ? `${delivery.riderName} ${delivery.riderLastName ?? ''}`.trim() : null,
    })),
  });
});

posRoutes.post('/deliveries', async (c) => {
  const user = c.get('user');
  if (!canManageDeliveries(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const payload = deliverySchema.parse(await c.req.json());
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, payload.customerId));
  if (!customer || !customer.isActive) {
    return c.json({ error: 'Customer not found' }, 404);
  }

  const rider = payload.riderId
    ? await db.select().from(schema.users).where(eq(schema.users.id, payload.riderId))
    : [];
  if (payload.riderId && rider.length === 0) {
    return c.json({ error: 'Rider not found' }, 404);
  }

  const [delivery] = await db.insert(schema.deliveries).values({
    saleId: normalizeText(payload.saleId),
    receiptReference: normalizeText(payload.receiptReference),
    customerId: customer.id,
    branchId,
    riderId: normalizeText(payload.riderId),
    customerName: customer.name,
    customerPhone: customer.phone,
    deliveryAddress: payload.deliveryAddress,
    deliveryFee: payload.deliveryFee,
    status: payload.status ?? (payload.riderId ? 'assigned' : 'pending'),
    deliveryDate: parseDateStart(payload.deliveryDate).toISOString(),
    assignedAt: payload.riderId ? new Date().toISOString() : null,
    notes: normalizeText(payload.notes),
    updatedAt: new Date().toISOString(),
  }).returning();

  return c.json({ delivery }, 201);
});

posRoutes.patch('/deliveries/:id', requirePermission('update_delivery_status'), async (c) => {
  const user = c.get('user');
  if (!canViewDeliveries(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const deliveryId = c.req.param('id') as string;
  const payload = deliveryUpdateSchema.parse(await c.req.json());
  const [existing] = await db.select().from(schema.deliveries).where(eq(schema.deliveries.id, deliveryId));
  if (!existing || existing.branchId !== branchId) {
    return c.json({ error: 'Delivery not found' }, 404);
  }
  if (!canManageDeliveries(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const nowIso = new Date().toISOString();
  const nextStatus = payload.status ?? existing.status;
  const [delivery] = await db.update(schema.deliveries)
    .set({
      riderId: payload.riderId !== undefined ? normalizeText(payload.riderId) : existing.riderId,
      status: nextStatus,
      deliveryAddress: payload.deliveryAddress ?? existing.deliveryAddress,
      deliveryFee: payload.deliveryFee ?? existing.deliveryFee,
      deliveryDate: payload.deliveryDate ? parseDateStart(payload.deliveryDate).toISOString() : existing.deliveryDate,
      notes: payload.notes !== undefined ? normalizeText(payload.notes) : existing.notes,
      assignedAt: payload.riderId !== undefined && payload.riderId ? nowIso : existing.assignedAt,
      pickedUpAt: nextStatus === 'picked_up' ? nowIso : existing.pickedUpAt,
      deliveredAt: nextStatus === 'delivered' ? nowIso : existing.deliveredAt,
      updatedAt: nowIso,
    })
    .where(eq(schema.deliveries.id, deliveryId))
    .returning();

  return c.json({ delivery });
});

posRoutes.get('/receipts', async (c) => {
  const user = c.get('user');
  if (!canViewPos(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const search = c.req.query('search')?.trim() || null;
  const startDate = c.req.query('startDate') || null;
  const endDate = c.req.query('endDate') || null;
  const shiftId = c.req.query('shiftId') || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: any[] = [eq(schema.sales.branchId, branchId), eq(schema.sales.status, 'completed')];
  if (search) {
    filters.push(
      or(
        like(schema.sales.receiptNumber, `%${search}%`),
        like(schema.customers.name, `%${search}%`),
      )!,
    );
  }
  if (shiftId) {
    filters.push(eq(schema.sales.shiftId, shiftId));
  }
  if (startDate) {
    filters.push(gte(sql<string>`left(${schema.sales.createdAt}, 10)`, toDateKey(parseDateStart(startDate))));
  }
  if (endDate) {
    filters.push(lt(sql<string>`left(${schema.sales.createdAt}, 10)`, toDateKey(parseDateEnd(endDate))));
  }

  const rows = await db.select({
    id: schema.sales.id,
    receiptNumber: schema.sales.receiptNumber,
    branchId: schema.sales.branchId,
    cashierId: schema.sales.cashierId,
    customerId: schema.sales.customerId,
    subtotal: schema.sales.subtotal,
    discount: schema.sales.discount,
    total: schema.sales.total,
    paymentMethod: schema.sales.paymentMethod,
    paymentReference: schema.sales.paymentReference,
    notes: schema.sales.notes,
    createdAt: schema.sales.createdAt,
    cashierFirstName: schema.users.firstName,
    cashierLastName: schema.users.lastName,
    customerName: schema.customers.name,
    customerPhone: schema.customers.phone,
  })
    .from(schema.sales)
    .innerJoin(schema.users, eq(schema.sales.cashierId, schema.users.id))
    .leftJoin(schema.customers, eq(schema.sales.customerId, schema.customers.id))
    .where(and(...filters))
    .orderBy(desc(schema.sales.createdAt))
    .limit(200);

  const settings = await getAppSettings();
  const receipts = rows.map((r) => ({
    ...r,
    businessName: settings.businessName,
    branchName: primaryBranchName,
    cashierName: `${r.cashierFirstName} ${r.cashierLastName}`.trim(),
    customerName: r.customerName ?? null,
    customerPhone: r.customerPhone ?? null,
    receiptFooterMessage: settings.receiptFooterMessage,
    items: [] as unknown[],
  }));

  return c.json({ receipts });
});

posRoutes.get('/receipts/:id', async (c) => {
  const user = c.get('user');
  if (!canViewPos(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const receiptId = c.req.param('id');
  const sales = await db.select({
    id: schema.sales.id,
    receiptNumber: schema.sales.receiptNumber,
    branchId: schema.sales.branchId,
    cashierId: schema.sales.cashierId,
    customerId: schema.sales.customerId,
    subtotal: schema.sales.subtotal,
    discount: schema.sales.discount,
    total: schema.sales.total,
    paymentMethod: schema.sales.paymentMethod,
    paymentReference: schema.sales.paymentReference,
    notes: schema.sales.notes,
    createdAt: schema.sales.createdAt,
    cashierName: schema.users.firstName,
    cashierLastName: schema.users.lastName,
    customerName: schema.customers.name,
    customerPhone: schema.customers.phone,
  })
    .from(schema.sales)
    .innerJoin(schema.users, eq(schema.sales.cashierId, schema.users.id))
    .leftJoin(schema.customers, eq(schema.sales.customerId, schema.customers.id))
    .where(and(
      eq(schema.sales.branchId, branchId),
      or(eq(schema.sales.id, receiptId), eq(schema.sales.receiptNumber, receiptId))!,
    ));

  if (sales.length === 0) {
    return c.json({ error: 'Receipt not found' }, 404);
  }

  const sale = sales[0];
  const settings = await getAppSettings();
  const items = await db.select({
    id: schema.saleItems.id,
    quantity: schema.saleItems.quantity,
    unitPrice: schema.saleItems.unitPrice,
    discount: schema.saleItems.discount,
    total: schema.saleItems.total,
    batchId: schema.saleItems.batchId,
    batchNumber: schema.batches.batchNumber,
    productId: schema.products.id,
    productName: schema.products.name,
  })
    .from(schema.saleItems)
    .innerJoin(schema.products, eq(schema.saleItems.productId, schema.products.id))
    .innerJoin(schema.batches, eq(schema.saleItems.batchId, schema.batches.id))
    .where(eq(schema.saleItems.saleId, sale.id));

  return c.json({
    receipt: {
      ...sale,
      businessName: settings.businessName,
      branchName: primaryBranchName,
      receiptFooterMessage: settings.receiptFooterMessage,
      cashierName: `${sale.cashierName} ${sale.cashierLastName}`.trim(),
      customerName: sale.customerName ?? null,
      customerPhone: sale.customerPhone ?? null,
      items,
    },
  });
});

posRoutes.post('/sales', async (c) => {
  const user = c.get('user');
  if (!canCheckout(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const parsedPayload = salePayloadSchema.safeParse(await c.req.json());
  if (!parsedPayload.success) {
    const itemError = parsedPayload.error.issues.find((issue) => issue.path[0] === 'items');
    if (itemError) {
      return c.json({ error: 'Add at least one item before completing sale' }, 400);
    }

    return c.json({ error: 'Sale details are invalid' }, 400);
  }

  const payload = parsedPayload.data;
  const settings = await getAppSettings();
  if (!settings.paymentMethods[payload.paymentMethod as keyof typeof settings.paymentMethods]) {
    return c.json({ error: 'That payment method is disabled in settings' }, 409);
  }
  const activeShift = await getActiveShift(user.id, branchId);
  if (!activeShift) {
    return c.json({ error: 'Open a shift before checkout' }, 409);
  }

  let customerId = payload.customerId ?? null;
  if (customerId) {
    const customer = await db.select().from(schema.customers).where(eq(schema.customers.id, customerId));
    if (customer.length === 0 || !customer[0].isActive) {
      return c.json({ error: 'Customer not found' }, 404);
    }
  } else if (payload.quickCustomer) {
    const [createdCustomer] = await db.insert(schema.customers).values({
      name: payload.quickCustomer.name,
      phone: normalizePhone(payload.quickCustomer.phone),
      whatsappNumber: normalizeText(payload.quickCustomer.whatsappNumber),
      email: normalizeText(payload.quickCustomer.email),
      isActive: true,
      updatedAt: new Date().toISOString(),
    }).returning();
    customerId = createdCustomer.id;
  }

  const requestedProductIds = [...new Set(payload.items.map((item) => item.productId))];
  const products = await db.select()
    .from(schema.products)
    .where(inArray(schema.products.id, requestedProductIds));

  if (products.length !== requestedProductIds.length) {
    return c.json({ error: 'One or more products were not found' }, 404);
  }

  const visibility = await db.select()
    .from(schema.productVisibility)
    .where(eq(schema.productVisibility.branchId, branchId));
  const visibleProductIds = new Set(visibility.map((row) => row.productId));

  const batches = await db.select()
    .from(schema.batches)
    .where(eq(schema.batches.branchId, branchId))
    .orderBy(asc(schema.batches.expiryDate), asc(schema.batches.receivedDate));

  const inventoryRows = await db.select()
    .from(schema.inventory)
    .where(eq(schema.inventory.branchId, branchId));

  const now = new Date();
  const nowIso = now.toISOString();
  const receiptNumber = createReceiptNumber();
  const productMap = new Map(products.map((product) => [product.id, product]));
  const inventoryMap = new Map(inventoryRows.map((row) => [row.productId, row]));

  let lineAllocations: Array<{
    item: { productId: string; quantity: number };
    product: typeof products[number];
    allocations: Array<{ batchId: string; quantity: number }>;
    inventory: typeof inventoryRows[number] | undefined;
    lineTotal: number;
  }>;

  try {
    lineAllocations = payload.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product || !product.isActive || !visibleProductIds.has(item.productId)) {
        throw new Error('Selected product is not available for sale');
      }

      const productBatches = batches.filter((batch) => batch.productId === item.productId);
      const sellableBatches = productBatches.filter((batch) => batch.quantityRemaining > 0 && new Date(batch.expiryDate) >= now);
      const expiredAvailable = productBatches.some((batch) => batch.quantityRemaining > 0 && new Date(batch.expiryDate) < now);
      const hasBatches = productBatches.length > 0;
      const batchAvailable = sellableBatches.reduce((sum, batch) => sum + batch.quantityRemaining, 0);
      const inventoryRow = inventoryMap.get(item.productId);
      const inventoryQty = inventoryRow?.quantity ?? 0;
      // Mirror POS display logic exactly: batches win if they exist, else use inventory.quantity
      const availableQuantity = hasBatches ? batchAvailable : inventoryQty;

      // Log for diagnostics
      console.log(`[SALE STOCK CHECK] product=${item.productId} name="${product.name}" requested=${item.quantity} available=${availableQuantity} hasBatches=${hasBatches} batchAvailable=${batchAvailable} inventoryQty=${inventoryQty} branchId=${branchId}`);

      if (availableQuantity <= 0 && expiredAvailable) {
        throw new Error(`${product.name} only has expired stock`);
      }

      if (availableQuantity < item.quantity) {
        console.error(`[SALE STOCK FAIL] product=${item.productId} name="${product.name}" requested=${item.quantity} available=${availableQuantity} hasBatches=${hasBatches} batchAvailable=${batchAvailable} inventoryQty=${inventoryQty} branchId=${branchId}`);
        throw new Error(`Insufficient stock for ${product.name}`);
      }

      const allocations: Array<{ batchId: string; quantity: number }> = [];
      if (hasBatches) {
        // FIFO allocation from sellable batches
        let remaining = item.quantity;
        for (const batch of sellableBatches) {
          if (remaining === 0) break;
          const take = Math.min(batch.quantityRemaining, remaining);
          allocations.push({ batchId: batch.id, quantity: take });
          remaining -= take;
        }
        if (remaining > 0) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }
      }
      // No batches: inventory.quantity is the sole source; no batch allocation needed.
      // The transaction below will reduce inventory.quantity directly.

      return {
        item,
        product,
        allocations,
        inventory: inventoryRow,
        lineTotal: product.sellingPrice * item.quantity,
      };
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Sale validation failed' }, 409);
  }

  const subtotal = lineAllocations.reduce((sum, line) => sum + line.lineTotal, 0);
  const total = subtotal - payload.discount;
  if (total < 0) {
    return c.json({ error: 'Discount cannot exceed subtotal' }, 400);
  }

  let result;
  try {
    result = await db.transaction(async (tx) => {
      const saleRows = await tx.insert(schema.sales).values({
        receiptNumber,
        branchId,
        cashierId: user.id,
        shiftId: activeShift.id,
        customerId,
        subtotal,
        discount: payload.discount,
        total,
        paymentMethod: payload.paymentMethod,
        paymentReference: normalizeText(payload.paymentReference),
        notes: normalizeText(payload.notes),
        status: 'completed',
        updatedAt: nowIso,
      }).returning();
      const sale = saleRows[0];

      for (const line of lineAllocations) {
        await applyInventoryDelta(tx, line.product.id, branchId, -line.item.quantity, line.product.lowStockThreshold, nowIso);

        if (line.allocations.length > 0) {
          for (const allocation of line.allocations) {
            const batch = batches.find((row) => row.id === allocation.batchId);
            if (!batch) {
              throw new Error('Batch allocation failed');
            }

            const updatedBatch = await tx.update(schema.batches)
              .set({
                quantityRemaining: sql`${schema.batches.quantityRemaining} - ${allocation.quantity}`,
                isExpired: sql`CASE WHEN ${schema.batches.expiryDate} < ${nowIso} THEN true ELSE false END`,
                updatedAt: nowIso,
              })
              .where(and(
                eq(schema.batches.id, batch.id),
                sql`${schema.batches.quantityRemaining} - ${allocation.quantity} >= 0`,
              ))
              .returning();
            if (updatedBatch.length === 0) {
              throw new Error(`Inventory record is out of sync for ${line.product.name}`);
            }

            await tx.insert(schema.saleItems).values({
              saleId: sale.id,
              productId: line.product.id,
              batchId: batch.id,
              quantity: allocation.quantity,
              unitPrice: line.product.sellingPrice,
              discount: 0,
              total: allocation.quantity * line.product.sellingPrice,
            });

            await tx.insert(schema.inventoryMovements).values({
              productId: line.product.id,
              branchId,
              batchId: batch.id,
              movementType: 'sale',
              quantity: -allocation.quantity,
              referenceId: sale.id,
              referenceType: 'sale',
              reason: `Sale ${receiptNumber}`,
              userId: user.id,
            });
          }
        } else {
          await tx.insert(schema.saleItems).values({
            saleId: sale.id,
            productId: line.product.id,
            batchId: null,
            quantity: line.item.quantity,
            unitPrice: line.product.sellingPrice,
            discount: 0,
            total: line.item.quantity * line.product.sellingPrice,
          });

          await tx.insert(schema.inventoryMovements).values({
            productId: line.product.id,
            branchId,
            batchId: null,
            movementType: 'sale',
            quantity: -line.item.quantity,
            referenceId: sale.id,
            referenceType: 'sale',
            reason: `Sale ${receiptNumber}`,
            userId: user.id,
          });
        }
      }

      await tx.insert(schema.auditLogs).values({
        userId: user.id,
        action: 'checkout_sale',
        entityType: 'sale',
        entityId: sale.id,
        newValue: {
          receiptNumber,
          total,
          itemCount: payload.items.length,
        },
      });

      return sale;
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Sale failed' }, 409);
  }

  const receiptResponse = await db.select({
    id: schema.sales.id,
    receiptNumber: schema.sales.receiptNumber,
    subtotal: schema.sales.subtotal,
    discount: schema.sales.discount,
    total: schema.sales.total,
    paymentMethod: schema.sales.paymentMethod,
    createdAt: schema.sales.createdAt,
  })
    .from(schema.sales)
    .where(eq(schema.sales.id, result.id));

  return c.json({
    sale: receiptResponse[0],
    receiptNumber,
  }, 201);
});

export default posRoutes;
