import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { db } from '../src/db';
import { users, roles, branches } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import app from '../src/index';

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

  it('should have only the active operational roles', async () => {
    const allRoles = await db.select().from(roles).all();
    const activeRoleNames = allRoles.filter((r) => r.isActive).map((r) => r.name);

    const requiredRoles = [
      'Admin',
      'Branch Manager',
      'Cashier',
    ];

    requiredRoles.forEach((role) => {
      expect(activeRoleNames).toContain(role);
    });
    expect(activeRoleNames).not.toContain('Inventory Officer');
    expect(activeRoleNames).not.toContain('Delivery Rider');
    expect(activeRoleNames).not.toContain('Accountant');
  });

  it('should block login for users assigned to inactive roles', async () => {
    const inactiveRole = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'Delivery Rider'))
      .get();

    expect(inactiveRole).toBeDefined();
    expect(inactiveRole?.isActive).toBe(false);

    await db.delete(users).where(eq(users.email, 'inactive-role-auth@evaya.ug'));
    const passwordHash = await bcrypt.hash('secret123', 10);
    await db.insert(users).values({
      email: 'inactive-role-auth@evaya.ug',
      passwordHash,
      firstName: 'Inactive',
      lastName: 'Role',
      roleId: inactiveRole!.id,
      branchId: null,
      isActive: true,
    });

    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'inactive-role-auth@evaya.ug', password: 'secret123' }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Account is deactivated' });
  });
});
