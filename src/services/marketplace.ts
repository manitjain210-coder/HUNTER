import { db, tx, type Tx } from "@/lib/db";
import { audit, notify, memberIds, adminIds } from "@/lib/audit";
import { type Actor, requireActiveSupplier, requireAdmin, requireCtx, SUPPLIER_MANAGE } from "@/lib/authz";
import { AppError, conflict, forbidden, invalid, notFound, parseJson } from "@/lib/domain";
import { getPolicy } from "@/lib/policy";
import { addMin, now } from "@/lib/time";
import { parse, z, reqStr, str, posInt } from "@/lib/validate";
import type { DiscountRule, ProductBatch, Product } from "@prisma/client";

// ---------------- Pricing ----------------

export type Tier = { maxDaysLeft?: number; minQty?: number; pct: number };
export type PriceQuote = {
  unitMinor: number; originalMinor: number; daysLeft: number; timePct: number; qtyPct: number; combinedPct: number;
  capPct: number; floorMinor: number; floorApplied: boolean; ruleId: string | null; ruleVersion: number | null; illustrative: boolean;
};

/**
 * Deterministic pricing formula:
 *   daysLeft  = ceil((expiry − now) / 1 day)
 *   timePct   = pct of the tightest time tier with daysLeft ≤ maxDaysLeft (0 if none)
 *   qtyPct    = pct of the largest quantity tier with qty ≥ minQty (0 if none)
 *   combined  = 1 − (1 − time)(1 − qty), capped at min(rule.maxPct, policy.maxDiscountPct)
 *   unit      = max(floor, round(original × (1 − combined)))  (floor never above original)
 * qtyPct is non-decreasing in qty, so buying more never raises the unit price. Same inputs => same price for everyone.
 */
export function quote(batch: Pick<ProductBatch, "originalPriceMinor" | "expiryDate">, rule: DiscountRule | null, qty: number, at: Date, policyMaxPct: number): PriceQuote {
  const daysLeft = Math.ceil((batch.expiryDate.getTime() - at.getTime()) / 86400000);
  const time = parseJson<Tier[]>(rule?.timeTiers, []).filter((t) => t.maxDaysLeft != null && daysLeft <= t.maxDaysLeft).sort((a, b) => a.maxDaysLeft! - b.maxDaysLeft!)[0]?.pct ?? 0;
  const qtyPct = parseJson<Tier[]>(rule?.qtyTiers, []).filter((t) => t.minQty != null && qty >= t.minQty).sort((a, b) => b.minQty! - a.minQty!)[0]?.pct ?? 0;
  const capPct = Math.min(rule?.maxPct ?? 0, policyMaxPct);
  const combined = Math.min(capPct, Math.round(100 - ((100 - time) * (100 - qtyPct)) / 100));
  const raw = Math.round((batch.originalPriceMinor * (100 - combined)) / 100);
  const floor = Math.min(rule?.floorMinor ?? 0, batch.originalPriceMinor);
  return {
    unitMinor: Math.max(floor, raw), originalMinor: batch.originalPriceMinor, daysLeft, timePct: time, qtyPct, combinedPct: combined, capPct, floorMinor: floor,
    floorApplied: raw < floor, ruleId: rule?.id ?? null, ruleVersion: rule?.version ?? null, illustrative: rule?.illustrative ?? false,
  };
}

/** Most specific active rule: batch > category > store default. */
export async function ruleFor(t: Tx, batch: ProductBatch & { product: Product }) {
  const rules = await t.discountRule.findMany({ where: { tenantId: batch.tenantId, active: true } });
  return rules.find((r) => r.batchId === batch.id) ?? rules.find((r) => !r.batchId && r.category === batch.product.category) ?? rules.find((r) => !r.batchId && !r.category) ?? null;
}

export function sellable(b: ProductBatch, at: Date) {
  if (b.status !== "ACTIVE") return `Batch is ${b.status.toLowerCase()}`;
  if (b.expiryDate <= at) return "Batch has expired";
  if (b.quantity - b.reservedQty - b.soldQty <= 0) return "Out of stock";
  return null;
}

