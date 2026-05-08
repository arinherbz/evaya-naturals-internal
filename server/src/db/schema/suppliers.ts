import { pgTable, text, boolean } from 'drizzle-orm/pg-core';

export const suppliers = pgTable('suppliers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  contactPerson: text('contact_person'),
  phone: text('phone').notNull(),
  whatsappNumber: text('whatsapp_number'),
  email: text('email'),
  location: text('location'),
  address: text('address'),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
