import { pgTable, text, boolean } from 'drizzle-orm/pg-core';

export const customers = pgTable('customers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  whatsappNumber: text('whatsapp_number'),
  email: text('email'),
  location: text('location'),
  address: text('address'),
  wellnessInterests: text('wellness_interests'), // JSON array of interests/goals
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