export async function priceFor(batchId: string, qty: number, t: Tx = db, at = now()) {
  const policy = await getPolicy(t);
  const batch = await t.productBatch.findUniqueOrThrow({ where: { id: batchId }, include: { product: true } });
  return { batch, q: quote(batch, await ruleFor(t, batch), qty, at, policy.maxDiscountPct) };
}

// ---------------- Seller: products, batches, rules, import ----------------

const batchSchema = z.object({
  batchCode: reqStr(40),
  quantity: posInt(1_000_000),
  priceInr: z.coerce.number().positive("Price must be more than 0").max(1_000_000),
  minOrder: posInt(10000).default(1),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  bestBefore: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  storage: z.enum(["AMBIENT", "CHILLED", "FROZEN"]).default("AMBIENT"),
  pickupLocation: str(200),
});
const productSchema = z.object({ name: reqStr(120), category: reqStr(60), unit: z.enum(["ITEM", "KG", "LITRE", "PACK"]), description: str(1000) });

/** Expiry/best-before are stored as end of that local day (IST default). */
const endOfDay = (d: string) => new Date(`${d}T23:59:59+05:30`);

export async function createProductWithBatch(actor: Actor, raw: Record<string, unknown>) {
  const c = requireActiveSupplier(actor, "SUPERMARKET");
  const p = parse(productSchema, raw), b = parse(batchSchema, raw);
  if (endOfDay(b.expiryDate) <= now()) throw invalid("This batch has already expired.", { expiryDate: "Must be in the future" });
  return tx(async (t) => {
    const product = await t.product.create({ data: { ...p, tenantId: c.tenantId } });
    await createBatchTx(t, actor, c.tenantId, product.id, b);
    return product;
  });
}

async function createBatchTx(t: Tx, actor: Actor, tenantId: string, productId: string, b: z.infer<typeof batchSchema>) {
  if (await t.productBatch.findUnique({ where: { tenantId_batchCode: { tenantId, batchCode: b.batchCode } } })) throw invalid("Batch code already used.", { batchCode: "Must be unique in your store" });
  const batch = await t.productBatch.create({
    data: {
      productId, tenantId, batchCode: b.batchCode, quantity: b.quantity, originalPriceMinor: Math.round(b.priceInr * 100), minOrder: b.minOrder,
      expiryDate: endOfDay(b.expiryDate), bestBefore: b.bestBefore ? endOfDay(b.bestBefore) : null, storage: b.storage, pickupLocation: b.pickupLocation,
    },
  });
  await t.inventoryMovement.create({ data: { batchId: batch.id, type: "ADJUST", quantity: b.quantity, reason: "Batch received", actorId: actor.userId } });
  await audit(t, { actorId: actor.userId, tenantId, action: "batch.create", entityType: "ProductBatch", entityId: batch.id });
  return batch;
}

export async function addBatch(actor: Actor, productId: string, raw: unknown) {
  const c = requireActiveSupplier(actor, "SUPERMARKET");
  const b = parse(batchSchema, raw);
  if (endOfDay(b.expiryDate) <= now()) throw invalid("This batch has already expired.", { expiryDate: "Must be in the future" });
  return tx(async (t) => {
    if (!(await t.product.findFirst({ where: { id: productId, tenantId: c.tenantId } }))) throw notFound();
    return createBatchTx(t, actor, c.tenantId, productId, b);
  });
}

export async function setBatchStatus(actor: Actor, batchId: string, status: "ACTIVE" | "WITHDRAWN" | "RECALLED", reason: string) {
  const c = requireActiveSupplier(actor, "SUPERMARKET", SUPPLIER_MANAGE);
  if ((reason ?? "").trim().length < 3) throw invalid("Give a reason.", { reason: "Required" });
  return tx(async (t) => {
    const b = await t.productBatch.findFirst({ where: { id: batchId, tenantId: c.tenantId } });
    if (!b) throw notFound();
    if (b.status === "RECALLED" && status === "ACTIVE") throw conflict("A recalled batch cannot be re-activated.");
    await t.productBatch.update({ where: { id: batchId }, data: { status } });
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: `batch.${status.toLowerCase()}`, entityType: "ProductBatch", entityId: batchId, data: { reason } });
    if (status === "RECALLED") {
      // Open orders for a recalled batch must not be collected: cancel and release.
      const orders = await t.groceryOrder.findMany({ where: { status: "RESERVED", items: { some: { batchId } } } });
      for (const o of orders) await cancelOrderTx(t, o.id, actor.userId, `Batch recalled: ${reason}`);
    }
  });
}

