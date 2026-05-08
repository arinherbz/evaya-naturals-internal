import { Context, Next } from 'hono';
import { db } from '../db/index';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema/index';

// User type for context
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  branchId: string | null;
  role: {
    id: string;
    name: string;
    permissions: string[];
  };
  branch: {
    id: string;
    name: string;
    code: string;
  } | null;
}

// Simple session-based auth middleware
export const authMiddleware = async (c: Context, next: Next) => {
  const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (!sessionToken) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    // Look up session in database
    const sessions = await db.select().from(schema.sessions).where(
      and(
        eq(schema.sessions.token, sessionToken),
        eq(schema.sessions.isActive, true)
      )
    );

    if (sessions.length === 0) {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }

    const session = sessions[0];
    
    // Get user with role and branch info
    const users = await db.select({
      id: schema.users.id,
      email: schema.users.email,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
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
    .where(eq(schema.users.id, session.userId));

    if (users.length === 0) {
      return c.json({ error: 'User not found' }, 401);
    }

    const user = users[0];
    
    // Ensure role is not null (should always exist for valid users)
    if (!user.role) {
      return c.json({ error: 'User role not found' }, 401);
    }

    // Attach user to context
    c.set('user', user as AuthUser);
    
    return next();
  } catch (error) {
    console.error('Auth error:', error);
    return c.json({ error: 'Authentication failed' }, 500);
  }
};

// Permission check middleware
export const requirePermission = (permission: string) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Admin has all permissions
    if (user.role.name === 'Admin') {
      return next();
    }

    const permissions = user.role.permissions || [];
    
    if (permissions.includes('*') || permissions.includes(permission)) {
      return next();
    }

    return c.json({ error: 'Forbidden' }, 403);
  };
};

// Branch scoping middleware
export const requireBranchAccess = (branchId?: string) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Admin can access all branches
    if (user.role.name === 'Admin') {
      return next();
    }

    // Non-admin users can only access their assigned branch
    if (branchId && user.branchId !== branchId) {
      return c.json({ error: 'Access denied to this branch' }, 403);
    }

    return next();
  };
};

// Type extensions for Hono context
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}
