import { pgTable, text, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { products } from './products.js';
import { branches } from './branches.js';
import { users } from './users.js';

export const inventory = pgTable('inventory', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => products.id),
  branchId: text('branch_id').notNull().references(() => branches.id),
  quantity: integer('quantity').notNull().default(0),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(10),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  inventoryProductBranchUnique: uniqueIndex('inventory_product_branch_unique').on(table.productId, table.branchId),
}));

export const inventoryMovements = pgTable('inventory_movements', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => products.id),
  branchId: text('branch_id').notNull().references(() => branches.id),
  batchId: text('batch_id').references(() => batches.id),
  movementType: text('movement_type').notNull(), // sale, stock_received, stock_transfer_out, stock_transfer_in, adjustment, damaged, expired, returned
  quantity: integer('quantity').notNull(),
  referenceId: text('reference_id'), // sale id, transfer id, etc.
  referenceType: text('reference_type'), // sale, transfer, purchase_order, adjustment
  reason: text('reason'),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Fix the circular reference by importing batches after it's defined
import { batches } from './batches.js';

export type Inventory = typeof inventory.$inferSelect;
export type NewInventory = typeof inventory.$inferInsert;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type NewInventoryMovement = typeof inventoryMovements.$inferInsert;