const ruleSchema = z.object({
  scope: z.enum(["STORE", "CATEGORY", "BATCH"]),
  category: str(60),
  batchId: str(40),
  timeTiers: z.preprocess((v) => (typeof v === "string" ? parseJson(v, null) : v), z.array(z.object({ maxDaysLeft: z.number().int().min(0).max(365), pct: z.number().int().min(0).max(95) }))),
  qtyTiers: z.preprocess((v) => (typeof v === "string" ? parseJson(v, null) : v), z.array(z.object({ minQty: z.number().int().min(1), pct: z.number().int().min(0).max(95) }))),
  maxPct: z.coerce.number().int().min(0).max(95),
  floorInr: z.coerce.number().min(0).default(0),
});

export async function saveDiscountRule(actor: Actor, raw: unknown) {
  const c = requireActiveSupplier(actor, "SUPERMARKET", SUPPLIER_MANAGE);
  const v = parse(ruleSchema, raw);
  const policy = await getPolicy();
  if (v.maxPct > policy.maxDiscountPct) throw invalid(`Platform limit is ${policy.maxDiscountPct}%.`, { maxPct: `At most ${policy.maxDiscountPct}` });
  const sortedQty = [...v.qtyTiers].sort((a, b) => a.minQty - b.minQty);
  for (let i = 1; i < sortedQty.length; i++) if (sortedQty[i].pct < sortedQty[i - 1].pct) throw invalid("Larger quantity tiers must not have a smaller discount (that would raise the unit price for buying more).", { qtyTiers: "Discount must not decrease as quantity increases" });
  if (v.scope === "BATCH" && !(await db.productBatch.findFirst({ where: { id: v.batchId, tenantId: c.tenantId } }))) throw invalid("Unknown batch.", { batchId: "Choose one of your batches" });
  return tx(async (t) => {
    const where = { tenantId: c.tenantId, active: true, category: v.scope === "CATEGORY" ? v.category : null, batchId: v.scope === "BATCH" ? v.batchId : null };
    const prev = await t.discountRule.findFirst({ where });
    if (prev) await t.discountRule.update({ where: { id: prev.id }, data: { active: false } }); // keep old version for order snapshots
    const rule = await t.discountRule.create({
      data: { tenantId: c.tenantId, category: where.category, batchId: where.batchId, timeTiers: JSON.stringify(v.timeTiers), qtyTiers: JSON.stringify(sortedQty), maxPct: v.maxPct, floorMinor: Math.round(v.floorInr * 100), version: (prev?.version ?? 0) + 1 },
    });
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "discount.save", entityType: "DiscountRule", entityId: rule.id, data: v });
    return rule;
  });
}

/** CSV columns: product_name,category,unit,batch_code,quantity,price_inr,min_order,expiry_date,storage,pickup_location */
export function parseStockCsv(text: string) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  const header = (lines.shift() ?? "").split(",").map((h) => h.trim().toLowerCase());
  const need = ["product_name", "category", "unit", "batch_code", "quantity", "price_inr", "expiry_date"];
  const missing = need.filter((h) => !header.includes(h));
  if (missing.length) return { rows: [], headerError: `Missing columns: ${missing.join(", ")}` };
  const codes = new Set<string>();
  const rows = lines.slice(0, 2000).map((line, i) => {
    const cells = line.split(",").map((c) => c.trim());
    const rec = Object.fromEntries(header.map((h, j) => [h, cells[j] ?? ""]));
    const errors: string[] = [];
    const p = productSchema.safeParse({ name: rec.product_name, category: rec.category, unit: rec.unit?.toUpperCase(), description: "" });
    const b = batchSchema.safeParse({ batchCode: rec.batch_code, quantity: rec.quantity, priceInr: rec.price_inr, minOrder: rec.min_order || 1, expiryDate: rec.expiry_date, storage: (rec.storage || "AMBIENT").toUpperCase(), pickupLocation: rec.pickup_location ?? "" });
    if (!p.success) errors.push(...p.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`));
    if (!b.success) errors.push(...b.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`));
    if (b.success && endOfDay(b.data.expiryDate) <= now()) errors.push("expiry_date is in the past");
    if (codes.has(rec.batch_code)) errors.push("duplicate batch_code in file");
    codes.add(rec.batch_code);
    return { line: i + 2, rec, errors, product: p.success ? p.data : null, batch: b.success ? b.data : null };
  });
  return { rows, headerError: null };
}

