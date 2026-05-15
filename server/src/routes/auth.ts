import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema/index.js';
import { authMiddleware, invalidateSessionCache } from '../middleware/auth.js';
import { appEnv, logServerError } from '../env.js';
import { generateSessionToken, getRequestIp, getSessionExpiryIso, loginRateLimiter, parseBearerToken } from '../lib/auth-security.js';

const authRoutes = new Hono();

// Login schema
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid login request' }, 400);
    }

    const { email, password } = parsed.data;
    const rateLimitKey = `${getRequestIp(c)}:${email.trim().toLowerCase()}`;
    if (process.env.NODE_ENV !== 'test' && loginRateLimiter.isBlocked(rateLimitKey)) {
      return c.json({ error: 'Too many login attempts. Please try again later.' }, 429);
    }

    // Find user by email
    const users = await db.select().from(schema.users).where(eq(schema.users.email, email));
    
    if (users.length === 0) {
      loginRateLimiter.recordFailure(rateLimitKey);
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
      loginRateLimiter.recordFailure(rateLimitKey);
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Create session token
    const token = generateSessionToken();
    const expiresAt = getSessionExpiryIso();

    // Create session
    await db.insert(schema.sessions).values({
      userId: user.id,
      token,
      expiresAt,
      ipAddress: getRequestIp(c),
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

    if (userDetails.length === 0 || !userDetails[0].role || userDetails[0].role.name == null) {
      return c.json({ error: 'Account role is not available' }, 401);
    }

    const [roleRecord] = await db.select({ isActive: schema.roles.isActive })
      .from(schema.roles)
      .where(eq(schema.roles.id, userDetails[0].role.id));
    if (!roleRecord?.isActive) {
      return c.json({ error: 'Account is deactivated' }, 401);
    }

    loginRateLimiter.reset(rateLimitKey);

    // Log audit
    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'login',
      entityType: 'user',
      entityId: user.id,
      ipAddress: getRequestIp(c),
      userAgent: c.req.header('User-Agent'),
    });

    return c.json({
      message: 'Login successful',
      token,
      expiresAt,
      user: userDetails[0],
    });
  } catch (error) {
    logServerError('Login', error);
    return c.json({ error: appEnv.isProduction ? 'Internal server error' : 'Login failed' }, 500);
  }
});

// POST /api/auth/logout
authRoutes.post('/logout', authMiddleware, async (c) => {
  try {
    const sessionToken = parseBearerToken(c.req.header('Authorization'));
    const user = c.get('user');

    if (sessionToken) {
      // Invalidate session in DB and evict from in-memory cache
      await db.update(schema.sessions)
        .set({ isActive: false })
        .where(eq(schema.sessions.token, sessionToken));
      invalidateSessionCache(sessionToken);
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
