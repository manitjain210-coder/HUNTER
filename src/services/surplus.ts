import { db, tx } from "@/lib/db";
import { audit, notify, memberIds } from "@/lib/audit";
import { type Actor, requireActiveSupplier, requireCtx } from "@/lib/authz";
import { conflict, invalid, notFound, parseJson, ALLERGENS } from "@/lib/domain";
import { getPolicy } from "@/lib/policy";
import { now, parseLocalInput } from "@/lib/time";
import { parse, z, str, reqStr, posInt, bool } from "@/lib/validate";
import { releaseAllocation } from "./offers";
import { matchesForLot } from "./matching";

const itemSchema = z.object({
  name: reqStr(80),
  kind: z.enum(["MEAL", "PACKAGED", "COMPONENT"]),
  unit: z.enum(["PLATES", "KG", "LITRES", "PIECES", "PORTIONS"]),
  quantity: posInt(100000),
  servingDesc: str(200).default(""),
  ingredients: str(500).default(""),
  allergens: z.array(z.enum(ALLERGENS)).default([]),
  allergensUnknown: z.boolean().default(true),
}).superRefine((v, ctx) => {
  if (v.kind === "MEAL" && v.unit !== "PLATES") ctx.addIssue({ code: "custom", path: ["unit"], message: "Complete meals are counted in plates" });
  if (v.kind === "COMPONENT" && v.unit === "PLATES") ctx.addIssue({ code: "custom", path: ["unit"], message: "Components use kg, litres, pieces or portions — not plates" });
});
const itemsField = z.preprocess((v) => (typeof v === "string" ? parseJson(v, []) : v), z.array(itemSchema).min(1, "Add at least one food item"));

export async function createExpected(actor: Actor, raw: unknown) {
  const c = requireActiveSupplier(actor, "RESTAURANT");
  const v = parse(z.object({ title: reqStr(120), branchId: z.string().optional(), expectedFrom: reqStr(20), expectedUntil: reqStr(20), notes: str(500), dietCategory: z.enum(["VEG", "NONVEG", "VEGAN"]), items: itemsField }), raw);
  const from = parseLocalInput(v.expectedFrom, c.timezone), until = parseLocalInput(v.expectedUntil, c.timezone);
  if (!from || !until || until <= from) throw invalid("Fix the availability window.", { expectedUntil: "Must be after the start" });
  const branch = v.branchId ? await db.branch.findFirst({ where: { id: v.branchId, tenantId: c.tenantId } }) : await db.branch.findFirst({ where: { tenantId: c.tenantId } });
  const lot = await db.surplusLot.create({
    data: {
      tenantId: c.tenantId, branchId: branch?.id, stage: "EXPECTED", title: v.title, notes: v.notes, expectedFrom: from, expectedUntil: until, dietCategory: v.dietCategory,
      lat: branch?.lat, lng: branch?.lng,
      items: { create: v.items.map((i) => ({ ...i, allergens: JSON.stringify(i.allergens) })) },
    },
  });
  await audit(db, { actorId: actor.userId, tenantId: c.tenantId, action: "surplus.expected", entityType: "SurplusLot", entityId: lot.id });
  return lot;
}

const confirmSchema = z.object({
  title: reqStr(120),
  branchId: z.string().optional(),
  dietCategory: z.enum(["VEG", "NONVEG", "VEGAN"]),
  storage: z.enum(["HOT_HELD", "CHILLED", "AMBIENT"], "Choose how the food is held"),
  packaging: reqStr(200, "Describe packaging"),
  preparedAt: reqStr(20),
  readyAt: reqStr(20),
  pickupDeadline: reqStr(20),
  consumeBy: reqStr(20),
  notes: str(500),
  handlingDeclaration: bool,
  items: itemsField,
});

/**
 * Confirm actual surplus (new, or promoting an EXPECTED lot). Only after this can it be offered/reserved.
 * Deadlines are declared per batch and policy-checked; no universal shelf-life rule.
 */
