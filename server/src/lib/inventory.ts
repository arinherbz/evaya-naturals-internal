import { and, eq, sql } from 'drizzle-orm';
import * as schema from '../db/schema/index.js';

export function isUniqueViolation(error: unknown, constraintName?: string) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const code = candidate.code ?? candidate.cause?.code;
  const constraint = candidate.constraint ?? candidate.cause?.constraint;
  if (code !== '23505') {
    return false;
  }

  return constraintName ? constraint === constraintName : true;
}

export async function ensureInventoryRowsForBranches(
  executor: any,
  productId: string,
  branchIds: string[],
  lowStockThreshold: number,
) {
  const uniqueBranchIds = Array.from(new Set(branchIds));
  for (const branchId of uniqueBranchIds) {
    await executor.insert(schema.inventory)
      .values({
        productId,
        branchId,
        quantity: 0,
        lowStockThreshold,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoNothing({
        target: [schema.inventory.productId, schema.inventory.branchId],
      });
  }
}

export async function ensureProductVisibility(
  executor: any,
  productId: string,
  branchIds: string[],
) {
  const nextBranchIds = Array.from(new Set(branchIds));
  const existing = await executor.select()
    .from(schema.productVisibility)
    .where(eq(schema.productVisibility.productId, productId));

  const existingBranchIds = new Set(existing.map((row: typeof existing[number]) => row.branchId));
  for (const branchId of nextBranchIds) {
    if (!existingBranchIds.has(branchId)) {
      await executor.insert(schema.productVisibility)
        .values({ productId, branchId })
        .onConflictDoNothing({
          target: [schema.productVisibility.productId, schema.productVisibility.branchId],
        });
    }
  }

  for (const row of existing) {
    if (!nextBranchIds.includes(row.branchId)) {
      await executor.delete(schema.productVisibility)
        .where(eq(schema.productVisibility.id, row.id));
    }
  }
}

export async function applyInventoryDelta(
  executor: any,
  productId: string,
  branchId: string,
  quantityDelta: number,
  lowStockThreshold: number,
  updatedAt = new Date().toISOString(),
) {
  if (quantityDelta === 0) {
    await ensureInventoryRowsForBranches(executor, productId, [branchId], lowStockThreshold);
    const [row] = await executor.select()
      .from(schema.inventory)
      .where(and(eq(schema.inventory.productId, productId), eq(schema.inventory.branchId, branchId)))
      .limit(1);
    return row?.quantity ?? 0;
  }

  const updated = await executor.update(schema.inventory)
    .set({
      quantity: sql`${schema.inventory.quantity} + ${quantityDelta}`,
      updatedAt,
    })
    .where(and(
      eq(schema.inventory.productId, productId),
      eq(schema.inventory.branchId, branchId),
      sql`${schema.inventory.quantity} + ${quantityDelta} >= 0`,
    ))
    .returning({
      id: schema.inventory.id,
      quantity: schema.inventory.quantity,
      lowStockThreshold: schema.inventory.lowStockThreshold,
    });

  if (updated.length > 0) {
    return updated[0].quantity;
  }

  if (quantityDelta < 0) {
    const [existing] = await executor.select({
      id: schema.inventory.id,
      quantity: schema.inventory.quantity,
    })
      .from(schema.inventory)
      .where(and(eq(schema.inventory.productId, productId), eq(schema.inventory.branchId, branchId)))
      .limit(1);

    if (!existing) {
      throw new Error('Inventory record is missing for this product');
    }

    throw new Error('Insufficient stock for this adjustment');
  }

  const inserted = await executor.insert(schema.inventory)
    .values({
      productId,
      branchId,
      quantity: quantityDelta,
      lowStockThreshold,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [schema.inventory.productId, schema.inventory.branchId],
      set: {
        quantity: sql`${schema.inventory.quantity} + ${quantityDelta}`,
        updatedAt,
      },
    })
    .returning({
      id: schema.inventory.id,
      quantity: schema.inventory.quantity,
      lowStockThreshold: schema.inventory.lowStockThreshold,
    });

  return inserted[0].quantity;
}
