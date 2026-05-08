import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import app from './index';
import { db } from './db';
import { initializeDatabase } from './db/init';
import * as schema from './db/schema';

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

async function createUser(roleName: string, email: string, branchId: string) {
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.name, roleName));
  expect(role).toBeDefined();
  const passwordHash = await bcrypt.hash('secret123', 10);
  const [user] = await db.insert(schema.users).values({
    email,
    passwordHash,
    firstName: roleName.replace(/\s+/g, ''),
    lastName: 'POS',
    phone: '+256700000222',
    roleId: role.id,
    branchId,
    isActive: true,
  }).returning();
  return user;
}

async function createCategory(adminToken: string, name: string) {
  const response = await app.request('/api/catalog/categories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ name }),
  });
  expect(response.status).toBe(201);
  return (await json(response)).category;
}

async function createProduct(adminToken: string, branchId: string, categoryId: string, name: string) {
  const response = await app.request('/api/catalog/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name,
      sku: `${name.slice(0, 3).toUpperCase()}-001`,
      barcode: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
      categoryId,
      unitType: 'piece',
      sellingPrice: 12000,
      lowStockThreshold: 3,
      visibilityBranchIds: [branchId],
    }),
  });
  expect(response.status).toBe(201);
  return (await json(response)).product;
}

async function receiveBatch(adminToken: string, payload: Record<string, unknown>) {
  const response = await app.request('/api/catalog/inventory/batches', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(payload),
  });
  expect(response.status).toBe(201);
  return (await json(response)).batch;
}

async function openShift(token: string, openingCash = 10000) {
  const response = await app.request('/api/pos/shift/open', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ openingCash }),
  });
  expect(response.status).toBe(201);
  return (await json(response)).shift;
}

