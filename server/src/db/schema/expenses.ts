import { pgTable, text, integer } from 'drizzle-orm/pg-core';
import { branches } from './branches';
import { users } from './users';

export const expenses = pgTable('expenses', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  branchId: text('branch_id').notNull().references(() => branches.id),
  title: text('title').notNull(),
  category: text('category').notNull(),
  amount: integer('amount').notNull(),
  paymentMethod: text('payment_method').notNull(),
  expenseDate: text('expense_date').notNull(),
  description: text('description'),
  recordedBy: text('recorded_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
