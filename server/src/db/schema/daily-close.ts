import { pgTable, text, doublePrecision } from 'drizzle-orm/pg-core';
import { branches } from './branches.js';
import { users } from './users.js';
import { shifts } from './shifts.js';

export const dailyCloses = pgTable('daily_closes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  branchId: text('branch_id').notNull().references(() => branches.id),
  cashierId: text('cashier_id').notNull().references(() => users.id),
  shiftId: text('shift_id').references(() => shifts.id),
  closeDate: text('close_date').notNull(), // YYYY-MM-DD format
  cashExpected: doublePrecision('cash_expected').notNull(),
  cashCounted: doublePrecision('cash_counted').notNull(),
  mtnMobileMoney: doublePrecision('mtn_mobile_money').notNull().default(0),
  airtelMobileMoney: doublePrecision('airtel_mobile_money').notNull().default(0),
  cardPayments: doublePrecision('card_payments').notNull().default(0),
  bankTransfers: doublePrecision('bank_transfers').notNull().default(0),
  difference: doublePrecision('difference').notNull(),
  notes: text('notes'),
  status: text('status').notNull().default('pending'), // pending, approved, discrepant
  approvedBy: text('approved_by').references(() => users.id),
  approvedAt: text('approved_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type DailyClose = typeof dailyCloses.$inferSelect;
export type NewDailyClose = typeof dailyCloses.$inferInsert;
