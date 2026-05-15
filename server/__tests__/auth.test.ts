import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { db } from '../src/db';
import { users, roles, branches, sessions } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import app from '../src/index';
import { loginRateLimiter } from '../src/lib/auth-security';
import { resolveAdminBootstrapPassword } from '../src/db/init';

describe('Authentication System', () => {
  beforeAll(async () => {
    // Tables should already exist from db initialization
  });

  beforeEach(() => {
    loginRateLimiter.clear();
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

  it('rate limits repeated failed login attempts', async () => {
    for (let index = 0; index < 5; index += 1) {
      const response = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.10',
        },
        body: JSON.stringify({ email: 'admin@evaya.ug', password: 'wrongpass123' }),
      });

      expect(response.status).toBe(401);
    }

    const blockedResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify({ email: 'admin@evaya.ug', password: 'wrongpass123' }),
    });

    expect(blockedResponse.status).toBe(429);
    expect(await blockedResponse.json()).toEqual({ error: 'Too many login attempts. Please try again later.' });
  });

  it('returns a generic validation error for malformed login requests', async () => {
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'not-an-email', password: 'short' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid login request' });
  });

  it('marks expired sessions inactive and rejects them', async () => {
    const adminUser = await db
      .select()
      .from(users)
      .where(eq(users.email, 'admin@evaya.ug'))
      .get();

    expect(adminUser).toBeDefined();

    const inserted = await db.insert(sessions).values({
      userId: adminUser!.id,
      token: 'expired-session-token',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      isActive: true,
    }).returning();

    const response = await app.request('/api/auth/me', {
      headers: {
        Authorization: 'Bearer expired-session-token',
      },
    });

    expect(response.status).toBe(401);

    const session = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, inserted[0].id))
      .get();

    expect(session?.isActive).toBe(false);
  });

  it('requires a secure production bootstrap password for the initial admin account', () => {
    expect(resolveAdminBootstrapPassword({ isProduction: false, configuredPassword: undefined })).toBe('admin123');
    expect(resolveAdminBootstrapPassword({ isProduction: false, configuredPassword: 'custom-dev-password' })).toBe('custom-dev-password');
    expect(resolveAdminBootstrapPassword({ isProduction: true, configuredPassword: 'very-secure-bootstrap-password' })).toBe('very-secure-bootstrap-password');
    expect(() => resolveAdminBootstrapPassword({ isProduction: true, configuredPassword: undefined }))
      .toThrow('Production requires ADMIN_BOOTSTRAP_PASSWORD before the initial admin account can be created.');
  });
});
