import { eq } from 'drizzle-orm';
import { db } from './index';
import * as schema from './schema/index';
import bcrypt from 'bcryptjs';

export async function initializeDatabase() {
  // Create default roles if they don't exist
  const defaultRoles = [
    {
      name: 'Admin',
      description: 'Full system access',
      permissions: ['*'],
    },
    {
      name: 'Branch Manager',
      description: 'Manage branch operations',
      permissions: ['view_dashboard', 'manage_sales', 'manage_inventory', 'view_reports', 'manage_staff', 'daily_close'],
    },
    {
      name: 'Cashier',
      description: 'Process sales and handle cash-up',
      permissions: ['view_dashboard', 'process_sales', 'daily_close'],
    },
    {
      name: 'Inventory Officer',
      description: 'Manage stock and inventory',
      permissions: ['view_dashboard', 'manage_inventory', 'receive_stock', 'manage_transfers'],
    },
    {
      name: 'Delivery Rider',
      description: 'Handle deliveries',
      permissions: ['view_deliveries', 'update_delivery_status'],
    },
    {
      name: 'Accountant',
      description: 'Manage finances and reports',
      permissions: ['view_dashboard', 'view_reports', 'daily_close', 'manage_accounts'],
    },
  ];

  for (const role of defaultRoles) {
    const existing = await db.select().from(schema.roles).where(eq(schema.roles.name, role.name));
    if (existing.length === 0) {
      await db.insert(schema.roles).values(role);
      console.log(`Created role: ${role.name}`);
    }
  }

  // Create default branches if they don't exist
  const defaultBranches = [
    { name: 'Evaya Naturals', code: 'EN001', address: 'Kampala, Uganda', phone: '+256 700 000 001' },
    { name: 'Evaya Beauty', code: 'EB002', address: 'Entebbe, Uganda', phone: '+256 700 000 002' },
    { name: 'Evaya World', code: 'EW003', address: 'Jinja, Uganda', phone: '+256 700 000 003' },
  ];

  for (const branch of defaultBranches) {
    const existing = await db.select().from(schema.branches).where(eq(schema.branches.name, branch.name));
    if (existing.length === 0) {
      await db.insert(schema.branches).values(branch);
      console.log(`Created branch: ${branch.name}`);
    }
  }

  // Create default admin user if doesn't exist
  const adminRole = await db.select().from(schema.roles).where(eq(schema.roles.name, 'Admin'));
  if (adminRole.length > 0) {
    const existingAdmin = await db.select().from(schema.users).where(eq(schema.users.email, 'admin@evaya.ug'));
    if (existingAdmin.length === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await db.insert(schema.users).values({
        email: 'admin@evaya.ug',
        passwordHash,
        firstName: 'System',
        lastName: 'Administrator',
        roleId: adminRole[0].id,
        phone: '+256 700 000 000',
      });
      console.log('Created admin user: admin@evaya.ug (password: admin123)');
    }
  }

  // Create default categories if they don't exist
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
      console.log(`Created category: ${categoryName}`);
    }
  }

  console.log('Database initialization complete');
}