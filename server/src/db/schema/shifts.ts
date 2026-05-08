import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';
import { branches } from './branches';

export const shifts = sqliteTable('shifts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  cashierId: text('cashier_id').notNull().references(() => users.id),
  branchId: text('branch_id').notNull().references(() => branches.id),
  openingCash: integer('opening_cash').notNull().default(0),
  closingCash: integer('closing_cash'),
  expectedCash: integer('expected_cash'),
  mtnMobileMoneyTotal: integer('mtn_mobile_money_total').notNull().default(0),
  airtelMoneyTotal: integer('airtel_money_total').notNull().default(0),
  cardTotal: integer('card_total').notNull().default(0),
  bankTransferTotal: integer('bank_transfer_total').notNull().default(0),
  variance: integer('variance'),
  openedAt: text('opened_at').notNull().$defaultFn(() => new Date().toISOString()),
  closedAt: text('closed_at'),
  approvedBy: text('approved_by').references(() => users.id),
  approvedAt: text('approved_at'),
  notes: text('notes'),
  status: text('status', { enum: ['active', 'closed', 'approved'] }).notNull().default('active'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;
