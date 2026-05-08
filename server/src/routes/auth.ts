import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db/index';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/index';
import { authMiddleware } from '../middleware/auth';
import { appEnv, logServerError } from '../env';

const authRoutes = new Hono();

// Login schema
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = loginSchema.parse(body);

    // Find user by email
    const users = await db.select().from(schema.users).where(eq(schema.users.email, email));
    
    if (users.length === 0) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const user = users[0];

    // Check if user is active
    if (!user.isActive) {
      return c.json({ error: 'Account is deactivated' }, 401);
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    
    if (!validPassword) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Create session token
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    // Create session
    await db.insert(schema.sessions).values({
      userId: user.id,
      token,
      expiresAt,
      ipAddress: c.req.header('X-Forwarded-For') || c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    // Update last login
    await db.update(schema.users)
      .set({ lastLoginAt: new Date().toISOString() })
      .where(eq(schema.users.id, user.id));

    // Get user role and branch info
    const userDetails = await db.select({
      id: schema.users.id,
      email: schema.users.email,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      phone: schema.users.phone,
      roleId: schema.users.roleId,
      branchId: schema.users.branchId,
      role: {
        id: schema.roles.id,
        name: schema.roles.name,
        permissions: schema.roles.permissions,
      },
      branch: {
        id: schema.branches.id,
        name: schema.branches.name,
        code: schema.branches.code,
      }
    })
    .from(schema.users)
    .leftJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .leftJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
    .where(eq(schema.users.id, user.id));

    // Log audit
    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'login',
      entityType: 'user',
      entityId: user.id,
      ipAddress: c.req.header('X-Forwarded-For') || c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return c.json({
      message: 'Login successful',
      token,
      user: userDetails[0],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    logServerError('Login', error);
    return c.json({ error: appEnv.isProduction ? 'Internal server error' : 'Login failed' }, 500);
  }
});

// POST /api/auth/logout
authRoutes.post('/logout', authMiddleware, async (c) => {
  try {
    const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '');
    const user = c.get('user');

    if (sessionToken) {
      // Invalidate session
      await db.update(schema.sessions)
        .set({ isActive: false })
        .where(eq(schema.sessions.token, sessionToken));
    }

    // Log audit
    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'logout',
      entityType: 'user',
      entityId: user.id,
    });

    return c.json({ message: 'Logout successful' });
  } catch (error) {
    logServerError('Logout', error);
    return c.json({ error: appEnv.isProduction ? 'Internal server error' : 'Logout failed' }, 500);
  }
});

// GET /api/auth/me
authRoutes.get('/me', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    return c.json({ user });
  } catch (error) {
    logServerError('Get current user', error);
    return c.json({ error: appEnv.isProduction ? 'Internal server error' : 'Failed to get user' }, 500);
  }
});

export default authRoutes;