/** Applies only when every row is valid — all or nothing. */
export async function applyStockImport(actor: Actor, text: string) {
  const c = requireActiveSupplier(actor, "SUPERMARKET", SUPPLIER_MANAGE);
  const { rows, headerError } = parseStockCsv(text);
  if (headerError) throw invalid(headerError);
  if (!rows.length) throw invalid("No rows found.");
  if (rows.some((r) => r.errors.length)) throw invalid("Fix the invalid rows first; nothing was imported.");
  return tx(async (t) => {
    for (const r of rows) {
      const existing = await t.product.findFirst({ where: { tenantId: c.tenantId, name: r.product!.name, unit: r.product!.unit } });
      const product = existing ?? (await t.product.create({ data: { ...r.product!, tenantId: c.tenantId } }));
      await createBatchTx(t, actor, c.tenantId, product.id, r.batch!);
    }
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "stock.import", entityType: "Tenant", entityId: c.tenantId, data: { rows: rows.length } });
    return rows.length;
  });
}

// ---------------- Buyer: cart, checkout, orders ----------------

/** Purchases happen as a personal buyer (no org context) or as a restaurant. */
function buyerContext(actor: Actor | null) {
  if (!actor) throw new AppError("Sign in to buy.", "UNAUTHENTICATED");
  if (!actor.ctx) return null;
  if (actor.ctx.tenantKind === "RESTAURANT" && actor.ctx.role !== "VIEWER") return actor.ctx.tenantId;
  throw forbidden("Switch to your personal buyer context or a restaurant to buy.");
}

export async function addToCart(actor: Actor, batchId: string, qty: number) {
  const buyerTenantId = buyerContext(actor);
  if (!Number.isInteger(qty) || qty <= 0) throw invalid("Quantity must be a whole number above 0.");
  const { batch, q } = await priceFor(batchId, qty);
  const why = sellable(batch, now());
  if (why) throw conflict(why);
  if (qty < batch.minOrder) throw invalid(`Minimum order is ${batch.minOrder}.`);
  if (qty > batch.quantity - batch.reservedQty - batch.soldQty) throw conflict(`Only ${batch.quantity - batch.reservedQty - batch.soldQty} available.`);
  const key = { userId: actor.userId, buyerTenantId, batchId };
  const existing = await db.cartItem.findFirst({ where: key });
  if (existing) await db.cartItem.update({ where: { id: existing.id }, data: { quantity: qty, seenPriceMinor: q.unitMinor } });
  else await db.cartItem.create({ data: { ...key, quantity: qty, seenPriceMinor: q.unitMinor } });
}

export async function removeFromCart(actor: Actor, itemId: string) {
  await db.cartItem.deleteMany({ where: { id: itemId, userId: actor.userId } });
}

export async function cartFor(actor: Actor) {
  const buyerTenantId = buyerContext(actor);
  const items = await db.cartItem.findMany({ where: { userId: actor.userId, buyerTenantId }, include: { batch: { include: { product: true, tenant: true } } } });
  const at = now();
  return Promise.all(items.map(async (i) => {
    const { q } = await priceFor(i.batchId, i.quantity, db, at);
    return { ...i, quote: q, problem: sellable(i.batch, at), repriced: q.unitMinor !== i.seenPriceMinor };
  }));
}

