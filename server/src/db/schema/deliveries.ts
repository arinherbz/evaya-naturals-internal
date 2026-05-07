import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { branches } from './branches';
import { users } from './users';
import { customers } from './customers';

export const deliveries = sqliteTable('deliveries', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  saleId: text('sale_id').references(() => sales.id),
  customerId: text('customer_id').notNull().references(() => customers.id),
  branchId: text('branch_id').notNull().references(() => branches.id),
  riderId: text('rider_id').references(() => users.id),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  deliveryAddress: text('delivery_address').notNull(),
  deliveryFee: real('delivery_fee').notNull().default(0),
  status: text('status').notNull().default('pending'), // pending, assigned, picked_up, delivered, failed, cancelled
  notes: text('notes'),
  assignedAt: text('assigned_at'),
  pickedUpAt: text('picked_up_at'),
  deliveredAt: text('delivered_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Fix circular reference with sales
import { sales } from './sales';

export type Delivery = typeof deliveries.$inferSelect;
export type NewDelivery = typeof deliveries.$inferInsert;