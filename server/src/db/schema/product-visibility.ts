import { pgTable, text } from 'drizzle-orm/pg-core';
import { products } from './products.js';
import { branches } from './branches.js';

export const productVisibility = pgTable('product_visibility', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  branchId: text('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type ProductVisibility = typeof productVisibility.$inferSelect;
export type NewProductVisibility = typeof productVisibility.$inferInsert;