/**
 * Checkout: revalidates every line server-side, refuses silently-changed prices (buyer must re-confirm),
 * reserves stock with conditional updates, and snapshots price breakdown + rule version per line.
 */
export async function checkout(actor: Actor, idempotencyKey: string) {
  const buyerTenantId = buyerContext(actor);
  if (!idempotencyKey) throw invalid("Missing idempotency key.");
  const prior = await db.groceryOrder.findMany({ where: { idempotencyKey: { startsWith: idempotencyKey + ":" }, buyerUserId: actor.userId } });
  if (prior.length) return prior;
  // Price check outside the transaction so the buyer's acknowledgement of a new price persists.
  const changed = (await cartFor(actor)).filter((i) => !i.problem && i.repriced);
  for (const i of changed) await db.cartItem.update({ where: { id: i.id }, data: { seenPriceMinor: i.quote.unitMinor } });
  if (changed.length)
    throw new AppError(changed.map((i) => `${i.batch.product.name}: price changed from ₹${(i.seenPriceMinor / 100).toFixed(2)} to ₹${(i.quote.unitMinor / 100).toFixed(2)} — review and check out again`).join(" · "), "CONFLICT");
  return tx(async (t) => {
    const policy = await getPolicy(t);
    const at = now();
    const items = await t.cartItem.findMany({ where: { userId: actor.userId, buyerTenantId }, include: { batch: { include: { product: true } } } });
    if (!items.length) throw invalid("Your cart is empty.");
    const problems: string[] = [];
    const priced = [];
    for (const i of items) {
      const why = sellable(i.batch, at);
      if (why) { problems.push(`${i.batch.product.name} (${i.batch.batchCode}): ${why}`); continue; }
      const q = quote(i.batch, await ruleFor(t, i.batch), i.quantity, at, policy.maxDiscountPct);
      if (q.unitMinor !== i.seenPriceMinor) { problems.push(`${i.batch.product.name}: price changed just now — review and check out again`); continue; }
      priced.push({ i, q });
    }
    if (problems.length) throw new AppError(problems.join(" · "), "CONFLICT");
    const bySeller = new Map<string, typeof priced>();
    for (const p of priced) bySeller.set(p.i.batch.tenantId, [...(bySeller.get(p.i.batch.tenantId) ?? []), p]);
    const orders = [];
    for (const [sellerTenantId, lines] of bySeller) {
      for (const { i } of lines) {
        const ok = await t.$executeRaw`UPDATE "ProductBatch" SET "reservedQty" = "reservedQty" + ${i.quantity} WHERE "id" = ${i.batchId} AND "status" = 'ACTIVE' AND "expiryDate" > ${at} AND "reservedQty" + "soldQty" + ${i.quantity} <= "quantity"`;
        if (ok !== 1) throw conflict(`${i.batch.product.name}: not enough stock left. Nothing was ordered.`);
      }
      const order = await t.groceryOrder.create({
        data: {
          buyerUserId: actor.userId, buyerTenantId, sellerTenantId, totalMinor: lines.reduce((s, l) => s + l.q.unitMinor * l.i.quantity, 0),
          reservationExpiresAt: addMin(at, policy.groceryHoldMinutes), idempotencyKey: `${idempotencyKey}:${sellerTenantId}`,
          policySnapshot: JSON.stringify({ groceryHoldMinutes: policy.groceryHoldMinutes, maxDiscountPct: policy.maxDiscountPct, versions: policy._versions }),
          items: { create: lines.map(({ i, q }) => ({ batchId: i.batchId, quantity: i.quantity, unitPriceMinor: q.unitMinor, originalPriceMinor: q.originalMinor, pricingSnapshot: JSON.stringify(q) })) },
        },
      });
      for (const { i } of lines) await t.inventoryMovement.create({ data: { batchId: i.batchId, orderId: order.id, type: "ORDER_RESERVE", quantity: i.quantity, actorId: actor.userId } });
      await audit(t, { actorId: actor.userId, tenantId: buyerTenantId, action: "order.create", entityType: "GroceryOrder", entityId: order.id });
      await notify(t, { userIds: await memberIds(t, sellerTenantId, ["OWNER", "MANAGER", "OPERATOR"]), tenantId: sellerTenantId, type: "order", title: "New grocery order to prepare", link: `/supermarket/orders/${order.id}`, dedupeKey: `order:${order.id}` });
      orders.push(order);
    }
    await t.cartItem.deleteMany({ where: { userId: actor.userId, buyerTenantId } });
    return orders;
  });
}

