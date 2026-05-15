DO $$
DECLARE
  target_ids text[];
BEGIN
  SELECT COALESCE(array_agg(p.id), ARRAY[]::text[])
  INTO target_ids
  FROM "products" p
  WHERE lower(p."name") IN (
    'moringa powder',
    'mullien leaf',
    'turmeric butter',
    'whipped body butter',
    'tag relief soap'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "sale_items" si
    WHERE si."product_id" = p."id"
  );

  IF array_length(target_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM "transfers" WHERE "product_id" = ANY(target_ids);
  DELETE FROM "bundle_items" WHERE "product_id" = ANY(target_ids);
  DELETE FROM "inventory_movements" WHERE "product_id" = ANY(target_ids);
  DELETE FROM "batches" WHERE "product_id" = ANY(target_ids);
  DELETE FROM "inventory" WHERE "product_id" = ANY(target_ids);
  DELETE FROM "product_visibility" WHERE "product_id" = ANY(target_ids);
  DELETE FROM "products" WHERE "id" = ANY(target_ids);
END $$;
