import { Hono } from 'hono';
import { and, eq, inArray, like, or } from 'drizzle-orm';
import { z } from 'zod';
import { authMiddleware, requirePermission, type AuthUser } from '../middleware/auth';
import { db } from '../db';
import * as schema from '../db/schema';

const catalogRoutes = new Hono();
const primaryBranchName = 'Evaya Naturals';

const unitTypes = ['piece', 'kg', 'g', 'ml', 'l', 'box', 'jar', 'pack'] as const;
const categoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().nullable(),
});

const categoryUpdateSchema = categoryCreateSchema.extend({
  isActive: z.boolean().optional(),
});

const productSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().max(80).optional().nullable(),
  barcode: z.string().trim().max(80).optional().nullable(),
  categoryId: z.string().trim().min(1),
  unitType: z.enum(unitTypes),
  sellingPrice: z.number().nonnegative(),
  costPrice: z.number().nonnegative().optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  usageInstructions: z.string().trim().max(2000).optional().nullable(),
  ingredients: z.string().trim().max(2000).optional().nullable(),
  allergyWarning: z.string().trim().max(1000).optional().nullable(),
  lowStockThreshold: z.number().int().min(0).max(100000),
  isActive: z.boolean().optional(),
  visibilityBranchIds: z.array(z.string().trim().min(1)).min(1),
});

const batchCreateSchema = z.object({
  productId: z.string().trim().min(1),
  branchId: z.string().trim().min(1),
  supplierId: z.string().trim().min(1).optional().nullable(),
  batchNumber: z.string().trim().min(1).max(120),
  expiryDate: z.string().trim().min(1),
  quantityReceived: z.number().int().positive(),
  costPrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative().optional().nullable(),
  receivedDate: z.string().trim().optional().nullable(),
});

const inventoryAdjustmentSchema = z.object({
  productId: z.string().trim().min(1),
  branchId: z.string().trim().min(1),
  batchId: z.string().trim().min(1).optional().nullable(),
  movementType: z.enum(['adjustment', 'damaged', 'expired', 'returned']),
  quantityDelta: z.number().int().refine((value) => value !== 0, 'Quantity delta cannot be zero'),
  reason: z.string().trim().min(2).max(500),
});

const thresholdSchema = z.object({
  lowStockThreshold: z.number().int().min(0).max(100000),
});

function canManageCategories(user: AuthUser) {
  return user.role.name === 'Admin';
}

function canManageProducts(user: AuthUser) {
  return user.role.name === 'Admin' || user.role.name === 'Branch Manager';
}

function canManageInventory(user: AuthUser) {
  return ['Admin', 'Branch Manager', 'Inventory Officer'].includes(user.role.name);
}

function canReadInventory(user: AuthUser) {
  return canManageInventory(user) || user.role.name === 'Cashier';
}

