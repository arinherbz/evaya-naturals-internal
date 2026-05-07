import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';
import { sales } from './sales';
import { products } from './products';
import { batches } from './batches';

export const saleItems = sqliteTable('sale_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  saleId: text('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => products.id),
  batchId: text('batch_id').notNull().references(() => batches.id),
  quantity: integer('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  discount: real('discount').notNull().default(0),
  total: real('total').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type SaleItem = typeof saleItems.$inferSelect;
export type NewSaleItem = typeof saleItems.$inferInsert;