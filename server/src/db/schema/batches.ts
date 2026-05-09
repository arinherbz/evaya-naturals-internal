import { pgTable, text, doublePrecision, integer, boolean } from 'drizzle-orm/pg-core';
import { products } from './products.js';
import { suppliers } from './suppliers.js';
import { branches } from './branches.js';

export const batches = pgTable('batches', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  batchNumber: text('batch_number').notNull(),
  productId: text('product_id').notNull().references(() => products.id),
  supplierId: text('supplier_id').references(() => suppliers.id),
  branchId: text('branch_id').notNull().references(() => branches.id),
  expiryDate: text('expiry_date').notNull(),
  quantityReceived: integer('quantity_received').notNull(),
  quantityRemaining: integer('quantity_remaining').notNull(),
  costPrice: doublePrecision('cost_price').notNull(),
  sellingPrice: doublePrecision('selling_price'),
  receivedDate: text('received_date').notNull().$defaultFn(() => new Date().toISOString()),
  isExpired: boolean('is_expired').notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;
