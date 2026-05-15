import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import app from './index';
import { db } from './db';
import { initializeDatabase } from './db/init';
import * as schema from './db/schema';
import { and, eq } from 'drizzle-orm';

async function json(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

async function login(email: string, password: string) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  expect(response.status).toBe(200);
  const payload = await json(response);
  return payload.token as string;
}

async function createUser(roleName: string, email: string, branchId: string | null) {
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.name, roleName));
  expect(role).toBeDefined();
  const passwordHash = await bcrypt.hash('secret123', 10);
  const [user] = await db.insert(schema.users).values({
    email,
    passwordHash,
    firstName: roleName.replace(/\s+/g, ''),
    lastName: 'Tester',
    phone: '+256700000111',
    roleId: role.id,
    branchId,
    isActive: true,
  }).returning();
  return user;
}

describe('catalog slice', () => {
  let adminToken = '';
  let branchA = '';
  let branchB = '';

  beforeAll(async () => {
    await initializeDatabase();
    const branches = await db.select().from(schema.branches);
    branchA = branches[0].id;
    branchB = branches[1].id;
    adminToken = await login('admin@evaya.ug', 'admin123');
  });

  beforeEach(async () => {
    await db.delete(schema.sessions);
    await db.delete(schema.auditLogs);
    await db.delete(schema.saleItems);
    await db.delete(schema.sales);
    await db.delete(schema.dailyCloses);
    await db.delete(schema.shifts);
    await db.delete(schema.inventoryMovements);
    await db.delete(schema.inventory);
    await db.delete(schema.batches);
    await db.delete(schema.suppliers);
    await db.delete(schema.productVisibility);
    await db.delete(schema.products);
    await db.delete(schema.categories).where(eq(schema.categories.name, 'Slice Test Category'));
    await db.delete(schema.categories).where(eq(schema.categories.name, 'Used Slice Category'));
    await db.delete(schema.categories).where(eq(schema.categories.name, 'Updated Slice Category'));
    await db.delete(schema.categories).where(eq(schema.categories.name, 'Warnings Category'));
    await db.delete(schema.users).where(eq(schema.users.email, 'manager.slice@evaya.ug'));
    await db.delete(schema.users).where(eq(schema.users.email, 'cashier.slice@evaya.ug'));
    adminToken = await login('admin@evaya.ug', 'admin123');
  });

  it('supports supplier CRUD and supplier-linked receiving', async () => {
    const createSupplierRes = await app.request('/api/catalog/suppliers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Green Harvest',
        contactPerson: 'Amina',
        phone: '+256700010101',
        whatsappNumber: '+256700010101',
        location: 'Kampala',
        notes: 'Primary herbs supplier',
      }),
    });
    expect(createSupplierRes.status).toBe(201);
    const supplier = (await json(createSupplierRes)).supplier;

    const updateSupplierRes = await app.request(`/api/catalog/suppliers/${supplier.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        notes: 'Updated supplier note',
        isActive: false,
      }),
    });
    expect(updateSupplierRes.status).toBe(200);
    expect((await json(updateSupplierRes)).supplier.isActive).toBe(false);

    const supplierListRes = await app.request('/api/catalog/suppliers?includeInactive=true', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(supplierListRes.status).toBe(200);
    expect((await json(supplierListRes)).suppliers.some((item: Record<string, unknown>) => item.id === supplier.id)).toBe(true);

    const categoryRes = await app.request('/api/catalog/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: 'Slice Test Category' }),
    });
    const category = (await json(categoryRes)).category;

    const productRes = await app.request('/api/catalog/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Supplier Linked Product',
        categoryId: category.id,
        unitType: 'kg',
        sellingPrice: 22000,
        costPrice: 14000,
        lowStockThreshold: 3,
        visibilityBranchIds: [branchA],
      }),
    });
    const product = (await json(productRes)).product;

    const batchRes = await app.request('/api/catalog/inventory/batches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        branchId: branchA,
        supplierId: supplier.id,
        batchNumber: 'SUP-B1',
        expiryDate: new Date(Date.now() + 86400000 * 14).toISOString(),
        quantityReceived: 8,
        costPrice: 14000,
        sellingPrice: 22000,
      }),
    });
    expect(batchRes.status).toBe(201);

    const historyRes = await app.request('/api/catalog/inventory/batches', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(historyRes.status).toBe(200);
    const linkedBatch = (await json(historyRes)).batches.find((batch: Record<string, unknown>) => batch.batchNumber === 'SUP-B1');
    expect(linkedBatch.supplierName).toBe('Green Harvest');

    const inventoryRes = await app.request(`/api/catalog/inventory?branchId=${branchA}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect((await json(inventoryRes)).inventory[0].quantity).toBe(8);

    const movementRes = await app.request(`/api/catalog/inventory/movements?branchId=${branchA}&productId=${product.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect((await json(movementRes)).movements[0].movementType).toBe('stock_received');

    const deleteSupplierRes = await app.request(`/api/catalog/suppliers/${supplier.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(deleteSupplierRes.status).toBe(409);

    const orphanSupplierRes = await app.request('/api/catalog/suppliers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Unused Supplier',
        phone: '+256700010202',
      }),
    });
    const orphanSupplier = (await json(orphanSupplierRes)).supplier;

    const removeOrphanRes = await app.request(`/api/catalog/suppliers/${orphanSupplier.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(removeOrphanRes.status).toBe(200);
  });

  it('supports category CRUD and prevents deleting used categories', async () => {
    const createRes = await app.request('/api/catalog/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: 'Slice Test Category', description: 'Created in test' }),
    });
    expect(createRes.status).toBe(201);
    const createdCategory = (await json(createRes)).category;

    const updateRes = await app.request(`/api/catalog/categories/${createdCategory.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: 'Updated Slice Category', isActive: false }),
    });
    expect(updateRes.status).toBe(200);
    expect((await json(updateRes)).category.isActive).toBe(false);

    const deleteRes = await app.request(`/api/catalog/categories/${createdCategory.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(deleteRes.status).toBe(200);

    const usedCategoryRes = await app.request('/api/catalog/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: 'Used Slice Category' }),
    });
    const usedCategory = (await json(usedCategoryRes)).category;

    const productRes = await app.request('/api/catalog/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Used category product',
        sku: 'USEDCAT-1',
        categoryId: usedCategory.id,
        unitType: 'kg',
        sellingPrice: 12000,
        costPrice: 6000,
        lowStockThreshold: 4,
        visibilityBranchIds: [branchA],
      }),
    });
    expect(productRes.status).toBe(201);

    const usedDeleteRes = await app.request(`/api/catalog/categories/${usedCategory.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(usedDeleteRes.status).toBe(409);
  });

  it('supports product CRUD, search, and branch visibility', async () => {
    const categoryRes = await app.request('/api/catalog/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: 'Slice Test Category' }),
    });
    const category = (await json(categoryRes)).category;

    const createProduct = await app.request('/api/catalog/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Moringa Powder',
        sku: 'MORINGA-001',
        barcode: '1234567890',
        categoryId: category.id,
        unitType: 'g',
        sellingPrice: 25000,
        costPrice: 15000,
        lowStockThreshold: 6,
        description: 'Nutrient dense greens',
        usageInstructions: 'Mix one teaspoon in tea',
        ingredients: 'Pure moringa leaf powder',
        allergyWarning: 'Consult a doctor when pregnant',
        visibilityBranchIds: [branchA, branchB],
      }),
    });
    expect(createProduct.status).toBe(201);
    const product = (await json(createProduct)).product;

    const searchRes = await app.request('/api/catalog/products?search=Moringa', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(searchRes.status).toBe(200);
    const listed = (await json(searchRes)).products;
    expect(listed).toHaveLength(1);
    expect(listed[0].visibleBranches).toHaveLength(2);

    const updateRes = await app.request(`/api/catalog/products/${product.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        sellingPrice: 27000,
        isActive: false,
        visibilityBranchIds: [branchA],
      }),
    });
    expect(updateRes.status).toBe(200);
    const updated = (await json(updateRes)).product;
    expect(updated.sellingPrice).toBe(27000);
    expect(updated.isActive).toBe(false);
  });

  it('creates movement records for stock received and adjustments, with expiry warnings', async () => {
    const categoryRes = await app.request('/api/catalog/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: 'Warnings Category' }),
    });
    const category = (await json(categoryRes)).category;

    const productRes = await app.request('/api/catalog/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Neem Capsules',
        sku: 'NEEM-01',
        categoryId: category.id,
        unitType: 'g',
        sellingPrice: 32000,
        costPrice: 18000,
        lowStockThreshold: 5,
        visibilityBranchIds: [branchA],
      }),
    });
    const product = (await json(productRes)).product;

    const soonDate = new Date();
    soonDate.setDate(soonDate.getDate() + 10);
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 2);

    const batchRes = await app.request('/api/catalog/inventory/batches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        branchId: branchA,
        batchNumber: 'NEEM-B1',
        expiryDate: soonDate.toISOString(),
        quantityReceived: 20,
        costPrice: 18000,
        sellingPrice: 32000,
      }),
    });
    expect(batchRes.status).toBe(201);
    const batch = (await json(batchRes)).batch;

    const expiredBatchRes = await app.request('/api/catalog/inventory/batches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        branchId: branchA,
        batchNumber: 'NEEM-B2',
        expiryDate: expiredDate.toISOString(),
        quantityReceived: 2,
        costPrice: 18000,
      }),
    });
    expect(expiredBatchRes.status).toBe(201);

    const adjustmentRes = await app.request('/api/catalog/inventory/adjustments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        branchId: branchA,
        batchId: batch.id,
        movementType: 'damaged',
        quantityDelta: -3,
        reason: 'Damaged during handling',
      }),
    });
    expect(adjustmentRes.status).toBe(201);

    const inventoryRes = await app.request(`/api/catalog/inventory?branchId=${branchA}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const inventory = (await json(inventoryRes)).inventory;
    expect(inventory[0].quantity).toBe(19);
    expect(inventory[0].expiringSoonCount).toBeGreaterThan(0);
    expect(inventory[0].expiredCount).toBeGreaterThan(0);

    const lowStatusRes = await app.request(`/api/catalog/inventory?branchId=${branchA}&status=expiring`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect((await json(lowStatusRes)).inventory.length).toBeGreaterThan(0);

    const movementRes = await app.request(`/api/catalog/inventory/movements?branchId=${branchA}&productId=${product.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const movements = (await json(movementRes)).movements;
    const types = movements.map((movement: Record<string, unknown>) => movement.movementType);
    expect(types).toContain('stock_received');
    expect(types).toContain('damaged');
  });

  it('prevents duplicate inventory, visibility, and batch records', async () => {
    const categoryRes = await app.request('/api/catalog/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: 'Integrity Category' }),
    });
    const category = (await json(categoryRes)).category;

    const productRes = await app.request('/api/catalog/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Integrity Product',
        categoryId: category.id,
        unitType: 'kg',
        sellingPrice: 10000,
        costPrice: 5000,
        lowStockThreshold: 3,
        visibilityBranchIds: [branchA],
      }),
    });
    const product = (await json(productRes)).product;

    await expect(db.insert(schema.inventory).values({
      productId: product.id,
      branchId: branchA,
      quantity: 0,
      lowStockThreshold: 3,
    })).rejects.toBeDefined();

    await expect(db.insert(schema.productVisibility).values({
      productId: product.id,
      branchId: branchA,
    })).rejects.toBeDefined();

    const batchRes = await app.request('/api/catalog/inventory/batches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        branchId: branchA,
        batchNumber: 'INTEGRITY-B1',
        expiryDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        quantityReceived: 5,
        costPrice: 5000,
      }),
    });
    expect(batchRes.status).toBe(201);

    const duplicateBatchRes = await app.request('/api/catalog/inventory/batches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        branchId: branchA,
        batchNumber: 'INTEGRITY-B1',
        expiryDate: new Date(Date.now() + 86400000 * 10).toISOString(),
        quantityReceived: 4,
        costPrice: 5000,
      }),
    });
    expect(duplicateBatchRes.status).toBe(409);

    const [inventoryRow] = await db.select().from(schema.inventory).where(and(
      eq(schema.inventory.productId, product.id),
      eq(schema.inventory.branchId, branchA),
    ));
    expect(inventoryRow.quantity).toBe(5);

    const receivedMovements = await db.select().from(schema.inventoryMovements).where(and(
      eq(schema.inventoryMovements.productId, product.id),
      eq(schema.inventoryMovements.branchId, branchA),
      eq(schema.inventoryMovements.movementType, 'stock_received'),
    ));
    expect(receivedMovements).toHaveLength(1);
  });

  it('rolls back stock adjustments when inventory update fails after batch validation', async () => {
    const categoryRes = await app.request('/api/catalog/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: 'Rollback Category' }),
    });
    const category = (await json(categoryRes)).category;

    const productRes = await app.request('/api/catalog/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Rollback Product',
        categoryId: category.id,
        unitType: 'kg',
        sellingPrice: 10000,
        costPrice: 5000,
        lowStockThreshold: 3,
        visibilityBranchIds: [branchA],
      }),
    });
    const product = (await json(productRes)).product;

    const batchRes = await app.request('/api/catalog/inventory/batches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        branchId: branchA,
        batchNumber: 'ROLLBACK-B1',
        expiryDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        quantityReceived: 5,
        costPrice: 5000,
      }),
    });
    const batch = (await json(batchRes)).batch;

    await db.update(schema.inventory)
      .set({ quantity: 0 })
      .where(and(eq(schema.inventory.productId, product.id), eq(schema.inventory.branchId, branchA)));

    const adjustmentRes = await app.request('/api/catalog/inventory/adjustments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: product.id,
        branchId: branchA,
        batchId: batch.id,
        movementType: 'damaged',
        quantityDelta: -1,
        reason: 'Should rollback fully',
      }),
    });
    expect(adjustmentRes.status).toBe(409);

    const [reloadedBatch] = await db.select().from(schema.batches).where(eq(schema.batches.id, batch.id));
    const [reloadedInventory] = await db.select().from(schema.inventory).where(and(
      eq(schema.inventory.productId, product.id),
      eq(schema.inventory.branchId, branchA),
    ));
    expect(reloadedBatch.quantityRemaining).toBe(5);
    expect(reloadedInventory.quantity).toBe(0);

    const damagedMovements = await db.select().from(schema.inventoryMovements).where(and(
      eq(schema.inventoryMovements.productId, product.id),
      eq(schema.inventoryMovements.branchId, branchA),
      eq(schema.inventoryMovements.movementType, 'damaged'),
    ));
    expect(damagedMovements).toHaveLength(0);
  });

  it('enforces branch scoping and permissions', async () => {
    const manager = await createUser('Branch Manager', 'manager.slice@evaya.ug', branchA);
    const cashier = await createUser('Cashier', 'cashier.slice@evaya.ug', branchA);

    const managerToken = await login(manager.email, 'secret123');
    const cashierToken = await login(cashier.email, 'secret123');

    const categoryRes = await app.request('/api/catalog/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: 'Slice Test Category' }),
    });
    const category = (await json(categoryRes)).category;

    const managerCategoryRes = await app.request('/api/catalog/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({ name: 'Manager Should Fail' }),
    });
    expect(managerCategoryRes.status).toBe(403);

    const managerProductRes = await app.request('/api/catalog/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        name: 'Manager Branch Product',
        categoryId: category.id,
        unitType: 'kg',
        sellingPrice: 10000,
        costPrice: 5000,
        lowStockThreshold: 2,
        visibilityBranchIds: [branchA, branchB],
      }),
    });
    expect(managerProductRes.status).toBe(201);

    const managerProduct = (await json(managerProductRes)).product;
    const visibilityRes = await app.request('/api/catalog/products?branchId=' + branchA, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect((await json(visibilityRes)).products[0].id).toBe(managerProduct.id);

    const forbiddenScopeRes = await app.request(`/api/catalog/inventory?branchId=${branchB}`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect(forbiddenScopeRes.status).toBe(403);

    const managerBatchRes = await app.request('/api/catalog/inventory/batches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        productId: managerProduct.id,
        branchId: branchA,
        batchNumber: 'MANAGER-B1',
        expiryDate: new Date(Date.now() + 86400000 * 5).toISOString(),
        quantityReceived: 6,
        costPrice: 5000,
      }),
    });
    expect(managerBatchRes.status).toBe(201);

    const cashierInventoryRes = await app.request(`/api/catalog/inventory?branchId=${branchA}`, {
      headers: { Authorization: `Bearer ${cashierToken}` },
    });
    expect(cashierInventoryRes.status).toBe(200);

    const cashierAdjustRes = await app.request('/api/catalog/inventory/adjustments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({
        productId: managerProduct.id,
        branchId: branchA,
        movementType: 'adjustment',
        quantityDelta: 1,
        reason: 'Cashier should not mutate inventory',
      }),
    });
    expect(cashierAdjustRes.status).toBe(403);

    const cashierReceiveRes = await app.request('/api/catalog/inventory/batches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({
        productId: managerProduct.id,
        branchId: branchA,
        batchNumber: 'CASHIER-BLOCKED',
        expiryDate: new Date(Date.now() + 86400000 * 5).toISOString(),
        quantityReceived: 2,
        costPrice: 5000,
      }),
    });
    expect(cashierReceiveRes.status).toBe(403);
  });
});
