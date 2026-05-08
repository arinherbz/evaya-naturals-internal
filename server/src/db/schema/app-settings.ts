import { pgTable, text, integer, jsonb } from 'drizzle-orm/pg-core';

export const appSettings = pgTable('app_settings', {
  id: text('id').primaryKey(),
  businessName: text('business_name').notNull(),
  logoDataUrl: text('logo_data_url'),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  address: text('address'),
  currency: text('currency').notNull().default('UGX'),
  expiryAlertDays: integer('expiry_alert_days').notNull().default(30),
  lowStockDefaultThreshold: integer('low_stock_default_threshold').notNull().default(5),
  receiptFooterMessage: text('receipt_footer_message'),
  reportFooterMessage: text('report_footer_message'),
  paymentMethods: jsonb('payment_methods')
    .$type<Record<string, boolean>>()
    .notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type NewAppSettings = typeof appSettings.$inferInsert;
