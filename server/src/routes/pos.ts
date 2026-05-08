import { Hono } from 'hono';
import { and, asc, desc, eq, gte, inArray, like, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { authMiddleware, type AuthUser } from '../middleware/auth';
import { db } from '../db';
import * as schema from '../db/schema';

const posRoutes = new Hono();
const primaryBranchName = 'Evaya Naturals';
const paymentMethods = ['cash', 'mtn_mobile_money', 'airtel_money', 'bank_card', 'bank_transfer'] as const;

const salePayloadSchema = z.object({
  customerId: z.string().trim().min(1).optional().nullable(),
  discount: z.number().min(0).default(0),
  paymentMethod: z.enum(paymentMethods),
  paymentReference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z.array(z.object({
    productId: z.string().trim().min(1),
    quantity: z.number().int().positive(),
  })).min(1),
});

const shiftOpenSchema = z.object({
  openingCash: z.number().int().min(0),
});

const shiftCloseSchema = z.object({
  countedCash: z.number().int().min(0),
  notes: z.string().trim().max(500).optional().nullable(),
});

function canViewPos(user: AuthUser) {
  return ['Admin', 'Cashier', 'Branch Manager', 'Accountant'].includes(user.role.name);
}

function canCheckout(user: AuthUser) {
  return ['Admin', 'Cashier'].includes(user.role.name);
}

function canApproveClose(user: AuthUser) {
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

function createReceiptNumber() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timePart = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `EVN-${datePart}-${timePart}`;
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

async function buildTodaySummary(branchId: string) {
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
    .where(and(
      eq(schema.sales.branchId, branchId),
      eq(schema.sales.status, 'completed'),
      gte(schema.sales.createdAt, startOfToday().toISOString()),
      lt(schema.sales.createdAt, endOfToday().toISOString()),
    ))
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

posRoutes.use('*', authMiddleware);

posRoutes.get('/products', async (c) => {
  const user = c.get('user');
  if (!canViewPos(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const search = c.req.query('search')?.trim();
  const productFilters = [eq(schema.products.isActive, true)];
  if (search) {
    productFilters.push(or(
      like(schema.products.name, `%${search}%`),
      like(schema.products.sku, `%${search}%`),
      like(schema.products.barcode, `%${search}%`)
    )!);
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
    const sellableBatches = availableBatches.filter((batch) => (
      batch.productId === product.id
      && batch.quantityRemaining > 0
      && new Date(batch.expiryDate) >= now
    ));
    const inventory = inventoryRows.find((row) => row.productId === product.id);
    const availableQuantity = sellableBatches.reduce((sum, batch) => sum + batch.quantityRemaining, 0);
    return {
      ...product,
      branchId,
      availableQuantity,
      inventoryQuantity: inventory?.quantity ?? 0,
      lowStock: availableQuantity <= product.lowStockThreshold,
      nextExpiryDate: sellableBatches[0]?.expiryDate ?? null,
    };
  }).filter((product) => product.availableQuantity > 0);

  return c.json({ products: data });
});

posRoutes.get('/customers', async (c) => {
  const user = c.get('user');
  if (!canViewPos(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const customers = await db.select({
    id: schema.customers.id,
    name: schema.customers.name,
    phone: schema.customers.phone,
    email: schema.customers.email,
  })
    .from(schema.customers)
    .where(eq(schema.customers.isActive, true))
    .orderBy(asc(schema.customers.name));

  return c.json({ customers });
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
  const summary = await buildTodaySummary(branchId);
  return c.json(summary);
});

posRoutes.get('/reports/today', async (c) => {
  const user = c.get('user');
  if (!canViewPos(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const branchId = await resolveBranchId(user);
  const todaySummary = await buildTodaySummary(branchId);
  const shifts = await db.select().from(schema.shifts).where(and(
    eq(schema.shifts.branchId, branchId),
    gte(schema.shifts.openedAt, startOfToday().toISOString()),
    lt(schema.shifts.openedAt, endOfToday().toISOString()),
  ));

  const shiftSummaries = await Promise.all(shifts.map((shift) => buildShiftSnapshot(shift.id)));
  return c.json({
    todaySales: todaySummary.totalSales,
    paymentTotals: todaySummary.paymentTotals,
    salesCount: todaySummary.salesCount,
    varianceSummary: shiftSummaries.reduce((sum, shift) => sum + (shift?.variance ?? 0), 0),
    shifts: shiftSummaries.filter(Boolean),
  });
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
      branchName: primaryBranchName,
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
  const payload = salePayloadSchema.parse(await c.req.json());
  const activeShift = await getActiveShift(user.id, branchId);
  if (!activeShift) {
    return c.json({ error: 'Open a shift before checkout' }, 409);
  }

  if (payload.customerId) {
    const customer = await db.select().from(schema.customers).where(eq(schema.customers.id, payload.customerId));
    if (customer.length === 0 || !customer[0].isActive) {
      return c.json({ error: 'Customer not found' }, 404);
    }
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
      const availableQuantity = sellableBatches.reduce((sum, batch) => sum + batch.quantityRemaining, 0);

      if (availableQuantity <= 0 && expiredAvailable) {
        throw new Error(`${product.name} only has expired stock`);
      }

      if (availableQuantity < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }

      const allocations: Array<{ batchId: string; quantity: number }> = [];
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

      return {
        item,
        product,
        allocations,
        inventory: inventoryMap.get(item.productId),
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

  const result = db.transaction((tx) => {
    const saleRows = tx.insert(schema.sales).values({
      receiptNumber,
      branchId,
      cashierId: user.id,
      shiftId: activeShift.id,
      customerId: payload.customerId ?? null,
      subtotal,
      discount: payload.discount,
      total,
      paymentMethod: payload.paymentMethod,
      paymentReference: normalizeText(payload.paymentReference),
      notes: normalizeText(payload.notes),
      status: 'completed',
      updatedAt: nowIso,
    }).returning().all();
    const sale = saleRows[0];

    for (const line of lineAllocations) {
      const inventory = line.inventory;
      if (!inventory || inventory.quantity < line.item.quantity) {
        throw new Error(`Inventory record is out of sync for ${line.product.name}`);
      }

      tx.update(schema.inventory)
        .set({
          quantity: inventory.quantity - line.item.quantity,
          updatedAt: nowIso,
        })
        .where(eq(schema.inventory.id, inventory.id))
        .run();

      for (const allocation of line.allocations) {
        const batch = batches.find((row) => row.id === allocation.batchId);
        if (!batch) {
          throw new Error('Batch allocation failed');
        }

        tx.update(schema.batches)
          .set({
            quantityRemaining: batch.quantityRemaining - allocation.quantity,
            isExpired: new Date(batch.expiryDate) < now,
            updatedAt: nowIso,
          })
          .where(eq(schema.batches.id, batch.id))
          .run();

        tx.insert(schema.saleItems).values({
          saleId: sale.id,
          productId: line.product.id,
          batchId: batch.id,
          quantity: allocation.quantity,
          unitPrice: line.product.sellingPrice,
          discount: 0,
          total: allocation.quantity * line.product.sellingPrice,
        }).run();

        tx.insert(schema.inventoryMovements).values({
          productId: line.product.id,
          branchId,
          batchId: batch.id,
          movementType: 'sale',
          quantity: -allocation.quantity,
          referenceId: sale.id,
          referenceType: 'sale',
          reason: `Sale ${receiptNumber}`,
          userId: user.id,
        }).run();

        batch.quantityRemaining -= allocation.quantity;
      }
    }

    tx.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'checkout_sale',
      entityType: 'sale',
      entityId: sale.id,
      newValue: {
        receiptNumber,
        total,
        itemCount: payload.items.length,
      },
    }).run();

    return sale;
  });

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
