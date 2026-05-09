import { pgTable, text, doublePrecision } from 'drizzle-orm/pg-core';
import { branches } from './branches.js';
import { users } from './users.js';
import { customers } from './customers.js';

export const deliveries = pgTable('deliveries', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  saleId: text('sale_id').references(() => sales.id),
  receiptReference: text('receipt_reference'),
  customerId: text('customer_id').notNull().references(() => customers.id),
  branchId: text('branch_id').notNull().references(() => branches.id),
  riderId: text('rider_id').references(() => users.id),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  deliveryAddress: text('delivery_address').notNull(),
  deliveryFee: doublePrecision('delivery_fee').notNull().default(0),
  status: text('status').notNull().default('pending'), // pending, assigned, picked_up, delivered, failed, cancelled
  deliveryDate: text('delivery_date'),
  notes: text('notes'),
  assignedAt: text('assigned_at'),
  pickedUpAt: text('picked_up_at'),
  deliveredAt: text('delivered_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Fix circular reference with sales
import { sales } from './sales.js';

export type Delivery = typeof deliveries.$inferSelect;
export type NewDelivery = typeof deliveries.$inferInsert;
