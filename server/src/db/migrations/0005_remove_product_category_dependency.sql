DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'products_category_id_categories_id_fk'
      AND table_name = 'products'
  ) THEN
    ALTER TABLE "products" DROP CONSTRAINT "products_category_id_categories_id_fk";
  END IF;

  ALTER TABLE "products" ALTER COLUMN "category_id" DROP NOT NULL;
  ALTER TABLE "products" ALTER COLUMN "unit_type" SET DEFAULT 'kg';
  UPDATE "products" SET "category_id" = NULL WHERE "category_id" IS NOT NULL;
END $$;
