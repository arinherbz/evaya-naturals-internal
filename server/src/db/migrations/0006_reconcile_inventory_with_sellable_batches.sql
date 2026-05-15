INSERT INTO "inventory" ("product_id", "branch_id", "quantity", "low_stock_threshold", "created_at", "updated_at")
SELECT
  b.product_id,
  b.branch_id,
  COALESCE(SUM(CASE WHEN b.quantity_remaining > 0 AND b.expiry_date::timestamp >= NOW() THEN b.quantity_remaining ELSE 0 END), 0) AS quantity,
  COALESCE(MAX(p.low_stock_threshold), 0) AS low_stock_threshold,
  NOW()::text,
  NOW()::text
FROM "batches" b
INNER JOIN "products" p ON p.id = b.product_id
LEFT JOIN "inventory" i ON i.product_id = b.product_id AND i.branch_id = b.branch_id
WHERE i.id IS NULL
GROUP BY b.product_id, b.branch_id;
--> statement-breakpoint

WITH sellable_batches AS (
  SELECT
    b.product_id,
    b.branch_id,
    COALESCE(SUM(CASE WHEN b.quantity_remaining > 0 AND b.expiry_date::timestamp >= NOW() THEN b.quantity_remaining ELSE 0 END), 0) AS sellable_quantity
  FROM "batches" b
  GROUP BY b.product_id, b.branch_id
)
UPDATE "inventory" i
SET
  "quantity" = sb.sellable_quantity,
  "updated_at" = NOW()::text
FROM sellable_batches sb
WHERE i.product_id = sb.product_id
  AND i.branch_id = sb.branch_id
  AND i.quantity <> sb.sellable_quantity;
