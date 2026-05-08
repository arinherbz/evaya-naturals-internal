import { pgTable, text, doublePrecision, integer, boolean } from 'drizzle-orm/pg-core';
import { categories } from './categories';

export const products = pgTable('products', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  sku: text('sku').unique(),
  barcode: text('barcode').unique(),
  categoryId: text('category_id').notNull().references(() => categories.id),
  unitType: text('unit_type').notNull().default('piece'), // piece, kg, g, ml, L, box
  sellingPrice: doublePrecision('selling_price').notNull(),
  costPrice: doublePrecision('cost_price'),
  description: text('description'),
  usageInstructions: text('usage_instructions'),
  ingredients: text('ingredients'),
  allergyWarning: text('allergy_warning'),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(10),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
