import { Context, Hono } from 'hono';
import { and, asc, eq, ne } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db';
import * as schema from '../db/schema';
import { getAppSettings, updateAppSettings } from '../lib/app-settings';

const settingsRoutes = new Hono();

const businessProfileSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  logoDataUrl: z.string().max(2_000_000).nullable().optional(),
  phone: z.string().trim().min(7).max(40),
  email: z.string().email(),
  address: z.string().trim().max(200).nullable().optional(),
});

const systemSettingsSchema = z.object({
  expiryAlertDays: z.number().int().min(1).max(365),
  lowStockDefaultThreshold: z.number().int().min(1).max(1000),
  receiptFooterMessage: z.string().trim().max(200).nullable().optional(),
  reportFooterMessage: z.string().trim().max(200).nullable().optional(),
});

const paymentMethodsSchema = z.object({
  cash: z.boolean(),
  mtn_mobile_money: z.boolean(),
  airtel_money: z.boolean(),
  bank_card: z.boolean(),
  bank_transfer: z.boolean(),
}).refine((value) => Object.values(value).some(Boolean), {
  message: 'Enable at least one payment method',
});

const staffCreateSchema = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email: z.string().email(),
  phone: z.string().trim().max(40).nullable().optional(),
  roleId: z.string().uuid(),
  password: z.string().min(6).max(100),
  isActive: z.boolean().default(true),
});

