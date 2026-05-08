import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const broadcasts = sqliteTable('broadcasts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  channel: text('channel', { enum: ['whatsapp', 'sms'] }).notNull(),
  messageBody: text('message_body').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  recipientCount: integer('recipient_count').notNull().default(0),
  status: text('status', { enum: ['prepared', 'sent', 'failed', 'provider_not_configured'] }).notNull().default('prepared'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type Broadcast = typeof broadcasts.$inferSelect;
export type NewBroadcast = typeof broadcasts.$inferInsert;
