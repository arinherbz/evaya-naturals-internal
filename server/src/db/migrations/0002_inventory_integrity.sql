WITH ranked_inventory AS (
  SELECT
    id,
    product_id,
    branch_id,
    created_at,
    updated_at,
    FIRST_VALUE(id) OVER (
      PARTITION BY product_id, branch_id
      ORDER BY created_at, id
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY product_id, branch_id
      ORDER BY created_at, id
    ) AS row_num,
    SUM(quantity) OVER (PARTITION BY product_id, branch_id) AS merged_quantity,
    MAX(low_stock_threshold) OVER (PARTITION BY product_id, branch_id) AS merged_threshold,
    MAX(updated_at) OVER (PARTITION BY product_id, branch_id) AS merged_updated_at
  FROM inventory
),
inventory_keepers AS (
  SELECT DISTINCT ON (keep_id)
    keep_id,
    GREATEST(merged_quantity, 0) AS merged_quantity,
    merged_threshold,
    merged_updated_at
  FROM ranked_inventory
  ORDER BY keep_id, row_num
)
UPDATE inventory AS target
SET
  quantity = inventory_keepers.merged_quantity,
  low_stock_threshold = inventory_keepers.merged_threshold,
  updated_at = inventory_keepers.merged_updated_at
FROM inventory_keepers
WHERE target.id = inventory_keepers.keep_id;
--> statement-breakpoint
WITH ranked_inventory AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY product_id, branch_id
      ORDER BY created_at, id
    ) AS row_num
  FROM inventory
)
DELETE FROM inventory
WHERE id IN (
  SELECT id
  FROM ranked_inventory
  WHERE row_num > 1
);
--> statement-breakpoint
WITH ranked_visibility AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY product_id, branch_id
      ORDER BY created_at, id
    ) AS row_num
  FROM product_visibility
)
DELETE FROM product_visibility
WHERE id IN (
  SELECT id
  FROM ranked_visibility
  WHERE row_num > 1
);
--> statement-breakpoint
WITH ranked_batches AS (
  SELECT
    id,
    product_id,
    branch_id,
    batch_number,
    expiry_date,
    received_date,
    updated_at,
    FIRST_VALUE(id) OVER (
      PARTITION BY product_id, branch_id, batch_number
      ORDER BY received_date, created_at, id
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY product_id, branch_id, batch_number
      ORDER BY received_date, created_at, id
    ) AS row_num,
    SUM(quantity_received) OVER (PARTITION BY product_id, branch_id, batch_number) AS merged_received,
    SUM(quantity_remaining) OVER (PARTITION BY product_id, branch_id, batch_number) AS merged_remaining,
    MIN(expiry_date) OVER (PARTITION BY product_id, branch_id, batch_number) AS merged_expiry,
    MIN(received_date) OVER (PARTITION BY product_id, branch_id, batch_number) AS merged_received_date,
    MAX(updated_at) OVER (PARTITION BY product_id, branch_id, batch_number) AS merged_updated_at
  FROM batches
),
batch_keepers AS (
  SELECT DISTINCT ON (keep_id)
    keep_id,
    merged_received,
    GREATEST(merged_remaining, 0) AS merged_remaining,
    merged_expiry,
    merged_received_date,
    merged_updated_at
  FROM ranked_batches
  ORDER BY keep_id, row_num
)
UPDATE batches AS target
SET
  quantity_received = batch_keepers.merged_received,
  quantity_remaining = batch_keepers.merged_remaining,
  expiry_date = batch_keepers.merged_expiry,
  received_date = batch_keepers.merged_received_date,
  is_expired = CASE WHEN batch_keepers.merged_expiry::timestamptz < NOW() THEN true ELSE false END,
  updated_at = batch_keepers.merged_updated_at
FROM batch_keepers
WHERE target.id = batch_keepers.keep_id;
--> statement-breakpoint
WITH ranked_batches AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY product_id, branch_id, batch_number
      ORDER BY received_date, created_at, id
    ) AS row_num
  FROM batches
)
DELETE FROM batches
WHERE id IN (
  SELECT id
  FROM ranked_batches
  WHERE row_num > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS inventory_product_branch_unique
ON inventory (product_id, branch_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS product_visibility_product_branch_unique
ON product_visibility (product_id, branch_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS batches_product_branch_batch_number_unique
ON batches (product_id, branch_id, batch_number);