const staffUpdateSchema = z.object({
  firstName: z.string().trim().min(2).max(60).optional(),
  lastName: z.string().trim().min(2).max(60).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  roleId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

const passwordResetSchema = z.object({
  password: z.string().min(6).max(100),
});

function requireAdmin(c: Context) {
  const user = c.get('user');
  if (user.role.name !== 'Admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return null;
}

async function getPrimaryBranchId() {
  const [branch] = await db.select({ id: schema.branches.id })
    .from(schema.branches)
    .where(eq(schema.branches.name, 'Evaya Naturals'));
  return branch?.id ?? null;
}

async function listStaffUsers() {
  return db.select({
    id: schema.users.id,
    firstName: schema.users.firstName,
    lastName: schema.users.lastName,
    email: schema.users.email,
    phone: schema.users.phone,
    roleId: schema.users.roleId,
    branchId: schema.users.branchId,
    isActive: schema.users.isActive,
    lastLoginAt: schema.users.lastLoginAt,
    createdAt: schema.users.createdAt,
    updatedAt: schema.users.updatedAt,
    role: {
      id: schema.roles.id,
      name: schema.roles.name,
      permissions: schema.roles.permissions,
    },
  })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .orderBy(asc(schema.users.isActive), asc(schema.users.firstName), asc(schema.users.lastName));
}

settingsRoutes.get('/public', async (c) => {
  const settings = await getAppSettings();
  return c.json({
    businessProfile: {
      businessName: settings.businessName,
      logoDataUrl: settings.logoDataUrl,
      phone: settings.phone,
      email: settings.email,
      address: settings.address,
      currency: settings.currency,
    },
    systemSettings: {
      expiryAlertDays: settings.expiryAlertDays,
      lowStockDefaultThreshold: settings.lowStockDefaultThreshold,
      receiptFooterMessage: settings.receiptFooterMessage,
      reportFooterMessage: settings.reportFooterMessage,
    },
    paymentMethods: settings.paymentMethods,
  });
});

settingsRoutes.use('*', authMiddleware);

settingsRoutes.get('/', async (c) => {
  const adminCheck = requireAdmin(c);
  if (adminCheck) return adminCheck;

  const settings = await getAppSettings();
  const roles = await db.select({
    id: schema.roles.id,
    name: schema.roles.name,
    description: schema.roles.description,
    permissions: schema.roles.permissions,
    isActive: schema.roles.isActive,
  })
    .from(schema.roles)
    .where(eq(schema.roles.isActive, true))
    .orderBy(asc(schema.roles.name));
  const users = await listStaffUsers();

  return c.json({
    businessProfile: {
      businessName: settings.businessName,
      logoDataUrl: settings.logoDataUrl,
      phone: settings.phone,
      email: settings.email,
      address: settings.address,
      currency: settings.currency,
    },
    systemSettings: {
      expiryAlertDays: settings.expiryAlertDays,
      lowStockDefaultThreshold: settings.lowStockDefaultThreshold,
      receiptFooterMessage: settings.receiptFooterMessage,
      reportFooterMessage: settings.reportFooterMessage,
    },
    paymentMethods: settings.paymentMethods,
    roles,
    users,
  });
});

settingsRoutes.patch('/business-profile', async (c) => {
  const adminCheck = requireAdmin(c);
  if (adminCheck) return adminCheck;

  const payload = businessProfileSchema.parse(await c.req.json());
  const settings = await updateAppSettings({
    businessName: payload.businessName,
    logoDataUrl: payload.logoDataUrl ?? null,
    phone: payload.phone,
    email: payload.email,
    address: payload.address ?? '',
  });
  return c.json({ businessProfile: settings });
});

settingsRoutes.patch('/system', async (c) => {
  const adminCheck = requireAdmin(c);
  if (adminCheck) return adminCheck;

  const payload = systemSettingsSchema.parse(await c.req.json());
  const settings = await updateAppSettings({
    expiryAlertDays: payload.expiryAlertDays,
    lowStockDefaultThreshold: payload.lowStockDefaultThreshold,
    receiptFooterMessage: payload.receiptFooterMessage ?? '',
    reportFooterMessage: payload.reportFooterMessage ?? '',
  });
  return c.json({ systemSettings: settings });
});

settingsRoutes.patch('/payment-methods', async (c) => {
  const adminCheck = requireAdmin(c);
  if (adminCheck) return adminCheck;

  const payload = paymentMethodsSchema.parse(await c.req.json());
  const settings = await updateAppSettings({ paymentMethods: payload });
  return c.json({ paymentMethods: settings.paymentMethods });
});

settingsRoutes.post('/staff', async (c) => {
  const adminCheck = requireAdmin(c);
  if (adminCheck) return adminCheck;

  const payload = staffCreateSchema.parse(await c.req.json());
  const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, payload.email));
  if (existing.length > 0) {
    return c.json({ error: 'Email already exists' }, 409);
  }

  const role = await db.select().from(schema.roles).where(and(eq(schema.roles.id, payload.roleId), eq(schema.roles.isActive, true)));
  if (role.length === 0) {
    return c.json({ error: 'Role not found' }, 404);
  }

  const branchId = await getPrimaryBranchId();
  const passwordHash = await bcrypt.hash(payload.password, 10);
  const [created] = await db.insert(schema.users).values({
    email: payload.email,
    passwordHash,
    firstName: payload.firstName,
    lastName: payload.lastName,
    phone: payload.phone ?? null,
    roleId: payload.roleId,
    branchId,
    isActive: payload.isActive,
  }).returning();

  const [user] = await db.select({
    id: schema.users.id,
    firstName: schema.users.firstName,
    lastName: schema.users.lastName,
    email: schema.users.email,
    phone: schema.users.phone,
    roleId: schema.users.roleId,
    branchId: schema.users.branchId,
    isActive: schema.users.isActive,
    lastLoginAt: schema.users.lastLoginAt,
    createdAt: schema.users.createdAt,
    updatedAt: schema.users.updatedAt,
    role: {
      id: schema.roles.id,
      name: schema.roles.name,
      permissions: schema.roles.permissions,
    },
  })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .where(eq(schema.users.id, created.id));

  return c.json({ user }, 201);
});

settingsRoutes.patch('/staff/:id', async (c) => {
  const adminCheck = requireAdmin(c);
  if (adminCheck) return adminCheck;

  const currentUser = c.get('user');
  const userId = c.req.param('id');
  const payload = staffUpdateSchema.parse(await c.req.json());
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!existing) {
    return c.json({ error: 'User not found' }, 404);
  }

  if (payload.email && payload.email !== existing.email) {
    const duplicate = await db.select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.email, payload.email), ne(schema.users.id, userId)));
    if (duplicate.length > 0) {
      return c.json({ error: 'Email already exists' }, 409);
    }
  }

  if (payload.roleId) {
    const role = await db.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.id, payload.roleId));
    if (role.length === 0) {
      return c.json({ error: 'Role not found' }, 404);
    }
  }

  if (payload.isActive === false && currentUser.id === userId) {
    return c.json({ error: 'You cannot deactivate your own account' }, 400);
  }

  await db.update(schema.users)
    .set({
      firstName: payload.firstName ?? existing.firstName,
      lastName: payload.lastName ?? existing.lastName,
      email: payload.email ?? existing.email,
      phone: payload.phone === undefined ? existing.phone : payload.phone,
      roleId: payload.roleId ?? existing.roleId,
      isActive: payload.isActive ?? existing.isActive,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.users.id, userId));

  const [user] = await db.select({
    id: schema.users.id,
    firstName: schema.users.firstName,
    lastName: schema.users.lastName,
    email: schema.users.email,
    phone: schema.users.phone,
    roleId: schema.users.roleId,
    branchId: schema.users.branchId,
    isActive: schema.users.isActive,
    lastLoginAt: schema.users.lastLoginAt,
    createdAt: schema.users.createdAt,
    updatedAt: schema.users.updatedAt,
    role: {
      id: schema.roles.id,
      name: schema.roles.name,
      permissions: schema.roles.permissions,
    },
  })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .where(eq(schema.users.id, userId));

  return c.json({ user });
});

settingsRoutes.post('/staff/:id/reset-password', async (c) => {
  const adminCheck = requireAdmin(c);
  if (adminCheck) return adminCheck;

  const userId = c.req.param('id');
  const payload = passwordResetSchema.parse(await c.req.json());
  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId));
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  const passwordHash = await bcrypt.hash(payload.password, 10);
  await db.update(schema.users)
    .set({
      passwordHash,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.users.id, userId));

  return c.json({ message: 'Password reset' });
});

export default settingsRoutes;
