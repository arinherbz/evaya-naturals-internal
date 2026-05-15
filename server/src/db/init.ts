import { eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, usingPglite } from './index.js';
import * as schema from './schema/index.js';
import { defaultAppSettings } from '../lib/app-settings.js';
import { appEnv } from '../env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(__dirname, '../../src/db/migrations');

let migrationsApplied = false;

async function runMigrations() {
  if (migrationsApplied) {
    return;
  }

  if (usingPglite) {
    await migratePglite(db as never, { migrationsFolder });
  } else {
    await migrateNodePg(db as never, { migrationsFolder });
  }

  migrationsApplied = true;
}

async function ensureRoles() {
  const defaultRoles = [
    {
      name: 'Admin',
      description: 'Full system access',
      permissions: ['*'],
    },
    {
      name: 'Branch Manager',
      description: 'Manage branch operations',
      permissions: ['view_dashboard', 'manage_sales', 'manage_inventory', 'view_reports', 'manage_staff', 'daily_close', 'update_delivery_status'],
    },
    {
      name: 'Cashier',
      description: 'Process sales and handle cash-up',
      permissions: ['view_dashboard', 'process_sales', 'daily_close'],
    },
  ];

  for (const role of defaultRoles) {
    const existing = await db.select().from(schema.roles).where(eq(schema.roles.name, role.name));
    if (existing.length === 0) {
      await db.insert(schema.roles).values(role);
    } else {
      await db.update(schema.roles)
        .set({
          description: role.description,
          permissions: role.permissions,
          isActive: true,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.roles.id, existing[0].id));
    }
  }

  await db.update(schema.roles)
    .set({
      isActive: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.roles.name, 'Inventory Officer'));

  await db.update(schema.roles)
    .set({
      isActive: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.roles.name, 'Delivery Rider'));

  await db.update(schema.roles)
    .set({
      isActive: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.roles.name, 'Accountant'));

  const retiredRoles = await db.select({ id: schema.roles.id })
    .from(schema.roles)
    .where(inArray(schema.roles.name, ['Inventory Officer', 'Delivery Rider', 'Accountant']));

  if (retiredRoles.length > 0) {
    const retiredRoleIds = retiredRoles.map((role) => role.id);
    const retiredUsers = await db.select({ id: schema.users.id })
      .from(schema.users)
      .where(inArray(schema.users.roleId, retiredRoleIds));

    if (retiredUsers.length > 0) {
      const retiredUserIds = retiredUsers.map((user) => user.id);
      await db.update(schema.users)
        .set({
          isActive: false,
          updatedAt: new Date().toISOString(),
        })
        .where(inArray(schema.users.id, retiredUserIds));
      await db.delete(schema.sessions).where(inArray(schema.sessions.userId, retiredUserIds));
    }
  }
}

async function ensureBranches() {
  const defaultBranches = [
    { name: 'Evaya Naturals', code: 'EN001', address: 'Kampala, Uganda', phone: '+256 700 000 001' },
    { name: 'Evaya Beauty', code: 'EB002', address: 'Entebbe, Uganda', phone: '+256 700 000 002' },
    { name: 'Evaya World', code: 'EW003', address: 'Jinja, Uganda', phone: '+256 700 000 003' },
  ];

  for (const branch of defaultBranches) {
    const existing = await db.select().from(schema.branches).where(eq(schema.branches.name, branch.name));
    if (existing.length === 0) {
      await db.insert(schema.branches).values(branch);
    }
  }
}

export function resolveAdminBootstrapPassword({
  isProduction,
  configuredPassword,
}: {
  isProduction: boolean;
  configuredPassword?: string;
}) {
  if (configuredPassword) {
    return configuredPassword;
  }

  if (isProduction) {
    throw new Error('Production requires ADMIN_BOOTSTRAP_PASSWORD before the initial admin account can be created.');
  }

  return 'admin123';
}

async function ensureAdmin(primaryBranchId: string) {
  const [adminRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, 'Admin'));
  if (!adminRole) {
    return;
  }

  const existingAdmin = await db.select().from(schema.users).where(eq(schema.users.email, 'admin@evaya.ug'));
  if (existingAdmin.length === 0) {
    const bootstrapPassword = resolveAdminBootstrapPassword({
      isProduction: appEnv.isProduction,
      configuredPassword: appEnv.adminBootstrapPassword,
    });
    const passwordHash = await bcrypt.hash(bootstrapPassword, 10);
    await db.insert(schema.users).values({
      email: 'admin@evaya.ug',
      passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      roleId: adminRole.id,
      branchId: primaryBranchId,
      phone: '+256 700 000 000',
    });
    return;
  }

  if (!existingAdmin[0].branchId) {
    await db.update(schema.users)
      .set({ branchId: primaryBranchId, updatedAt: new Date().toISOString() })
      .where(eq(schema.users.id, existingAdmin[0].id));
  }
}

