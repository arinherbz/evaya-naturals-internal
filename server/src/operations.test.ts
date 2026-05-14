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

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function login(email: string, password: string) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(response.status).toBe(200);
  return (await json(response)).token as string;
}

async function createUser(roleName: string, email: string, branchId: string) {
  const [role] = await db.select().from(schema.roles).where(eq(schema.roles.name, roleName));
  const passwordHash = await bcrypt.hash('secret123', 10);
  const [user] = await db.insert(schema.users).values({
    email,
    passwordHash,
    firstName: roleName.replace(/\s+/g, ''),
    lastName: 'Ops',
    phone: '+256700000888',
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
      unitType: 'kg',
      sellingPrice: 12000,
      costPrice: 6000,
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

async function createCustomer(token: string, name: string, phone: string) {
  const response = await app.request('/api/pos/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, phone }),
  });
  expect(response.status).toBe(201);
  return (await json(response)).customer;
}

describe('operations slices', () => {
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
    await db.delete(schema.deliveries);
    await db.delete(schema.expenses);
    await db.delete(schema.inventoryMovements);
    await db.delete(schema.inventory);
    await db.delete(schema.batches);
    await db.delete(schema.productVisibility);
    await db.delete(schema.products);
    await db.delete(schema.customers);
    await db.delete(schema.categories).where(eq(schema.categories.name, 'Ops Category'));
    await db.delete(schema.users).where(eq(schema.users.email, 'cashier.ops@evaya.ug'));
    await db.delete(schema.users).where(eq(schema.users.email, 'manager.ops@evaya.ug'));
    await db.delete(schema.users).where(eq(schema.users.email, 'accountant.ops@evaya.ug'));
    await db.delete(schema.users).where(eq(schema.users.email, 'rider.ops@evaya.ug'));
    await db.delete(schema.users).where(eq(schema.users.email, 'rider.two@evaya.ug'));
    adminToken = await login('admin@evaya.ug', 'admin123');
  });

  async function seedSale(token: string, createdAtOverride?: string) {
    const category = await createCategory(adminToken, 'Ops Category');
    const product = await createProduct(adminToken, branchId, category.id, `Ops Product ${Date.now()}`);
    await receiveBatch(adminToken, {
      productId: product.id,
      branchId,
      batchNumber: `OPS-${Date.now()}`,
      expiryDate: new Date(Date.now() + 86400000 * 30).toISOString(),
      quantityReceived: 10,
      costPrice: 5000,
      sellingPrice: 12000,
    });

    const saleResponse = await app.request('/api/pos/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        paymentMethod: 'cash',
        discount: 1000,
        items: [{ productId: product.id, quantity: 2 }],
      }),
    });
    expect(saleResponse.status).toBe(201);
    const salePayload = await json(saleResponse);
    if (createdAtOverride) {
      await db.update(schema.sales)
        .set({ createdAt: createdAtOverride, updatedAt: createdAtOverride })
        .where(eq(schema.sales.id, salePayload.sale.id));
    }
    return salePayload.sale.id as string;
  }

  it('returns daily, weekly, and custom report data and includes expenses', async () => {
    await createUser('Cashier', 'cashier.ops@evaya.ug', branchId);
    await createUser('Accountant', 'accountant.ops@evaya.ug', branchId);
    const cashierToken = await login('cashier.ops@evaya.ug', 'secret123');
    const accountantToken = await login('accountant.ops@evaya.ug', 'secret123');
    await openShift(cashierToken);

    const customDate = new Date();
    customDate.setDate(customDate.getDate() - 2);
    customDate.setHours(9, 0, 0, 0);
    const customDateIso = customDate.toISOString();
    const customDay = customDateIso.slice(0, 10);

    await seedSale(cashierToken, customDateIso);
    await app.request('/api/pos/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantToken}`,
      },
      body: JSON.stringify({
        title: 'Packaging tape',
        category: 'Packaging',
        amount: 5000,
        paymentMethod: 'cash',
        expenseDate: customDay,
      }),
    });

    await app.request('/api/pos/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantToken}`,
      },
      body: JSON.stringify({
        title: 'Same-day till float',
        category: 'Miscellaneous',
        amount: 3000,
        paymentMethod: 'cash',
        expenseDate: localDateKey(),
      }),
    });

    const dailyResponse = await app.request('/api/pos/reports/summary?period=daily', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(dailyResponse.status).toBe(200);
    const dailyPayload = await json(dailyResponse);
    expect(dailyPayload.expensesTotal).toBe(3000);

    const weeklyResponse = await app.request('/api/pos/reports/summary?period=weekly', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(weeklyResponse.status).toBe(200);
    const weeklyPayload = await json(weeklyResponse);
    expect(weeklyPayload.totalSales).toBe(23000);
    expect(weeklyPayload.expensesTotal).toBe(8000);

    const customResponse = await app.request(`/api/pos/reports/summary?period=custom&startDate=${customDay}&endDate=${customDay}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(customResponse.status).toBe(200);
    const customPayload = await json(customResponse);
    expect(customPayload.title).toContain('Report');
    expect(customPayload.generatedAt).toBeDefined();
    expect(customPayload.paymentTotals.cash).toBe(23000);
    expect(customPayload.totalSales).toBe(23000);
    expect(customPayload.expensesTotal).toBe(5000);
    expect(customPayload.netAmount).toBe(18000);
  });

  it('returns a branded PDF report with totals', async () => {
    await createUser('Cashier', 'cashier.ops@evaya.ug', branchId);
    const cashierToken = await login('cashier.ops@evaya.ug', 'secret123');
    await openShift(cashierToken);
    await seedSale(cashierToken);

    const response = await app.request('/api/pos/reports/pdf?period=daily', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/pdf');
    const text = Buffer.from(await response.arrayBuffer()).toString('utf8');
    expect(text).toContain('Evaya Naturals');
    expect(text).toContain('Total sales');
  });

  it('enforces expense create edit delete permissions', async () => {
    await createUser('Accountant', 'accountant.ops@evaya.ug', branchId);
    await createUser('Cashier', 'cashier.ops@evaya.ug', branchId);
    const accountantToken = await login('accountant.ops@evaya.ug', 'secret123');
    const cashierToken = await login('cashier.ops@evaya.ug', 'secret123');

    const createResponse = await app.request('/api/pos/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantToken}`,
      },
      body: JSON.stringify({
        title: 'Fuel top-up',
        category: 'Transport',
        amount: 7000,
        paymentMethod: 'cash',
        expenseDate: new Date().toISOString().slice(0, 10),
      }),
    });
    expect(createResponse.status).toBe(201);
    const expense = (await json(createResponse)).expense;

    const editResponse = await app.request(`/api/pos/expenses/${expense.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantToken}`,
      },
      body: JSON.stringify({ amount: 9000 }),
    });
    expect(editResponse.status).toBe(200);

    const cashierDelete = await app.request(`/api/pos/expenses/${expense.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${cashierToken}` },
    });
    expect(cashierDelete.status).toBe(403);

    const adminDelete = await app.request(`/api/pos/expenses/${expense.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(adminDelete.status).toBe(200);
  });

  it('creates and updates deliveries, and riders only see assigned deliveries', async () => {
    const manager = await createUser('Branch Manager', 'manager.ops@evaya.ug', branchId);
    const rider = await createUser('Delivery Rider', 'rider.ops@evaya.ug', branchId);
    await createUser('Delivery Rider', 'rider.two@evaya.ug', branchId);
    const managerToken = await login(manager.email, 'secret123');
    const riderToken = await login(rider.email, 'secret123');
    const customer = await createCustomer(adminToken, 'Delivery Customer', '+256700444555');

    const createResponse = await app.request('/api/pos/deliveries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        customerId: customer.id,
        receiptReference: 'EVN-REF-001',
        deliveryAddress: 'Kampala Road',
        riderId: rider.id,
        deliveryFee: 3000,
        deliveryDate: new Date().toISOString().slice(0, 10),
      }),
    });
    expect(createResponse.status).toBe(201);
    const delivery = (await json(createResponse)).delivery;

    const updateResponse = await app.request(`/api/pos/deliveries/${delivery.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${riderToken}`,
      },
      body: JSON.stringify({ status: 'picked_up' }),
    });
    expect(updateResponse.status).toBe(200);

    await app.request('/api/pos/deliveries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        customerId: customer.id,
        receiptReference: 'EVN-REF-002',
        deliveryAddress: 'Entebbe Road',
        deliveryFee: 2000,
        deliveryDate: new Date().toISOString().slice(0, 10),
      }),
    });

    const riderList = await app.request('/api/pos/deliveries', {
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    expect(riderList.status).toBe(200);
    const riderPayload = await json(riderList);
    expect(riderPayload.deliveries).toHaveLength(1);
    expect(riderPayload.deliveries[0].id).toBe(delivery.id);
  });
});
