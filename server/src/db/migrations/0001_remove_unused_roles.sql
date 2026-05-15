DELETE FROM "sessions"
WHERE "user_id" IN (
  SELECT "users"."id"
  FROM "users"
  INNER JOIN "roles" ON "users"."role_id" = "roles"."id"
  WHERE "roles"."name" IN ('Inventory Officer', 'Delivery Rider', 'Accountant')
);
--> statement-breakpoint
UPDATE "users"
SET "is_active" = false,
    "updated_at" = NOW()::text
WHERE "role_id" IN (
  SELECT "id"
  FROM "roles"
  WHERE "name" IN ('Inventory Officer', 'Delivery Rider', 'Accountant')
);
--> statement-breakpoint
UPDATE "roles"
SET "is_active" = false,
    "updated_at" = NOW()::text
WHERE "name" IN ('Inventory Officer', 'Delivery Rider', 'Accountant');