export async function confirmReady(actor: Actor, raw: unknown, lotId?: string) {
  const c = requireActiveSupplier(actor, "RESTAURANT");
  const v = parse(confirmSchema, raw);
  if (!v.handlingDeclaration)
    throw invalid("The handling declaration is required.", { handlingDeclaration: "Confirm this is safe, unused food that was never served to customers, handled and held as described" });
  const tz = c.timezone;
  const prepared = parseLocalInput(v.preparedAt, tz)!, ready = parseLocalInput(v.readyAt, tz)!, pickup = parseLocalInput(v.pickupDeadline, tz)!, consume = parseLocalInput(v.consumeBy, tz)!;
  const fe: Record<string, string> = {};
  if (!prepared || !ready || !pickup || !consume) fe.preparedAt = "All four times are required";
  else {
    if (ready < prepared) fe.readyAt = "Ready time cannot be before preparation";
    if (pickup <= ready) fe.pickupDeadline = "Pickup deadline must be after ready time";
    if (consume <= pickup) fe.consumeBy = "Consumption deadline must be after the pickup deadline";
    if (pickup <= now()) fe.pickupDeadline = "Pickup deadline has already passed";
    if (prepared > now()) fe.preparedAt = "Preparation time cannot be in the future";
  }
  if (Object.keys(fe).length) throw invalid("Times must be in order: prepared ≤ ready < pickup deadline < consume by.", fe);
  const policy = await getPolicy();
  const flags: string[] = [];
  if ((consume.getTime() - prepared.getTime()) / 3600000 > policy.maxReadyToConsumeHours)
    flags.push(`Declared consume-by is more than ${policy.maxReadyToConsumeHours} h after preparation — flagged for review`);

  const lot = await tx(async (t) => {
    const branch = v.branchId ? await t.branch.findFirst({ where: { id: v.branchId, tenantId: c.tenantId } }) : await t.branch.findFirst({ where: { tenantId: c.tenantId } });
    const data = {
      title: v.title, dietCategory: v.dietCategory, storage: v.storage, packaging: v.packaging, preparedAt: prepared, readyAt: ready, pickupDeadline: pickup, consumeBy: consume,
      notes: v.notes, handlingDeclaration: true, declaredById: actor.userId, flags: JSON.stringify(flags), stage: "READY", confirmedAt: now(), branchId: branch?.id, lat: branch?.lat, lng: branch?.lng,
    };
    let l;
    if (lotId) {
      const ex = await t.surplusLot.findFirst({ where: { id: lotId, tenantId: c.tenantId } });
      if (!ex) throw notFound();
      if (ex.stage !== "EXPECTED") throw conflict("Only an expected-surplus estimate can be confirmed.");
      await t.foodItem.deleteMany({ where: { lotId } }); // estimates are replaced by actual confirmed quantities
      l = await t.surplusLot.update({ where: { id: lotId }, data: { ...data, items: { create: v.items.map((i) => ({ ...i, allergens: JSON.stringify(i.allergens) })) } } });
    } else {
      l = await t.surplusLot.create({ data: { ...data, tenantId: c.tenantId, items: { create: v.items.map((i) => ({ ...i, allergens: JSON.stringify(i.allergens) })) } } });
    }
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "surplus.confirm", entityType: "SurplusLot", entityId: l.id, data: { flags } });
    return l;
  });
  await alertMatches(lot.id, 1);
  return lot;
}

/** Notify the top eligible organisations (wave n). Dedupe keys make repeated calls safe. */
export async function alertMatches(lotId: string, wave: number) {
  const policy = await getPolicy();
  const ranked = (await matchesForLot(lotId)).filter((r) => r.m.eligible);
  const size = 3;
  const group = ranked.slice((wave - 1) * size, wave * size);
  await tx(async (t) => {
    for (const r of group) {
      await notify(t, {
        userIds: await memberIds(t, r.ticket.tenantId, ["OWNER", "COORDINATOR"]), tenantId: r.ticket.tenantId, type: "match",
        title: `Food available for "${r.ticket.title}"`, body: r.m.lines.map((l) => `${l.quantity} ${l.unit.toLowerCase()} ${l.name}`).join(", ") + ` · collect within ${policy.collectionTargetMinutes} min target`,
        link: `/org/tickets/${r.ticket.id}`, dedupeKey: `match:${lotId}:${r.ticket.id}`,
      });
    }
    await t.surplusLot.update({ where: { id: lotId }, data: { alertLevel: wave } });
  });
  return group.length;
}

