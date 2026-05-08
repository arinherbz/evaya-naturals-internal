import { pgTable, text, integer, boolean } from 'drizzle-orm/pg-core';
import { products } from './products';

export const bundles = pgTable('bundles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  description: text('description'),
  sellingPrice: integer('selling_price').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type Bundle = typeof bundles.$inferSelect;
export type NewBundle = typeof bundles.$inferInsert;

export const bundleItems = pgTable('bundle_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bundleId: text('bundle_id').notNull().references(() => bundles.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull().default(1),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type BundleItem = typeof bundleItems.$inferSelect;
export type NewBundleItem = typeof bundleItems.$inferInsert;