async function cancelOrderTx(t: Tx, orderId: string, actorId: string | null, reason: string) {
  const flipped = await t.groceryOrder.updateMany({ where: { id: orderId, status: "RESERVED" }, data: { status: reason.startsWith("Reservation expired") ? "EXPIRED" : "CANCELLED" } });
  if (flipped.count !== 1) return false;
  const items = await t.orderItem.findMany({ where: { orderId } });
  for (const i of items) {
    await t.$executeRaw`UPDATE "ProductBatch" SET "reservedQty" = "reservedQty" - ${i.quantity} WHERE "id" = ${i.batchId}`;
    await t.inventoryMovement.create({ data: { batchId: i.batchId, orderId, type: "ORDER_RELEASE", quantity: i.quantity, reason, actorId } });
  }
  await audit(t, { actorId, action: "order.cancel", entityType: "GroceryOrder", entityId: orderId, data: { reason } });
  return true;
}
export { cancelOrderTx };

/** Buyer or seller manager cancels an uncollected order. */
export async function cancelOrder(actor: Actor, orderId: string, reason: string) {
  return tx(async (t) => {
    const o = await t.groceryOrder.findUnique({ where: { id: orderId } });
    if (!o) throw notFound();
    const isBuyer = o.buyerUserId === actor.userId;
    const isSeller = actor.ctx?.tenantId === o.sellerTenantId && SUPPLIER_MANAGE.includes(actor.ctx.role);
    if (!isBuyer && !isSeller && !actor.isAdmin) throw notFound();
    if (!(await cancelOrderTx(t, orderId, actor.userId, reason || "Cancelled"))) throw conflict("Only reserved (uncollected) orders can be cancelled.");
    await notify(t, { userIds: isBuyer ? await memberIds(t, o.sellerTenantId, ["OWNER", "MANAGER"]) : [o.buyerUserId], type: "order", title: "Order cancelled", body: reason, link: isBuyer ? `/supermarket/orders/${orderId}` : `/orders/${orderId}`, dedupeKey: `ordercancel:${orderId}` });
  });
}

/** Seller confirms handover. Stock moves from reserved to sold. */
export async function confirmCollection(actor: Actor, orderId: string) {
  const c = requireCtx(actor, ["SUPERMARKET"], ["OWNER", "MANAGER", "OPERATOR"]);
  return tx(async (t) => {
    const o = await t.groceryOrder.findFirst({ where: { id: orderId, sellerTenantId: c.tenantId }, include: { items: true } });
    if (!o) throw notFound();
    const r = await t.groceryOrder.updateMany({ where: { id: orderId, status: "RESERVED" }, data: { status: "COLLECTED", collectedAt: now() } });
    if (r.count !== 1) throw conflict("Order is not awaiting collection.");
    for (const i of o.items) {
      await t.$executeRaw`UPDATE "ProductBatch" SET "reservedQty" = "reservedQty" - ${i.quantity}, "soldQty" = "soldQty" + ${i.quantity} WHERE "id" = ${i.batchId}`;
      await t.inventoryMovement.create({ data: { batchId: i.batchId, orderId, type: "ORDER_COLLECT", quantity: i.quantity, actorId: actor.userId } });
    }
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "order.collect", entityType: "GroceryOrder", entityId: orderId });
    await notify(t, { userIds: [o.buyerUserId], type: "order", title: "Order collected", link: `/orders/${orderId}`, dedupeKey: `ordercollect:${orderId}` });
  });
}

/**
 * Payments without a gateway. Seller records an offline payment (MANUAL_REPORTED); only an admin can mark ADMIN_CONFIRMED.
 * DEMO_SIMULATED exists only when demo mode is on and is labelled as such everywhere.
 */
