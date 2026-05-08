import { pgTable, text, doublePrecision } from 'drizzle-orm/pg-core';
import { branches } from './branches';
import { users } from './users';
import { customers } from './customers';
import { shifts } from './shifts';

export const sales = pgTable('sales', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  receiptNumber: text('receipt_number').notNull().unique(),
  branchId: text('branch_id').notNull().references(() => branches.id),
  cashierId: text('cashier_id').notNull().references(() => users.id),
  shiftId: text('shift_id').references(() => shifts.id),
  customerId: text('customer_id').references(() => customers.id),
  subtotal: doublePrecision('subtotal').notNull(),
  discount: doublePrecision('discount').notNull().default(0),
  total: doublePrecision('total').notNull(),
  paymentMethod: text('payment_method').notNull(), // cash, mtn_mobile_money, airtel_money, bank_card, bank_transfer
  paymentReference: text('payment_reference'), // for mobile money transactions
  status: text('status').notNull().default('completed'), // completed, refunded, cancelled
  notes: text('notes'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
