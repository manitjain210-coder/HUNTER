import { db } from "@/lib/db";
import { type Actor } from "@/lib/authz";
import { forbidden } from "@/lib/domain";

/**
 * Impact computed only from records. Units are never mixed or converted. Listings, reservations and grocery
 * sales are not counted as donated meals. No CO2 / people-fed / money-saved figures are produced.
 */
export type ReportScope = { tenantId?: string; kind?: string };

export function scopeFor(actor: Actor): ReportScope {
  if (actor.isAdmin && !actor.ctx) return {};
  const c = actor.ctx;
  if (!c || c.role === "DRIVER") throw forbidden();
  return { tenantId: c.tenantId, kind: c.tenantKind };
}

type Bucket = Record<string, number>;
const add = (b: Bucket, unit: string, n: number) => void (b[unit] = (b[unit] ?? 0) + n);

export async function donationReport(scope: ReportScope, from: Date, to: Date) {
  const lotWhere = scope.kind === "RESTAURANT" ? { tenantId: scope.tenantId } : {};
  const ticketWhere = scope.kind === "RECIPIENT" ? { tenantId: scope.tenantId } : {};
  const relevant = !scope.kind || ["RESTAURANT", "RECIPIENT"].includes(scope.kind);
  if (!relevant) return null;

  const items = await db.foodItem.findMany({ where: { lot: { ...lotWhere, confirmedAt: { gte: from, lte: to } } }, include: { lot: true } });
  const confirmed: Bucket = {}, expired: Bucket = {};
  for (const i of items) {
    add(confirmed, i.unit, i.quantity);
    if (["EXPIRED", "WITHDRAWN"].includes(i.lot.stage)) add(expired, i.unit, i.quantity - i.allocatedQty);
  }
  const allocs = await db.allocation.findMany({
    where: { createdAt: { gte: from, lte: to }, ticket: ticketWhere, foodItem: { lot: lotWhere } },
    include: { foodItem: { include: { lot: true } }, job: { include: { funding: true, handovers: true } } },
  });
  const collected: Bucket = {}, accepted: Bucket = {}, rejected: Bucket = {};
  for (const a of allocs) {
    add(collected, a.foodItem.unit, a.collectedQty);
    add(accepted, a.foodItem.unit, a.acceptedQty);
    add(rejected, a.foodItem.unit, a.rejectedQty);
  }
  const jobs = [...new Map(allocs.filter((a) => a.job).map((a) => [a.job!.id, a.job!])).values()];
  const completed = jobs.filter((j) => ["COMPLETED", "PARTIALLY_COMPLETED"].includes(j.status));
  const receiptTimes = allocs
    .filter((a) => a.job && a.acceptedQty > 0 && a.foodItem.lot.readyAt)
    .map((a) => {
      const r = a.job!.handovers.find((h) => h.type === "RECEIVED");
      return r ? (r.createdAt.getTime() - a.foodItem.lot.readyAt!.getTime()) / 60000 : null;
    })
    .filter((x): x is number => x != null);
  const transportCost = completed.reduce((s, j) => s + j.funding.reduce((x, f) => x + f.amountMinor, 0), 0);
  const acceptedPlates = accepted.PLATES ?? 0;

  const tickets = await db.needTicket.findMany({
    where: { ...ticketWhere, needDate: { gte: from, lte: to }, status: { in: ["EXPIRED", "CLOSED", "FILLED", "OPEN", "CANCELLED"] } },
    include: { requirements: { include: { allocations: true } } },
  });
  const unfulfilled: Bucket = {};
  for (const t of tickets) {
    if (t.status === "CANCELLED") continue;
    for (const r of t.requirements) add(unfulfilled, r.unit, Math.max(0, r.quantity - r.allocations.reduce((s, a) => s + a.acceptedQty, 0)));
  }
  return {
    confirmed, collected, accepted, rejected, expired, unfulfilled,
    completedDeliveries: completed.length, failedDeliveries: jobs.filter((j) => j.status === "FAILED").length,
    avgMinutesReadyToReceipt: receiptTimes.length ? Math.round(receiptTimes.reduce((a, b) => a + b, 0) / receiptTimes.length) : null,
    transportCostMinor: transportCost,
    // Only comparable when the accepted food is in complete-meal plates.
    transportCostPerAcceptedPlateMinor: acceptedPlates ? Math.round(transportCost / acceptedPlates) : null,
  };
}

