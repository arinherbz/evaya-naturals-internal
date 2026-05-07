import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { branches } from './branches';
import { users } from './users';
import { products } from './products';
import { batches } from './batches';

export const transfers = sqliteTable('transfers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  transferNumber: text('transfer_number').notNull().unique(),
  productId: text('product_id').notNull().references(() => products.id),
  batchId: text('batch_id').references(() => batches.id),
  sourceBranchId: text('source_branch_id').notNull().references(() => branches.id),
  destinationBranchId: text('destination_branch_id').notNull().references(() => branches.id),
  quantity: integer('quantity').notNull(),
  status: text('status').notNull().default('pending'), // pending, approved, in_transit, received, cancelled
  requestedBy: text('requested_by').notNull().references(() => users.id),
  approvedBy: text('approved_by').references(() => users.id),
  receivedBy: text('received_by').references(() => users.id),
  notes: text('notes'),
  requestedAt: text('requested_at').notNull().$defaultFn(() => new Date().toISOString()),
  approvedAt: text('approved_at'),
  receivedAt: text('received_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type Transfer = typeof transfers.$inferSelect;
export type NewTransfer = typeof transfers.$inferInsert;