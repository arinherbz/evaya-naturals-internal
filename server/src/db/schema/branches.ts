import { pgTable, text, boolean } from 'drizzle-orm/pg-core';

export const branches = pgTable('branches', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull().unique(),
  code: text('code').notNull().unique(),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