export async function groceryReport(scope: ReportScope, from: Date, to: Date) {
  if (scope.kind && scope.kind !== "SUPERMARKET" && scope.kind !== "RESTAURANT") return null;
  const where = scope.kind === "SUPERMARKET" ? { sellerTenantId: scope.tenantId } : scope.kind === "RESTAURANT" ? { buyerTenantId: scope.tenantId } : {};
  const orders = await db.groceryOrder.findMany({ where: { ...where, createdAt: { gte: from, lte: to } }, include: { items: { include: { batch: { include: { product: true } } } } } });
  const sold: Bucket = {};
  for (const o of orders.filter((o) => o.status === "COLLECTED")) for (const i of o.items) add(sold, i.batch.product.unit, i.quantity);
  const expiredBatches = scope.kind === "RESTAURANT" ? [] : await db.productBatch.findMany({ where: { ...(scope.tenantId ? { tenantId: scope.tenantId } : {}), expiryDate: { gte: from, lte: to < new Date() ? to : new Date() } }, include: { product: true } });
  const expiredStock: Bucket = {};
  for (const b of expiredBatches) add(expiredStock, b.product.unit, b.quantity - b.soldQty - b.reservedQty);
  return {
    orders: orders.length, collectedOrders: orders.filter((o) => o.status === "COLLECTED").length, cancelledOrExpired: orders.filter((o) => ["CANCELLED", "EXPIRED"].includes(o.status)).length,
    revenueCollectedMinor: orders.filter((o) => o.status === "COLLECTED").reduce((s, o) => s + o.totalMinor, 0), sold, expiredStock,
  };
}

/** CSV with spreadsheet formula-injection escaping. */
export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

/** Export rows, scoped exactly like the report. */
export async function exportRows(actor: Actor, kind: "allocations" | "orders") {
  const scope = scopeFor(actor);
  if (kind === "allocations") {
    const lotWhere = scope.kind === "RESTAURANT" ? { tenantId: scope.tenantId } : {};
    const ticketWhere = scope.kind === "RECIPIENT" ? { tenantId: scope.tenantId } : {};
    if (scope.kind && !["RESTAURANT", "RECIPIENT"].includes(scope.kind)) throw forbidden();
    const rows = await db.allocation.findMany({ where: { ticket: ticketWhere, foodItem: { lot: lotWhere } }, include: { foodItem: { include: { lot: { include: { tenant: true } } } }, ticket: { include: { tenant: true } } }, orderBy: { createdAt: "desc" }, take: 5000 });
    return rows.map((a) => ({
      allocation_id: a.id, created_utc: a.createdAt, restaurant: a.foodItem.lot.tenant.name, organisation: a.ticket.tenant.name, ticket: a.ticket.title,
      item: a.foodItem.name, unit: a.foodItem.unit, reserved: a.quantity, collected: a.collectedQty, accepted: a.acceptedQty, rejected: a.rejectedQty, status: a.status,
    }));
  }
  if (scope.kind && scope.kind !== "SUPERMARKET") throw forbidden();
  const rows = await db.groceryOrder.findMany({ where: scope.tenantId ? { sellerTenantId: scope.tenantId } : {}, include: { items: { include: { batch: { include: { product: true } } } } }, orderBy: { createdAt: "desc" }, take: 5000 });
  return rows.flatMap((o) => o.items.map((i) => ({
    order_id: o.id, created_utc: o.createdAt, status: o.status, payment_status: o.paymentStatus, product: i.batch.product.name, batch: i.batch.batchCode,
    quantity: i.quantity, unit: i.batch.product.unit, unit_price_inr: (i.unitPriceMinor / 100).toFixed(2), original_price_inr: (i.originalPriceMinor / 100).toFixed(2),
  })));
}
