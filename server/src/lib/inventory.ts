import { and, asc, eq, sql } from 'drizzle-orm';
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

export async function syncBatchQuantitiesForAdjustment(
  executor: any,
  productId: string,
  branchId: string,
  quantityDelta: number,
  updatedAt = new Date().toISOString(),
  fallbackPrices?: {
    costPrice?: number | null;
    sellingPrice?: number | null;
  },
) {
  if (quantityDelta === 0) {
    return { syntheticBatchId: null as string | null };
  }

  const batches = await executor.select()
    .from(schema.batches)
    .where(and(
      eq(schema.batches.productId, productId),
      eq(schema.batches.branchId, branchId),
    ))
    .orderBy(asc(schema.batches.expiryDate), asc(schema.batches.receivedDate));

  if (batches.length === 0) {
    return { syntheticBatchId: null as string | null };
  }

  if (quantityDelta > 0) {
    const [createdBatch] = await executor.insert(schema.batches).values({
      batchNumber: `ADJ-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      productId,
      branchId,
      supplierId: null,
      expiryDate: '9999-12-31T00:00:00.000Z',
      quantityReceived: quantityDelta,
      quantityRemaining: quantityDelta,
      costPrice: fallbackPrices?.costPrice ?? 0,
      sellingPrice: fallbackPrices?.sellingPrice ?? null,
      receivedDate: updatedAt,
      isExpired: false,
      updatedAt,
    }).returning({ id: schema.batches.id });

    return { syntheticBatchId: createdBatch.id };
  }

  let remaining = Math.abs(quantityDelta);
  const totalRemaining = batches.reduce((sum: number, batch: typeof batches[number]) => sum + batch.quantityRemaining, 0);
  if (totalRemaining < remaining) {
    throw new Error('Insufficient batch quantity for this adjustment');
  }

  for (const batch of batches) {
    if (remaining === 0) break;
    if (batch.quantityRemaining <= 0) continue;

    const toRemove = Math.min(batch.quantityRemaining, remaining);
    const updatedBatch = await executor.update(schema.batches)
      .set({
        quantityRemaining: sql`${schema.batches.quantityRemaining} - ${toRemove}`,
        isExpired: sql`CASE WHEN ${schema.batches.expiryDate} < ${updatedAt} THEN true ELSE false END`,
        updatedAt,
      })
      .where(and(
        eq(schema.batches.id, batch.id),
        sql`${schema.batches.quantityRemaining} - ${toRemove} >= 0`,
      ))
      .returning({ id: schema.batches.id });

    if (updatedBatch.length === 0) {
      throw new Error('Batch quantity changed while applying this adjustment');
    }

    remaining -= toRemove;
  }

  return { syntheticBatchId: null as string | null };
}
