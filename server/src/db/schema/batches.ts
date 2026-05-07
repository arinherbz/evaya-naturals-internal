import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';
import { products } from './products';
import { suppliers } from './suppliers';
import { branches } from './branches';

export const batches = sqliteTable('batches', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  batchNumber: text('batch_number').notNull(),
  productId: text('product_id').notNull().references(() => products.id),
  supplierId: text('supplier_id').references(() => suppliers.id),
  branchId: text('branch_id').notNull().references(() => branches.id),
  expiryDate: text('expiry_date').notNull(),
  quantityReceived: integer('quantity_received').notNull(),
  quantityRemaining: integer('quantity_remaining').notNull(),
  costPrice: real('cost_price').notNull(),
  sellingPrice: real('selling_price'),
  receivedDate: text('received_date').notNull().$defaultFn(() => new Date().toISOString()),
  isExpired: integer('is_expired', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;