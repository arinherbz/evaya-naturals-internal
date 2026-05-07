import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/db';
import { users, roles, branches } from '../src/db/schema';
import { eq } from 'drizzle-orm';

describe('Authentication System', () => {
  beforeAll(async () => {
    // Tables should already exist from db initialization
  });

  afterAll(async () => {
    // Clean up if needed
  });

  it('should have Admin role created', async () => {
    const adminRole = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'Admin'))
      .get();

    expect(adminRole).toBeDefined();
    expect(adminRole?.name).toBe('Admin');
  });

  it('should have default branches created', async () => {
    const branchesList = await db.select().from(branches).all();

    expect(branchesList.length).toBeGreaterThanOrEqual(3);

    const branchNames = branchesList.map((b) => b.name);
    expect(branchNames).toContain('Evaya Naturals');
    expect(branchNames).toContain('Evaya Beauty');
    expect(branchNames).toContain('Evaya World');
  });

  it('should have admin user created', async () => {
    const adminUser = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        roleId: users.roleId,
      })
      .from(users)
      .where(eq(users.email, 'admin@evaya.ug'))
      .get();

    expect(adminUser).toBeDefined();
    expect(adminUser?.email).toBe('admin@evaya.ug');
    expect(adminUser?.roleId).toBe('1'); // Admin role ID
  });

  it('should have all required roles', async () => {
    const allRoles = await db.select().from(roles).all();
    const roleNames = allRoles.map((r) => r.name);

    const requiredRoles = [
      'Admin',
      'Branch Manager',
      'Cashier',
      'Inventory Officer',
      'Delivery Rider',
      'Accountant',
    ];

    requiredRoles.forEach((role) => {
      expect(roleNames).toContain(role);
    });
  });
});