describe('pos slice', () => {
  let adminToken = '';
  let branchId = '';

  beforeAll(async () => {
    await initializeDatabase();
    const [primaryBranch] = await db.select().from(schema.branches).where(eq(schema.branches.name, 'Evaya Naturals'));
    branchId = primaryBranch.id;
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
    await db.delete(schema.productVisibility);
    await db.delete(schema.products);
    await db.delete(schema.categories).where(eq(schema.categories.name, 'POS Category'));
    await db.delete(schema.categories).where(eq(schema.categories.name, 'Expired Category'));
    await db.delete(schema.users).where(eq(schema.users.email, 'cashier.pos@evaya.ug'));
    await db.delete(schema.users).where(eq(schema.users.email, 'rider.pos@evaya.ug'));
    await db.delete(schema.users).where(eq(schema.users.email, 'accountant.pos@evaya.ug'));
    await db.delete(schema.users).where(eq(schema.users.email, 'manager.shift@evaya.ug'));
    adminToken = await login('admin@evaya.ug', 'admin123');
  });

  it('supports POS product search for active sellable stock', async () => {
    const category = await createCategory(adminToken, 'POS Category');
    const product = await createProduct(adminToken, branchId, category.id, 'Turmeric Soap');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 20);

    await receiveBatch(adminToken, {
      productId: product.id,
      branchId,
      batchNumber: 'SOAP-B1',
      expiryDate: futureDate.toISOString(),
      quantityReceived: 10,
      costPrice: 6000,
      sellingPrice: 12000,
    });

    const response = await app.request('/api/pos/products?search=Turmeric', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(response.status).toBe(200);
    const payload = await json(response);
    expect(payload.products).toHaveLength(1);
    expect(payload.products[0].availableQuantity).toBe(10);
  });

  it('completes a successful cashier sale, deducts FIFO stock, and records movements', async () => {
    const category = await createCategory(adminToken, 'POS Category');
    const product = await createProduct(adminToken, branchId, category.id, 'Ginger Tonic');
    const firstExpiry = new Date();
    firstExpiry.setDate(firstExpiry.getDate() + 5);
    const secondExpiry = new Date();
    secondExpiry.setDate(secondExpiry.getDate() + 15);

    const batchOne = await receiveBatch(adminToken, {
      productId: product.id,
      branchId,
      batchNumber: 'TONIC-B1',
      expiryDate: firstExpiry.toISOString(),
      quantityReceived: 2,
      costPrice: 7000,
      sellingPrice: 12000,
    });

    const batchTwo = await receiveBatch(adminToken, {
      productId: product.id,
      branchId,
      batchNumber: 'TONIC-B2',
      expiryDate: secondExpiry.toISOString(),
      quantityReceived: 4,
      costPrice: 7000,
      sellingPrice: 12000,
    });

    await createUser('Cashier', 'cashier.pos@evaya.ug', branchId);
    const cashierToken = await login('cashier.pos@evaya.ug', 'secret123');

    const blockedSaleRes = await app.request('/api/pos/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({
        discount: 2000,
        paymentMethod: 'cash',
        items: [{ productId: product.id, quantity: 1 }],
      }),
    });
    expect(blockedSaleRes.status).toBe(409);

    const activeShift = await openShift(cashierToken, 12000);

    const saleResponse = await app.request('/api/pos/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({
        discount: 2000,
        paymentMethod: 'cash',
        items: [{ productId: product.id, quantity: 3 }],
      }),
    });

    expect(saleResponse.status).toBe(201);
    const salePayload = await json(saleResponse);
    expect(salePayload.receiptNumber).toMatch(/^EVN-/);
    expect(salePayload.sale.total).toBe(34000);

    const [inventory] = await db.select().from(schema.inventory).where(eq(schema.inventory.productId, product.id));
    expect(inventory.quantity).toBe(3);

    const [updatedBatchOne] = await db.select().from(schema.batches).where(eq(schema.batches.id, batchOne.id));
    const [updatedBatchTwo] = await db.select().from(schema.batches).where(eq(schema.batches.id, batchTwo.id));
    expect(updatedBatchOne.quantityRemaining).toBe(0);
    expect(updatedBatchTwo.quantityRemaining).toBe(3);

    const movements = await db.select().from(schema.inventoryMovements).where(eq(schema.inventoryMovements.referenceId, salePayload.sale.id));
    expect(movements).toHaveLength(2);
    expect(movements.every((movement) => movement.movementType === 'sale')).toBe(true);
    expect(movements.every((movement) => movement.referenceType === 'sale')).toBe(true);

    const [persistedSale] = await db.select().from(schema.sales).where(eq(schema.sales.id, salePayload.sale.id));
    expect(persistedSale.shiftId).toBe(activeShift.id);

    const receiptResponse = await app.request(`/api/pos/receipts/${salePayload.sale.id}`, {
      headers: { Authorization: `Bearer ${cashierToken}` },
    });
    expect(receiptResponse.status).toBe(200);
    const receiptPayload = await json(receiptResponse);
    expect(receiptPayload.receipt.items).toHaveLength(2);
  });

  it('blocks selling expired stock only', async () => {
    const category = await createCategory(adminToken, 'Expired Category');
    const product = await createProduct(adminToken, branchId, category.id, 'Neem Balm');
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 1);

    await receiveBatch(adminToken, {
      productId: product.id,
      branchId,
      batchNumber: 'BALM-B1',
      expiryDate: expiredDate.toISOString(),
      quantityReceived: 5,
      costPrice: 4000,
      sellingPrice: 12000,
    });

    await createUser('Cashier', 'cashier.pos@evaya.ug', branchId);
    const cashierToken = await login('cashier.pos@evaya.ug', 'secret123');
    await openShift(cashierToken);

    const response = await app.request('/api/pos/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({
        paymentMethod: 'cash',
        items: [{ productId: product.id, quantity: 1 }],
      }),
    });

    expect(response.status).toBe(409);
    expect((await json(response)).error).toContain('only has expired stock');
  });

  it('blocks insufficient stock', async () => {
    const category = await createCategory(adminToken, 'POS Category');
    const product = await createProduct(adminToken, branchId, category.id, 'Lemongrass Tea');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 12);

    await receiveBatch(adminToken, {
      productId: product.id,
      branchId,
      batchNumber: 'TEA-B1',
      expiryDate: futureDate.toISOString(),
      quantityReceived: 2,
      costPrice: 5000,
      sellingPrice: 12000,
    });

    await createUser('Cashier', 'cashier.pos@evaya.ug', branchId);
    const cashierToken = await login('cashier.pos@evaya.ug', 'secret123');
    await openShift(cashierToken);

    const response = await app.request('/api/pos/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({
        paymentMethod: 'cash',
        items: [{ productId: product.id, quantity: 3 }],
      }),
    });

    expect(response.status).toBe(409);
    expect((await json(response)).error).toContain('Insufficient stock');
  });

  it('allows cashier checkout and blocks delivery rider and accountant from checkout', async () => {
    const category = await createCategory(adminToken, 'POS Category');
    const product = await createProduct(adminToken, branchId, category.id, 'Moringa Tea');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 18);

    await receiveBatch(adminToken, {
      productId: product.id,
      branchId,
      batchNumber: 'MOR-B1',
      expiryDate: futureDate.toISOString(),
      quantityReceived: 10,
      costPrice: 4000,
      sellingPrice: 12000,
    });

    await createUser('Cashier', 'cashier.pos@evaya.ug', branchId);
    await createUser('Delivery Rider', 'rider.pos@evaya.ug', branchId);
    await createUser('Accountant', 'accountant.pos@evaya.ug', branchId);

    const cashierToken = await login('cashier.pos@evaya.ug', 'secret123');
    const riderToken = await login('rider.pos@evaya.ug', 'secret123');
    const accountantToken = await login('accountant.pos@evaya.ug', 'secret123');

    const cashierToday = await app.request('/api/pos/sales/today', {
      headers: { Authorization: `Bearer ${cashierToken}` },
    });
    expect(cashierToday.status).toBe(200);

    const riderToday = await app.request('/api/pos/sales/today', {
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    expect(riderToday.status).toBe(403);

    const accountantToday = await app.request('/api/pos/sales/today', {
      headers: { Authorization: `Bearer ${accountantToken}` },
    });
    expect(accountantToday.status).toBe(200);

    await openShift(cashierToken);

    const cashierCheckout = await app.request('/api/pos/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({
        paymentMethod: 'cash',
        items: [{ productId: product.id, quantity: 1 }],
      }),
    });
    expect(cashierCheckout.status).toBe(201);

    const riderCheckout = await app.request('/api/pos/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${riderToken}`,
      },
      body: JSON.stringify({
        paymentMethod: 'cash',
        items: [{ productId: product.id, quantity: 1 }],
      }),
    });
    expect(riderCheckout.status).toBe(403);

    const accountantCheckout = await app.request('/api/pos/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantToken}`,
      },
      body: JSON.stringify({
        paymentMethod: 'cash',
        items: [{ productId: product.id, quantity: 1 }],
      }),
    });
    expect(accountantCheckout.status).toBe(403);
  });

  it('opens shifts, blocks second active shift, closes with variance, and enforces approval permissions', async () => {
    await createUser('Cashier', 'cashier.pos@evaya.ug', branchId);
    const manager = await createUser('Branch Manager', 'manager.shift@evaya.ug', branchId);
    const cashierToken = await login('cashier.pos@evaya.ug', 'secret123');
    const managerToken = await login(manager.email, 'secret123');

    const openRes = await app.request('/api/pos/shift/open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({ openingCash: 15000 }),
    });
    expect(openRes.status).toBe(201);
    const activeShift = (await json(openRes)).shift;

    const duplicateOpenRes = await app.request('/api/pos/shift/open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({ openingCash: 5000 }),
    });
    expect(duplicateOpenRes.status).toBe(409);

    const currentShiftRes = await app.request('/api/pos/shift/current', {
      headers: { Authorization: `Bearer ${cashierToken}` },
    });
    expect(currentShiftRes.status).toBe(200);
    expect((await json(currentShiftRes)).shift.id).toBe(activeShift.id);

    const category = await createCategory(adminToken, 'POS Category');
    const product = await createProduct(adminToken, branchId, category.id, 'Shift Test Product');
    await receiveBatch(adminToken, {
      productId: product.id,
      branchId,
      batchNumber: 'SHIFT-B1',
      expiryDate: new Date(Date.now() + 86400000 * 7).toISOString(),
      quantityReceived: 4,
      costPrice: 5000,
      sellingPrice: 12000,
    });

    const saleRes = await app.request('/api/pos/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({
        paymentMethod: 'cash',
        items: [{ productId: product.id, quantity: 2 }],
      }),
    });
    expect(saleRes.status).toBe(201);

    const closeRes = await app.request('/api/pos/shift/close', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierToken}`,
      },
      body: JSON.stringify({
        countedCash: 38000,
        notes: 'Drawer reconciled',
      }),
    });
    expect(closeRes.status).toBe(200);
    const closedShift = (await json(closeRes)).shift;
    expect(closedShift.status).toBe('closed');
    expect(closedShift.expectedCash).toBe(39000);
    expect(closedShift.variance).toBe(-1000);

    const [dailyClose] = await db.select().from(schema.dailyCloses).where(eq(schema.dailyCloses.shiftId, activeShift.id));
    expect(dailyClose.cashExpected).toBe(39000);
    expect(dailyClose.cashCounted).toBe(38000);
    expect(dailyClose.difference).toBe(-1000);

    const approveRes = await app.request(`/api/pos/shift/${activeShift.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    expect(approveRes.status).toBe(200);
    expect((await json(approveRes)).shift.status).toBe('approved');

    const cashierApproveRes = await app.request(`/api/pos/shift/${activeShift.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cashierToken}` },
    });
    expect(cashierApproveRes.status).toBe(403);
  });
});