function sanitizeOptionalText(value?: string | null) {
  const sanitized = value?.trim();
  return sanitized ? sanitized : null;
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

async function roleScopedBranchId(user: AuthUser, branchId?: string | null) {
  if (user.role.name === 'Admin') {
    return branchId ?? user.branchId ?? await getPrimaryBranchId();
  }

  if (!user.branchId) {
    throw new Error('This user is not assigned to a branch');
  }

  if (branchId && branchId !== user.branchId) {
    throw new Error('Access denied to this branch');
  }

  return user.branchId;
}

async function logAudit(user: AuthUser, action: string, entityType: string, entityId: string | null, oldValue?: Record<string, unknown>, newValue?: Record<string, unknown>) {
  await db.insert(schema.auditLogs).values({
    userId: user.id,
    action,
    entityType,
    entityId,
    oldValue,
    newValue,
  });
}

async function upsertInventoryRecord(productId: string, branchId: string, quantityDelta: number, lowStockThreshold: number) {
  const existing = await db.select().from(schema.inventory).where(
    and(eq(schema.inventory.productId, productId), eq(schema.inventory.branchId, branchId))
  );

  if (existing.length === 0) {
    const created = {
      productId,
      branchId,
      quantity: quantityDelta,
      lowStockThreshold,
      updatedAt: new Date().toISOString(),
    };
    await db.insert(schema.inventory).values(created);
    return created.quantity;
  }

  const nextQuantity = existing[0].quantity + quantityDelta;
  if (nextQuantity < 0) {
    throw new Error('Insufficient stock for this adjustment');
  }

  await db.update(schema.inventory)
    .set({
      quantity: nextQuantity,
      lowStockThreshold: existing[0].lowStockThreshold || lowStockThreshold,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.inventory.id, existing[0].id));

  return nextQuantity;
}

async function ensureVisibility(productId: string, branchIds: string[]) {
  const existing = await db.select().from(schema.productVisibility).where(eq(schema.productVisibility.productId, productId));
  const existingBranchIds = new Set(existing.map((row) => row.branchId));
  const nextBranchIds = Array.from(new Set(branchIds));

  for (const branchId of nextBranchIds) {
    if (!existingBranchIds.has(branchId)) {
      await db.insert(schema.productVisibility).values({ productId, branchId });
    }
  }

  for (const row of existing) {
    if (!nextBranchIds.includes(row.branchId)) {
      await db.delete(schema.productVisibility).where(eq(schema.productVisibility.id, row.id));
    }
  }
}

async function assertCategoryExists(categoryId: string) {
  const category = await db.select().from(schema.categories).where(eq(schema.categories.id, categoryId));
  if (category.length === 0) {
    throw new Error('Category not found');
  }
}

async function assertBranchesExist(branchIds: string[]) {
  const branches = await db.select().from(schema.branches).where(inArray(schema.branches.id, branchIds));
  if (branches.length !== branchIds.length) {
    throw new Error('One or more branches were not found');
  }
}

catalogRoutes.use('*', authMiddleware);

catalogRoutes.get('/branches', async (c) => {
  const user = c.get('user');
  const branches = user.role.name === 'Admin'
    ? await db.select().from(schema.branches).where(eq(schema.branches.isActive, true))
    : await db.select().from(schema.branches).where(
        and(eq(schema.branches.isActive, true), eq(schema.branches.id, user.branchId ?? ''))
      );

  return c.json({ branches });
});

catalogRoutes.get('/suppliers', requirePermission('manage_inventory'), async (c) => {
  const suppliers = await db.select().from(schema.suppliers).where(eq(schema.suppliers.isActive, true));
  return c.json({ suppliers });
});

catalogRoutes.get('/categories', async (c) => {
  const includeInactive = c.req.query('includeInactive') === 'true';
  const categories = includeInactive
    ? await db.select().from(schema.categories)
    : await db.select().from(schema.categories).where(eq(schema.categories.isActive, true));

  return c.json({ categories });
});

catalogRoutes.post('/categories', async (c) => {
  const user = c.get('user');
  if (!canManageCategories(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const payload = categoryCreateSchema.parse(await c.req.json());
  const existing = await db.select().from(schema.categories).where(eq(schema.categories.name, payload.name));
  if (existing.length > 0) {
    return c.json({ error: 'Category name already exists' }, 409);
  }

  const category = {
    name: payload.name,
    description: sanitizeOptionalText(payload.description),
    isActive: true,
    updatedAt: new Date().toISOString(),
  };

  const [created] = await db.insert(schema.categories).values(category).returning();
  await logAudit(user, 'create', 'category', created.id, undefined, created as unknown as Record<string, unknown>);
  return c.json({ category: created }, 201);
});

catalogRoutes.patch('/categories/:id', async (c) => {
  const user = c.get('user');
  if (!canManageCategories(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const categoryId = c.req.param('id');
  const payload = categoryUpdateSchema.parse(await c.req.json());
  const existing = await db.select().from(schema.categories).where(eq(schema.categories.id, categoryId));

  if (existing.length === 0) {
    return c.json({ error: 'Category not found' }, 404);
  }

  const duplicate = payload.name
    ? await db.select().from(schema.categories).where(eq(schema.categories.name, payload.name))
    : [];
  if (duplicate.length > 0 && duplicate[0].id !== categoryId) {
    return c.json({ error: 'Category name already exists' }, 409);
  }

  const updateData = {
    name: payload.name,
    description: sanitizeOptionalText(payload.description),
    isActive: payload.isActive ?? existing[0].isActive,
    updatedAt: new Date().toISOString(),
  };

  const [updated] = await db.update(schema.categories)
    .set(updateData)
    .where(eq(schema.categories.id, categoryId))
    .returning();

  await logAudit(
    user,
    'update',
    'category',
    categoryId,
    existing[0] as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
  );

  return c.json({ category: updated });
});

catalogRoutes.delete('/categories/:id', async (c) => {
  const user = c.get('user');
  if (!canManageCategories(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const categoryId = c.req.param('id');
  const existing = await db.select().from(schema.categories).where(eq(schema.categories.id, categoryId));
  if (existing.length === 0) {
    return c.json({ error: 'Category not found' }, 404);
  }

  const linkedProducts = await db.select().from(schema.products).where(eq(schema.products.categoryId, categoryId));
  if (linkedProducts.length > 0) {
    return c.json({ error: 'Category cannot be deleted while products still use it' }, 409);
  }

  await db.delete(schema.categories).where(eq(schema.categories.id, categoryId));
  await logAudit(user, 'delete', 'category', categoryId, existing[0] as unknown as Record<string, unknown>);
  return c.json({ message: 'Category deleted' });
});

catalogRoutes.get('/products', async (c) => {
  const user = c.get('user');
  const search = c.req.query('search')?.trim();
  const includeInactive = c.req.query('includeInactive') === 'true';
  let branchId: string | null = null;

  try {
    branchId = await roleScopedBranchId(user, c.req.query('branchId'));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Access denied' }, 403);
  }

  const filters = [];
  if (!includeInactive) {
    filters.push(eq(schema.products.isActive, true));
  }
  if (search) {
    filters.push(or(
      like(schema.products.name, `%${search}%`),
      like(schema.products.sku, `%${search}%`),
      like(schema.products.barcode, `%${search}%`)
    )!);
  }

  const products = filters.length > 0
    ? await db.select({
        id: schema.products.id,
        name: schema.products.name,
        sku: schema.products.sku,
        barcode: schema.products.barcode,
        categoryId: schema.products.categoryId,
        unitType: schema.products.unitType,
        sellingPrice: schema.products.sellingPrice,
        costPrice: schema.products.costPrice,
        description: schema.products.description,
        usageInstructions: schema.products.usageInstructions,
        ingredients: schema.products.ingredients,
        allergyWarning: schema.products.allergyWarning,
        lowStockThreshold: schema.products.lowStockThreshold,
        isActive: schema.products.isActive,
        createdAt: schema.products.createdAt,
        updatedAt: schema.products.updatedAt,
        categoryName: schema.categories.name,
      })
      .from(schema.products)
      .innerJoin(schema.categories, eq(schema.products.categoryId, schema.categories.id))
      .where(and(...filters))
    : await db.select({
        id: schema.products.id,
        name: schema.products.name,
        sku: schema.products.sku,
        barcode: schema.products.barcode,
        categoryId: schema.products.categoryId,
        unitType: schema.products.unitType,
        sellingPrice: schema.products.sellingPrice,
        costPrice: schema.products.costPrice,
        description: schema.products.description,
        usageInstructions: schema.products.usageInstructions,
        ingredients: schema.products.ingredients,
        allergyWarning: schema.products.allergyWarning,
        lowStockThreshold: schema.products.lowStockThreshold,
        isActive: schema.products.isActive,
        createdAt: schema.products.createdAt,
        updatedAt: schema.products.updatedAt,
        categoryName: schema.categories.name,
      })
      .from(schema.products)
      .innerJoin(schema.categories, eq(schema.products.categoryId, schema.categories.id));

  const productIds = products.map((product) => product.id);
  const visibility = productIds.length > 0
    ? await db.select({
        productId: schema.productVisibility.productId,
        branchId: schema.productVisibility.branchId,
        branchName: schema.branches.name,
      })
      .from(schema.productVisibility)
      .innerJoin(schema.branches, eq(schema.productVisibility.branchId, schema.branches.id))
      .where(inArray(schema.productVisibility.productId, productIds))
    : [];

  const filteredProducts = products
    .map((product) => {
      const visibleBranches = visibility.filter((row) => row.productId === product.id);
      return { ...product, visibleBranches };
    })
    .filter((product) => {
      if (!branchId) return true;
      return product.visibleBranches.some((row) => row.branchId === branchId);
    });

  return c.json({ products: filteredProducts });
});

catalogRoutes.post('/products', async (c) => {
  const user = c.get('user');
  if (!canManageProducts(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const payload = productSchema.parse(await c.req.json());
  const visibilityBranchIds = user.role.name === 'Admin'
    ? Array.from(new Set(payload.visibilityBranchIds))
    : [user.branchId!];

  await assertCategoryExists(payload.categoryId);
  await assertBranchesExist(visibilityBranchIds);

  if (payload.sku) {
    const skuConflict = await db.select().from(schema.products).where(eq(schema.products.sku, payload.sku));
    if (skuConflict.length > 0) {
      return c.json({ error: 'SKU already exists' }, 409);
    }
  }

  if (payload.barcode) {
    const barcodeConflict = await db.select().from(schema.products).where(eq(schema.products.barcode, payload.barcode));
    if (barcodeConflict.length > 0) {
      return c.json({ error: 'Barcode already exists' }, 409);
    }
  }

  const productData = {
    name: payload.name,
    sku: sanitizeOptionalText(payload.sku),
    barcode: sanitizeOptionalText(payload.barcode),
    categoryId: payload.categoryId,
    unitType: payload.unitType,
    sellingPrice: payload.sellingPrice,
    costPrice: payload.costPrice ?? null,
    description: sanitizeOptionalText(payload.description),
    usageInstructions: sanitizeOptionalText(payload.usageInstructions),
    ingredients: sanitizeOptionalText(payload.ingredients),
    allergyWarning: sanitizeOptionalText(payload.allergyWarning),
    lowStockThreshold: payload.lowStockThreshold,
    isActive: payload.isActive ?? true,
    updatedAt: new Date().toISOString(),
  };

  const [created] = await db.insert(schema.products).values(productData).returning();
  await ensureVisibility(created.id, visibilityBranchIds);
  await logAudit(user, 'create', 'product', created.id, undefined, created as unknown as Record<string, unknown>);
  return c.json({ product: created }, 201);
});

catalogRoutes.patch('/products/:id', async (c) => {
  const user = c.get('user');
  if (!canManageProducts(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const productId = c.req.param('id');
  const payload = productSchema.partial().parse(await c.req.json());
  const existing = await db.select().from(schema.products).where(eq(schema.products.id, productId));
  if (existing.length === 0) {
    return c.json({ error: 'Product not found' }, 404);
  }

  const currentVisibility = await db.select().from(schema.productVisibility).where(eq(schema.productVisibility.productId, productId));
  if (user.role.name !== 'Admin' && !currentVisibility.some((row) => row.branchId === user.branchId)) {
    return c.json({ error: 'Access denied to this product' }, 403);
  }

  if (payload.categoryId) {
    await assertCategoryExists(payload.categoryId);
  }

  if (payload.sku) {
    const skuConflict = await db.select().from(schema.products).where(eq(schema.products.sku, payload.sku));
    if (skuConflict.length > 0 && skuConflict[0].id !== productId) {
      return c.json({ error: 'SKU already exists' }, 409);
    }
  }

  if (payload.barcode) {
    const barcodeConflict = await db.select().from(schema.products).where(eq(schema.products.barcode, payload.barcode));
    if (barcodeConflict.length > 0 && barcodeConflict[0].id !== productId) {
      return c.json({ error: 'Barcode already exists' }, 409);
    }
  }

  const nextVisibility = payload.visibilityBranchIds
    ? (user.role.name === 'Admin' ? Array.from(new Set(payload.visibilityBranchIds)) : [user.branchId!])
    : currentVisibility.map((row) => row.branchId);

  await assertBranchesExist(nextVisibility);

  const updateData = {
    name: payload.name ?? existing[0].name,
    sku: payload.sku === undefined ? existing[0].sku : sanitizeOptionalText(payload.sku),
    barcode: payload.barcode === undefined ? existing[0].barcode : sanitizeOptionalText(payload.barcode),
    categoryId: payload.categoryId ?? existing[0].categoryId,
    unitType: payload.unitType ?? existing[0].unitType,
    sellingPrice: payload.sellingPrice ?? existing[0].sellingPrice,
    costPrice: payload.costPrice === undefined ? existing[0].costPrice : payload.costPrice,
    description: payload.description === undefined ? existing[0].description : sanitizeOptionalText(payload.description),
    usageInstructions: payload.usageInstructions === undefined ? existing[0].usageInstructions : sanitizeOptionalText(payload.usageInstructions),
    ingredients: payload.ingredients === undefined ? existing[0].ingredients : sanitizeOptionalText(payload.ingredients),
    allergyWarning: payload.allergyWarning === undefined ? existing[0].allergyWarning : sanitizeOptionalText(payload.allergyWarning),
    lowStockThreshold: payload.lowStockThreshold ?? existing[0].lowStockThreshold,
    isActive: payload.isActive ?? existing[0].isActive,
    updatedAt: new Date().toISOString(),
  };

  const [updated] = await db.update(schema.products)
    .set(updateData)
    .where(eq(schema.products.id, productId))
    .returning();

  await ensureVisibility(productId, nextVisibility);
  await logAudit(user, 'update', 'product', productId, existing[0] as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>);
  return c.json({ product: updated });
});

catalogRoutes.get('/inventory', async (c) => {
  const user = c.get('user');
  if (!canReadInventory(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const search = c.req.query('search')?.trim();
  const status = c.req.query('status');
  let branchId: string | null;

  try {
    branchId = await roleScopedBranchId(user, c.req.query('branchId'));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Access denied' }, 403);
  }

  const filters = [];
  if (branchId) {
    filters.push(eq(schema.inventory.branchId, branchId));
  }
  if (search) {
    filters.push(or(
      like(schema.products.name, `%${search}%`),
      like(schema.products.sku, `%${search}%`),
      like(schema.products.barcode, `%${search}%`)
    )!);
  }

  const inventoryRows = filters.length > 0
    ? await db.select({
        id: schema.inventory.id,
        productId: schema.inventory.productId,
        branchId: schema.inventory.branchId,
        quantity: schema.inventory.quantity,
        lowStockThreshold: schema.inventory.lowStockThreshold,
        updatedAt: schema.inventory.updatedAt,
        productName: schema.products.name,
        sku: schema.products.sku,
        barcode: schema.products.barcode,
        unitType: schema.products.unitType,
        productLowStockThreshold: schema.products.lowStockThreshold,
        productIsActive: schema.products.isActive,
        categoryName: schema.categories.name,
        branchName: schema.branches.name,
      })
      .from(schema.inventory)
      .innerJoin(schema.products, eq(schema.inventory.productId, schema.products.id))
      .innerJoin(schema.categories, eq(schema.products.categoryId, schema.categories.id))
      .innerJoin(schema.branches, eq(schema.inventory.branchId, schema.branches.id))
      .where(and(...filters))
    : await db.select({
        id: schema.inventory.id,
        productId: schema.inventory.productId,
        branchId: schema.inventory.branchId,
        quantity: schema.inventory.quantity,
        lowStockThreshold: schema.inventory.lowStockThreshold,
        updatedAt: schema.inventory.updatedAt,
        productName: schema.products.name,
        sku: schema.products.sku,
        barcode: schema.products.barcode,
        unitType: schema.products.unitType,
        productLowStockThreshold: schema.products.lowStockThreshold,
        productIsActive: schema.products.isActive,
        categoryName: schema.categories.name,
        branchName: schema.branches.name,
      })
      .from(schema.inventory)
      .innerJoin(schema.products, eq(schema.inventory.productId, schema.products.id))
      .innerJoin(schema.categories, eq(schema.products.categoryId, schema.categories.id))
      .innerJoin(schema.branches, eq(schema.inventory.branchId, schema.branches.id));

  const batchFilters = [];
  if (branchId) {
    batchFilters.push(eq(schema.batches.branchId, branchId));
  }
  const batches = batchFilters.length > 0
    ? await db.select().from(schema.batches).where(and(...batchFilters))
    : await db.select().from(schema.batches);

  const now = new Date();
  const soon = new Date();
  soon.setDate(now.getDate() + 30);

  const rows = inventoryRows
    .map((row) => {
      const rowBatches = batches.filter((batch) => batch.productId === row.productId && batch.branchId === row.branchId);
      const expiringSoon = rowBatches.filter((batch) => {
        const expiry = new Date(batch.expiryDate);
        return batch.quantityRemaining > 0 && expiry >= now && expiry <= soon;
      });
      const expired = rowBatches.filter((batch) => {
        const expiry = new Date(batch.expiryDate);
        return batch.quantityRemaining > 0 && expiry < now;
      });

      return {
        ...row,
        lowStock: row.quantity <= row.lowStockThreshold,
        expiringSoonCount: expiringSoon.length,
        expiredCount: expired.length,
        batches: rowBatches,
      };
    })
    .filter((row) => {
      if (!status || status === 'all') return true;
      if (status === 'low') return row.lowStock;
      if (status === 'expiring') return row.expiringSoonCount > 0;
      if (status === 'expired') return row.expiredCount > 0;
      return true;
    });

  return c.json({ inventory: rows });
});

catalogRoutes.get('/inventory/batches', async (c) => {
  const user = c.get('user');
  if (!canReadInventory(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  let branchId: string | null;
  try {
    branchId = await roleScopedBranchId(user, c.req.query('branchId'));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Access denied' }, 403);
  }

  const productId = c.req.query('productId');
  const filters = [];
  if (branchId) filters.push(eq(schema.batches.branchId, branchId));
  if (productId) filters.push(eq(schema.batches.productId, productId));

  const batches = filters.length > 0
    ? await db.select({
        id: schema.batches.id,
        batchNumber: schema.batches.batchNumber,
        productId: schema.batches.productId,
        supplierId: schema.batches.supplierId,
        branchId: schema.batches.branchId,
        expiryDate: schema.batches.expiryDate,
        quantityReceived: schema.batches.quantityReceived,
        quantityRemaining: schema.batches.quantityRemaining,
        costPrice: schema.batches.costPrice,
        sellingPrice: schema.batches.sellingPrice,
        receivedDate: schema.batches.receivedDate,
        isExpired: schema.batches.isExpired,
        productName: schema.products.name,
        branchName: schema.branches.name,
        supplierName: schema.suppliers.name,
      })
      .from(schema.batches)
      .innerJoin(schema.products, eq(schema.batches.productId, schema.products.id))
      .innerJoin(schema.branches, eq(schema.batches.branchId, schema.branches.id))
      .leftJoin(schema.suppliers, eq(schema.batches.supplierId, schema.suppliers.id))
      .where(and(...filters))
    : await db.select({
        id: schema.batches.id,
        batchNumber: schema.batches.batchNumber,
        productId: schema.batches.productId,
        supplierId: schema.batches.supplierId,
        branchId: schema.batches.branchId,
        expiryDate: schema.batches.expiryDate,
        quantityReceived: schema.batches.quantityReceived,
        quantityRemaining: schema.batches.quantityRemaining,
        costPrice: schema.batches.costPrice,
        sellingPrice: schema.batches.sellingPrice,
        receivedDate: schema.batches.receivedDate,
        isExpired: schema.batches.isExpired,
        productName: schema.products.name,
        branchName: schema.branches.name,
        supplierName: schema.suppliers.name,
      })
      .from(schema.batches)
      .innerJoin(schema.products, eq(schema.batches.productId, schema.products.id))
      .innerJoin(schema.branches, eq(schema.batches.branchId, schema.branches.id))
      .leftJoin(schema.suppliers, eq(schema.batches.supplierId, schema.suppliers.id));

  return c.json({ batches });
});

catalogRoutes.get('/inventory/movements', async (c) => {
  const user = c.get('user');
  if (!canReadInventory(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  let branchId: string | null;
  try {
    branchId = await roleScopedBranchId(user, c.req.query('branchId'));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Access denied' }, 403);
  }

  const productId = c.req.query('productId');
  const filters = [];
  if (branchId) filters.push(eq(schema.inventoryMovements.branchId, branchId));
  if (productId) filters.push(eq(schema.inventoryMovements.productId, productId));

  const movements = filters.length > 0
    ? await db.select({
        id: schema.inventoryMovements.id,
        productId: schema.inventoryMovements.productId,
        branchId: schema.inventoryMovements.branchId,
        batchId: schema.inventoryMovements.batchId,
        movementType: schema.inventoryMovements.movementType,
        quantity: schema.inventoryMovements.quantity,
        referenceId: schema.inventoryMovements.referenceId,
        referenceType: schema.inventoryMovements.referenceType,
        reason: schema.inventoryMovements.reason,
        userId: schema.inventoryMovements.userId,
        createdAt: schema.inventoryMovements.createdAt,
        productName: schema.products.name,
        branchName: schema.branches.name,
        batchNumber: schema.batches.batchNumber,
        actorName: schema.users.firstName,
      })
      .from(schema.inventoryMovements)
      .innerJoin(schema.products, eq(schema.inventoryMovements.productId, schema.products.id))
      .innerJoin(schema.branches, eq(schema.inventoryMovements.branchId, schema.branches.id))
      .innerJoin(schema.users, eq(schema.inventoryMovements.userId, schema.users.id))
      .leftJoin(schema.batches, eq(schema.inventoryMovements.batchId, schema.batches.id))
      .where(and(...filters))
    : await db.select({
        id: schema.inventoryMovements.id,
        productId: schema.inventoryMovements.productId,
        branchId: schema.inventoryMovements.branchId,
        batchId: schema.inventoryMovements.batchId,
        movementType: schema.inventoryMovements.movementType,
        quantity: schema.inventoryMovements.quantity,
        referenceId: schema.inventoryMovements.referenceId,
        referenceType: schema.inventoryMovements.referenceType,
        reason: schema.inventoryMovements.reason,
        userId: schema.inventoryMovements.userId,
        createdAt: schema.inventoryMovements.createdAt,
        productName: schema.products.name,
        branchName: schema.branches.name,
        batchNumber: schema.batches.batchNumber,
        actorName: schema.users.firstName,
      })
      .from(schema.inventoryMovements)
      .innerJoin(schema.products, eq(schema.inventoryMovements.productId, schema.products.id))
      .innerJoin(schema.branches, eq(schema.inventoryMovements.branchId, schema.branches.id))
      .innerJoin(schema.users, eq(schema.inventoryMovements.userId, schema.users.id))
      .leftJoin(schema.batches, eq(schema.inventoryMovements.batchId, schema.batches.id));

  return c.json({ movements });
});

catalogRoutes.post('/inventory/batches', async (c) => {
  const user = c.get('user');
  if (!canManageInventory(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const payload = batchCreateSchema.parse(await c.req.json());
  let branchId: string;
  try {
    branchId = await roleScopedBranchId(user, payload.branchId) ?? payload.branchId;
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Access denied' }, 403);
  }

  const product = await db.select().from(schema.products).where(eq(schema.products.id, payload.productId));
  if (product.length === 0) {
    return c.json({ error: 'Product not found' }, 404);
  }

  if (payload.supplierId) {
    const supplier = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, payload.supplierId));
    if (supplier.length === 0) {
      return c.json({ error: 'Supplier not found' }, 404);
    }
  }

  const batchData = {
    productId: payload.productId,
    branchId,
    supplierId: payload.supplierId ?? null,
    batchNumber: payload.batchNumber,
    expiryDate: payload.expiryDate,
    quantityReceived: payload.quantityReceived,
    quantityRemaining: payload.quantityReceived,
    costPrice: payload.costPrice,
    sellingPrice: payload.sellingPrice ?? product[0].sellingPrice,
    receivedDate: payload.receivedDate ?? new Date().toISOString(),
    isExpired: new Date(payload.expiryDate) < new Date(),
    updatedAt: new Date().toISOString(),
  };

  const [batch] = await db.insert(schema.batches).values(batchData).returning();
  await ensureVisibility(payload.productId, [branchId]);
  await upsertInventoryRecord(payload.productId, branchId, payload.quantityReceived, product[0].lowStockThreshold);
  await db.insert(schema.inventoryMovements).values({
    productId: payload.productId,
    branchId,
    batchId: batch.id,
    movementType: 'stock_received',
    quantity: payload.quantityReceived,
    referenceType: 'batch',
    referenceId: batch.id,
    reason: `Batch ${payload.batchNumber} received`,
    userId: user.id,
  });
  await logAudit(user, 'stock_received', 'inventory_batch', batch.id, undefined, batch as unknown as Record<string, unknown>);
  return c.json({ batch }, 201);
});

catalogRoutes.post('/inventory/adjustments', async (c) => {
  const user = c.get('user');
  if (!canManageInventory(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const payload = inventoryAdjustmentSchema.parse(await c.req.json());
  let branchId: string;
  try {
    branchId = await roleScopedBranchId(user, payload.branchId) ?? payload.branchId;
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Access denied' }, 403);
  }

  const product = await db.select().from(schema.products).where(eq(schema.products.id, payload.productId));
  if (product.length === 0) {
    return c.json({ error: 'Product not found' }, 404);
  }

  if (payload.batchId) {
    const batch = await db.select().from(schema.batches).where(eq(schema.batches.id, payload.batchId));
    if (batch.length === 0 || batch[0].branchId !== branchId || batch[0].productId !== payload.productId) {
      return c.json({ error: 'Batch not found for this product and branch' }, 404);
    }

    const nextRemaining = batch[0].quantityRemaining + payload.quantityDelta;
    if (nextRemaining < 0) {
      return c.json({ error: 'Insufficient batch quantity for this adjustment' }, 409);
    }

    await db.update(schema.batches)
      .set({
        quantityRemaining: nextRemaining,
        isExpired: new Date(batch[0].expiryDate) < new Date(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.batches.id, payload.batchId));
  }

  try {
    await upsertInventoryRecord(payload.productId, branchId, payload.quantityDelta, product[0].lowStockThreshold);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Inventory adjustment failed' }, 409);
  }

  const [movement] = await db.insert(schema.inventoryMovements).values({
    productId: payload.productId,
    branchId,
    batchId: payload.batchId ?? null,
    movementType: payload.movementType,
    quantity: payload.quantityDelta,
    referenceType: 'adjustment',
    reason: payload.reason,
    userId: user.id,
  }).returning();

  await logAudit(user, 'inventory_adjustment', 'inventory_movement', movement.id, undefined, movement as unknown as Record<string, unknown>);
  return c.json({ movement }, 201);
});

catalogRoutes.patch('/inventory/:id/threshold', async (c) => {
  const user = c.get('user');
  if (!canManageInventory(user)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const inventoryId = c.req.param('id');
  const payload = thresholdSchema.parse(await c.req.json());
  const existing = await db.select().from(schema.inventory).where(eq(schema.inventory.id, inventoryId));
  if (existing.length === 0) {
    return c.json({ error: 'Inventory record not found' }, 404);
  }

  try {
    await roleScopedBranchId(user, existing[0].branchId);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Access denied' }, 403);
  }

  const [updated] = await db.update(schema.inventory)
    .set({ lowStockThreshold: payload.lowStockThreshold, updatedAt: new Date().toISOString() })
    .where(eq(schema.inventory.id, inventoryId))
    .returning();

  await logAudit(user, 'update_threshold', 'inventory', inventoryId, existing[0] as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>);
  return c.json({ inventory: updated });
});

export default catalogRoutes;
