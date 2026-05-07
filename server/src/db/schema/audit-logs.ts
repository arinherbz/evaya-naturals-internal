import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  action: text('action').notNull(), // create, update, delete, login, logout, etc.
  entityType: text('entity_type').notNull(), // user, product, sale, inventory, etc.
  entityId: text('entity_id'),
  oldValue: text('old_value', { mode: 'json' }).$type<Record<string, unknown>>(),
  newValue: text('new_value', { mode: 'json' }).$type<Record<string, unknown>>(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;