async function ensureCategories() {
  const defaultCategories = [
    'Spices',
    'Herbs',
    'Herbal Teas',
    'Cold-Pressed Oils',
    'Herbal Powders',
    'Natural Skincare',
    'Supplements',
    'Wellness Bundles',
    'Beauty Products',
    'Body Care',
    'Hair Care',
  ];

  for (const categoryName of defaultCategories) {
    const existing = await db.select().from(schema.categories).where(eq(schema.categories.name, categoryName));
    if (existing.length === 0) {
      await db.insert(schema.categories).values({ name: categoryName });
    }
  }
}

async function ensureBundles() {
  const [wellnessBundle] = await db.select().from(schema.bundles).where(eq(schema.bundles.name, 'Immunity Boost Bundle'));
  if (wellnessBundle) {
    return;
  }

  await db.insert(schema.bundles).values([
    {
      name: 'Immunity Boost Bundle',
      description: 'Natural supplements to strengthen your immune system',
      sellingPrice: 85000,
      isActive: true,
    },
    {
      name: 'Skincare Essentials Bundle',
      description: 'Complete natural skincare routine',
      sellingPrice: 120000,
      isActive: true,
    },
    {
      name: 'Herbal Tea Collection',
      description: 'Assorted herbal teas for wellness',
      sellingPrice: 45000,
      isActive: true,
    },
  ]);
}

async function ensureSettings() {
  const existingSettings = await db.select().from(schema.appSettings).where(eq(schema.appSettings.id, 'app'));
  if (existingSettings.length === 0) {
    await db.insert(schema.appSettings).values({
      id: 'app',
      businessName: defaultAppSettings.businessName,
      logoDataUrl: defaultAppSettings.logoDataUrl,
      phone: defaultAppSettings.phone,
      email: defaultAppSettings.email,
      address: defaultAppSettings.address,
      currency: defaultAppSettings.currency,
      expiryAlertDays: defaultAppSettings.expiryAlertDays,
      lowStockDefaultThreshold: defaultAppSettings.lowStockDefaultThreshold,
      receiptFooterMessage: defaultAppSettings.receiptFooterMessage,
      reportFooterMessage: defaultAppSettings.reportFooterMessage,
      paymentMethods: defaultAppSettings.paymentMethods,
    });
  }
}

async function ensureSampleData(primaryBranchId: string) {
  const [adminUser] = await db.select().from(schema.users).where(eq(schema.users.email, 'admin@evaya.ug'));
  const [defaultCategory] = await db.select().from(schema.categories).where(eq(schema.categories.name, 'Herbal Teas'));

  if (adminUser && defaultCategory) {
    const existingProduct = await db.select().from(schema.products).where(eq(schema.products.name, 'Sample Lemongrass Tea'));
    if (existingProduct.length === 0) {
      const [product] = await db.insert(schema.products).values({
        name: 'Sample Lemongrass Tea',
        categoryId: defaultCategory.id,
        unitType: 'box',
        sellingPrice: 18000,
        costPrice: 12000,
        lowStockThreshold: 5,
      }).returning();

      await db.insert(schema.productVisibility).values({
        productId: product.id,
        branchId: primaryBranchId,
      });
    }

    const existingCustomer = await db.select().from(schema.customers).where(eq(schema.customers.phone, '+256700000555'));
    if (existingCustomer.length === 0) {
      await db.insert(schema.customers).values({
        name: 'Sample Customer',
        phone: '+256700000555',
        whatsappNumber: '+256700000555',
        email: 'sample.customer@evaya.ug',
      });
    }

    const existingExpense = await db.select().from(schema.expenses).where(eq(schema.expenses.title, 'Sample Transport Expense'));
    if (existingExpense.length === 0) {
      await db.insert(schema.expenses).values({
        branchId: primaryBranchId,
        title: 'Sample Transport Expense',
        category: 'Transport',
        amount: 15000,
        paymentMethod: 'Cash',
        expenseDate: new Date().toISOString().slice(0, 10),
        description: 'Seeded example expense',
        recordedBy: adminUser.id,
      });
    }
  }
}

async function ensureCoreData() {
  const primaryBranchName = 'Evaya Naturals';

  await ensureRoles();
  await ensureBranches();

  const [primaryBranch] = await db.select().from(schema.branches).where(eq(schema.branches.name, primaryBranchName));
  if (!primaryBranch) {
    throw new Error('Primary branch was not created successfully.');
  }

  await ensureAdmin(primaryBranch.id);
  await ensureCategories();
  await ensureBundles();
  await ensureSettings();

  return primaryBranch.id;
}

export async function initializeDatabase() {
  await runMigrations();
  await ensureCoreData();
  console.log('Database initialization complete');
}

export async function seedDatabase() {
  await runMigrations();
  const primaryBranchId = await ensureCoreData();
  await ensureSampleData(primaryBranchId);
  console.log('Database seed complete');
}
