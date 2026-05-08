import { sqliteTable, text, real } from 'drizzle-orm/sqlite-core';
import { branches } from './branches';
import { users } from './users';

export const dailyCloses = sqliteTable('daily_closes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  branchId: text('branch_id').notNull().references(() => branches.id),
  cashierId: text('cashier_id').notNull().references(() => users.id),
  closeDate: text('close_date').notNull(), // YYYY-MM-DD format
  cashExpected: real('cash_expected').notNull(),
  cashCounted: real('cash_counted').notNull(),
  mtnMobileMoney: real('mtn_mobile_money').notNull().default(0),
  airtelMobileMoney: real('airtel_mobile_money').notNull().default(0),
  cardPayments: real('card_payments').notNull().default(0),
  bankTransfers: real('bank_transfers').notNull().default(0),
  difference: real('difference').notNull(),
  notes: text('notes'),
  status: text('status').notNull().default('pending'), // pending, approved, discrepant
  approvedBy: text('approved_by').references(() => users.id),
  approvedAt: text('approved_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type DailyClose = typeof dailyCloses.$inferSelect;
export type NewDailyClose = typeof dailyCloses.$inferInsert;