export async function recordPayment(actor: Actor, orderId: string, input: { method: string; reference: string }, demo: boolean) {
  return tx(async (t) => {
    const o = await t.groceryOrder.findUnique({ where: { id: orderId } });
    if (!o) throw notFound();
    if (input.method === "DEMO_SIMULATED") {
      if (!demo) throw forbidden("Simulated payments are only available in demo mode.");
      if (o.buyerUserId !== actor.userId) throw notFound();
    } else {
      if (!["CASH_AT_PICKUP", "UPI_MANUAL", "BANK_MANUAL"].includes(input.method)) throw invalid("Choose a payment method.");
      if (!(actor.ctx?.tenantId === o.sellerTenantId && ["OWNER", "MANAGER", "OPERATOR"].includes(actor.ctx.role))) throw forbidden("Only the seller records offline payments.");
    }
    if (o.paymentStatus !== "PENDING") throw conflict("A payment is already recorded for this order.");
    const status = input.method === "DEMO_SIMULATED" ? "DEMO_SIMULATED" : "MANUAL_REPORTED";
    await t.paymentRecord.create({ data: { orderId, method: input.method, amountMinor: o.totalMinor, reference: (input.reference ?? "").slice(0, 100), status, recordedById: actor.userId } });
    await t.groceryOrder.update({ where: { id: orderId }, data: { paymentStatus: status } });
    await audit(t, { actorId: actor.userId, action: "payment.record", entityType: "GroceryOrder", entityId: orderId, data: { method: input.method, status } });
    if (status === "MANUAL_REPORTED") await notify(t, { userIds: await adminIds(t), type: "ops", title: "Offline payment awaiting confirmation", link: `/admin/orders`, dedupeKey: `pay:${orderId}` });
  });
}

export async function adminConfirmPayment(actor: Actor, orderId: string) {
  requireAdmin(actor);
  return tx(async (t) => {
    const r = await t.groceryOrder.updateMany({ where: { id: orderId, paymentStatus: "MANUAL_REPORTED" }, data: { paymentStatus: "ADMIN_CONFIRMED" } });
    if (r.count !== 1) throw conflict("Only manually reported payments can be confirmed.");
    await t.paymentRecord.updateMany({ where: { orderId, status: "MANUAL_REPORTED" }, data: { status: "ADMIN_CONFIRMED", confirmedById: actor.userId } });
    await audit(t, { actorId: actor.userId, action: "payment.confirm", entityType: "GroceryOrder", entityId: orderId });
  });
}

/** Buyer, seller staff, or admin may view an order. */
export async function getOrderFor(actor: Actor | null, orderId: string) {
  if (!actor) throw forbidden();
  const o = await db.groceryOrder.findUnique({ where: { id: orderId }, include: { items: { include: { batch: { include: { product: true } } } }, seller: true, payments: true, buyer: { select: { name: true, phone: true } } } });
  if (!o) throw notFound();
  if (o.buyerUserId === actor.userId || actor.ctx?.tenantId === o.sellerTenantId || actor.isAdmin) return o;
  throw notFound();
}

export async function searchCatalogue(opts: { q?: string; category?: string; includeUnavailable?: boolean }) {
  const at = now();
  const batches = await db.productBatch.findMany({
    where: {
      tenant: { verificationStatus: "APPROVED" },
      ...(opts.includeUnavailable ? {} : { status: "ACTIVE", expiryDate: { gt: at } }),
      product: { active: true, ...(opts.category ? { category: opts.category } : {}), ...(opts.q ? { name: { contains: opts.q } } : {}) },
    },
    include: { product: true, tenant: true },
    orderBy: { expiryDate: "asc" },
    take: 200,
  });
  const policy = await getPolicy();
  const out = [];
  for (const b of batches) {
    const rule = await ruleFor(db, b);
    out.push({ batch: b, quote: quote(b, rule, b.minOrder, at, policy.maxDiscountPct), available: b.quantity - b.reservedQty - b.soldQty, problem: sellable(b, at) });
  }
  return out.filter((r) => opts.includeUnavailable || r.available > 0);
}
