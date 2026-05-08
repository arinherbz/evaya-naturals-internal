import { pgTable, text, boolean, jsonb } from 'drizzle-orm/pg-core';

export const roles = pgTable('roles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull().unique(),
  description: text('description'),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