/** Withdraw a lot from distribution with a reason. Uncollected reservations are released; collected food is unaffected. */
export async function withdrawLot(actor: Actor | null, lotId: string, reason: string, system = false) {
  const tenantId = system ? undefined : requireCtx(actor, ["RESTAURANT"], ["OWNER", "MANAGER", "OPERATOR"]).tenantId;
  if ((reason ?? "").trim().length < 3) throw invalid("Give a reason.", { reason: "Required" });
  return tx(async (t) => {
    const lot = await t.surplusLot.findFirst({ where: { id: lotId, ...(tenantId ? { tenantId } : {}) }, include: { items: { include: { allocations: true } } } });
    if (!lot) throw notFound();
    if (!["EXPECTED", "READY"].includes(lot.stage)) throw conflict("This batch is already closed.");
    let released = 0;
    for (const i of lot.items) for (const a of i.allocations) {
      if (a.status !== "RESERVED") continue;
      if (a.jobId && !system) {
        const job = await t.deliveryJob.findUnique({ where: { id: a.jobId } });
        if (job && !["CANCELLED", "FAILED", "COMPLETED", "PARTIALLY_COMPLETED"].includes(job.status)) throw conflict("A delivery job is active for this batch; cancel it first.");
      }
      if (await releaseAllocation(t, a.id, `Batch withdrawn: ${reason}`, actor?.userId ?? null)) released++;
    }
    await t.offer.updateMany({ where: { lotId, status: "PROPOSED" }, data: { status: "WITHDRAWN", reason, decidedAt: now() } });
    await t.surplusLot.update({ where: { id: lotId }, data: { stage: system ? "EXPIRED" : "WITHDRAWN", closeReason: reason } });
    for (const i of lot.items) await t.inventoryMovement.create({ data: { foodItemId: i.id, type: "WITHDRAW", quantity: i.quantity - i.allocatedQty, reason, actorId: actor?.userId } });
    await audit(t, { actorId: actor?.userId, tenantId: lot.tenantId, action: system ? "surplus.expire" : "surplus.withdraw", entityType: "SurplusLot", entityId: lotId, data: { reason, released } });
    if (released) {
      const tickets = await t.allocation.findMany({ where: { foodItem: { lotId }, status: "RELEASED" }, select: { ticket: { select: { tenantId: true, id: true } } } });
      for (const tk of tickets) await notify(t, { userIds: await memberIds(t, tk.ticket.tenantId, ["OWNER", "COORDINATOR"]), type: "reservation", title: "A reservation was released", body: reason, link: `/org/tickets/${tk.ticket.id}`, dedupeKey: `lotclose:${lotId}:${tk.ticket.id}` });
    }
    return { released };
  });
}

/** Correct a confirmed quantity. Cannot go below what is already committed. */
export async function adjustItem(actor: Actor, itemId: string, quantity: number, reason: string) {
  const c = requireCtx(actor, ["RESTAURANT"], ["OWNER", "MANAGER", "OPERATOR"]);
  if (!Number.isInteger(quantity) || quantity < 0) throw invalid("Quantity must be a whole number ≥ 0.");
  if ((reason ?? "").trim().length < 3) throw invalid("Give a reason.", { reason: "Required" });
  return tx(async (t) => {
    const item = await t.foodItem.findFirst({ where: { id: itemId, lot: { tenantId: c.tenantId } }, include: { lot: true } });
    if (!item) throw notFound();
    if (item.lot.stage !== "READY" && item.lot.stage !== "EXPECTED") throw conflict("Batch is closed.");
    const ok = await t.$executeRaw`UPDATE "FoodItem" SET "quantity" = ${quantity} WHERE "id" = ${itemId} AND "allocatedQty" <= ${quantity}`;
    if (ok !== 1) throw conflict(`${item.allocatedQty} ${item.unit.toLowerCase()} are already committed. Cancel those reservations before reducing below that.`);
    await t.inventoryMovement.create({ data: { foodItemId: itemId, type: "ADJUST", quantity: quantity - item.quantity, reason, actorId: actor.userId } });
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "surplus.adjust", entityType: "FoodItem", entityId: itemId, data: { from: item.quantity, to: quantity, reason } });
  });
}

/** Per-item ledger: available / offered / reserved / collected / accepted / rejected. */
export async function lotLedger(lotId: string) {
  const items = await db.foodItem.findMany({ where: { lotId }, include: { allocations: true, offerLines: { include: { offer: true } } } });
  return items.map((i) => {
    const sum = (f: (a: (typeof i.allocations)[number]) => number) => i.allocations.reduce((s, a) => s + f(a), 0);
    return {
      id: i.id, name: i.name, unit: i.unit, kind: i.kind, quantity: i.quantity, available: i.quantity - i.allocatedQty,
      offered: i.offerLines.filter((l) => l.offer.status === "PROPOSED").reduce((s, l) => s + l.quantity, 0),
      reserved: sum((a) => (a.status === "RESERVED" ? a.quantity : 0)),
      collected: sum((a) => a.collectedQty), accepted: sum((a) => a.acceptedQty), rejected: sum((a) => a.rejectedQty),
      released: sum((a) => (a.status === "RELEASED" ? a.quantity : 0)),
      allergens: parseJson<string[]>(i.allergens, []), allergensUnknown: i.allergensUnknown,
    };
  });
}
