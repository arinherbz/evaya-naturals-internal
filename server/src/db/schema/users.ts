import { pgTable, text, boolean } from 'drizzle-orm/pg-core';
import { roles } from './roles';
import { branches } from './branches';

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phone: text('phone'),
  roleId: text('role_id').notNull().references(() => roles.id),
  branchId: text('branch_id').references(() => branches.id),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: text('last_login_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
