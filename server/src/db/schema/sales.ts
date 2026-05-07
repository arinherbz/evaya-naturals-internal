import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';
import { branches } from './branches';
import { users } from './users';
import { customers } from './customers';

export const sales = sqliteTable('sales', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  receiptNumber: text('receipt_number').notNull().unique(),
  branchId: text('branch_id').notNull().references(() => branches.id),
  cashierId: text('cashier_id').notNull().references(() => users.id),
  customerId: text('customer_id').references(() => customers.id),
  subtotal: real('subtotal').notNull(),
  discount: real('discount').notNull().default(0),
  total: real('total').notNull(),
  paymentMethod: text('payment_method').notNull(), // cash, mtn_mobile_money, airtel_money, bank_card, bank_transfer
  paymentReference: text('payment_reference'), // for mobile money transactions
  status: text('status').notNull().default('completed'), // completed, refunded, cancelled
  notes: text('notes'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;