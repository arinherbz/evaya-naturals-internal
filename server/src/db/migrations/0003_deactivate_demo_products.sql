UPDATE "products"
SET
  "is_active" = false,
  "updated_at" = NOW()::text
WHERE lower("name") IN (
  'moringa powder',
  'mullien leaf',
  'turmeric butter',
  'whipped body butter',
  'tag relief soap'
)
AND NOT EXISTS (
  SELECT 1
  FROM "sale_items"
  WHERE "sale_items"."product_id" = "products"."id"
);
