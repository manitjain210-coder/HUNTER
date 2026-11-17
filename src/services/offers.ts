import { tx, type Tx } from "@/lib/db";
import { audit, notify, memberIds } from "@/lib/audit";
import { type Actor, requireActiveRecipient, requireActiveSupplier, requireCtx } from "@/lib/authz";
import { conflict, forbidden, invalid, notFound } from "@/lib/domain";
import { getPolicy } from "@/lib/policy";
import { addMin, now } from "@/lib/time";
import { evaluate, type Line } from "./matching";
import { refreshTicketStatus } from "./tickets";

const lotInclude = { tenant: true, items: true } as const;
const ticketInclude = { tenant: true, requirements: true } as const;

/**
 * Atomically move quantity into an allocation. Conditional UPDATEs guard both sides, so concurrent requests
 * can never push allocatedQty past stock or reservedQty past the requested amount.
 */
async function allocateLine(t: Tx, line: Line, ctx: { offerId: string; ticketId: string; holdUntil: Date; actorId: string }) {
  const okItem = await t.$executeRaw`UPDATE "FoodItem" SET "allocatedQty" = "allocatedQty" + ${line.quantity} WHERE "id" = ${line.foodItemId} AND "allocatedQty" + ${line.quantity} <= "quantity"`;
  if (okItem !== 1) throw conflict("Not enough food left in this batch — someone else reserved it first.");
  const okReq = await t.$executeRaw`UPDATE "TicketRequirement" SET "reservedQty" = "reservedQty" + ${line.quantity} WHERE "id" = ${line.requirementId} AND "reservedQty" + ${line.quantity} <= "quantity"`;
  if (okReq !== 1) throw conflict("This ticket's remaining need was already covered by another offer.");
  const a = await t.allocation.create({
    data: { offerId: ctx.offerId, ticketId: ctx.ticketId, requirementId: line.requirementId, foodItemId: line.foodItemId, quantity: line.quantity, holdExpiresAt: ctx.holdUntil },
  });
  await t.inventoryMovement.create({ data: { foodItemId: line.foodItemId, allocationId: a.id, type: "ALLOCATE", quantity: line.quantity, actorId: ctx.actorId } });
  return a;
}

/** Release only the uncollected part of an allocation (RESERVED). Collected food never returns to the pool. */
export async function releaseAllocation(t: Tx, allocationId: string, reason: string, actorId: string | null) {
  const a = await t.allocation.findUnique({ where: { id: allocationId } });
  if (!a || a.status !== "RESERVED") return false;
  const flipped = await t.allocation.updateMany({ where: { id: a.id, status: "RESERVED" }, data: { status: "RELEASED" } });
  if (flipped.count !== 1) return false; // another worker already released it
  await t.$executeRaw`UPDATE "FoodItem" SET "allocatedQty" = "allocatedQty" - ${a.quantity} WHERE "id" = ${a.foodItemId}`;
  await t.$executeRaw`UPDATE "TicketRequirement" SET "reservedQty" = "reservedQty" - ${a.quantity} WHERE "id" = ${a.requirementId}`;
  await t.inventoryMovement.create({ data: { foodItemId: a.foodItemId, allocationId: a.id, type: "RELEASE", quantity: a.quantity, reason, actorId } });
  await refreshTicketStatus(t, a.ticketId);
  await audit(t, { actorId, action: "allocation.release", entityType: "Allocation", entityId: a.id, data: { reason, quantity: a.quantity } });
  return true;
}

/** Restaurant offers a confirmed lot to a ticket. */
export async function proposeOffer(actor: Actor, lotId: string, ticketId: string, idempotencyKey: string) {
  const c = requireActiveSupplier(actor, "RESTAURANT");
  return tx(async (t) => {
    const existing = await t.offer.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const policy = await getPolicy(t);
    const lot = await t.surplusLot.findFirst({ where: { id: lotId, tenantId: c.tenantId }, include: lotInclude });
    if (!lot) throw notFound();
    const ticket = await t.needTicket.findUnique({ where: { id: ticketId }, include: ticketInclude });
    if (!ticket) throw notFound();
    const pending = await t.offer.count({ where: { lotId, status: "PROPOSED" } });
    if (pending >= policy.maxPendingOffersPerLot) throw conflict(`This batch already has ${pending} pending offers. Wait for answers or withdraw some.`);
    if (await t.offer.findFirst({ where: { lotId, ticketId, status: "PROPOSED" } })) throw conflict("You already have a pending offer for this ticket.");
    const m = evaluate(ticket, lot, policy, now());
    if (!m.eligible) throw invalid(`Not a suitable match: ${m.reasons.join("; ")}`);
    const expiresAt = new Date(Math.min(addMin(now(), policy.offerTtlMinutes).getTime(), lot.pickupDeadline!.getTime()));
    const offer = await t.offer.create({
      data: {
        lotId, ticketId, direction: "SUPPLIER_OFFER", expiresAt, createdById: actor.userId, idempotencyKey,
        lines: { create: m.lines.map((l) => ({ foodItemId: l.foodItemId, requirementId: l.requirementId, quantity: l.quantity })) },
      },
    });
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "offer.propose", entityType: "Offer", entityId: offer.id, data: { lines: m.lines } });
    await notify(t, {
      userIds: await memberIds(t, ticket.tenantId, ["OWNER", "COORDINATOR"]), tenantId: ticket.tenantId, type: "offer",
      title: `${lot.tenant.name} offered food for "${ticket.title}"`, body: m.lines.map((l) => `${l.quantity} ${l.unit.toLowerCase()} ${l.name}`).join(", "),
      link: `/org/tickets/${ticketId}`, dedupeKey: `offer:${offer.id}`,
    });
    return offer;
  });
}

/** Shared acceptance path — revalidates everything inside the transaction. */
async function acceptInTx(t: Tx, offerId: string, actor: Actor, tenantId: string) {
  const policy = await getPolicy(t);
  const offer = await t.offer.findUnique({ where: { id: offerId }, include: { lines: true } });
  if (!offer) throw notFound();
  const ticket = await t.needTicket.findUnique({ where: { id: offer.ticketId }, include: ticketInclude });
  if (!ticket || ticket.tenantId !== tenantId) throw notFound();
  // Exactly-once: only one request can flip PROPOSED -> ACCEPTED.
  const flipped = await t.offer.updateMany({ where: { id: offerId, status: "PROPOSED", expiresAt: { gt: now() } }, data: { status: "ACCEPTED", decidedById: actor.userId, decidedAt: now() } });
  if (flipped.count !== 1) throw conflict("This offer is no longer open (already accepted, declined, withdrawn or expired).");
  const lot = await t.surplusLot.findUniqueOrThrow({ where: { id: offer.lotId }, include: lotInclude });
  const m = evaluate(ticket, lot, policy, now());
  if (!m.eligible) throw invalid(`No longer a suitable match: ${m.reasons.join("; ")}`);
  // Accept the smaller of what was offered and what is still feasible now.
  const lines: Line[] = [];
  for (const ol of offer.lines) {
    const fresh = m.lines.find((l) => l.foodItemId === ol.foodItemId && l.requirementId === ol.requirementId);
    const q = Math.min(ol.quantity, fresh?.quantity ?? 0);
    if (q > 0) lines.push({ foodItemId: ol.foodItemId, requirementId: ol.requirementId, quantity: q, unit: fresh!.unit, name: fresh!.name });
  }
  if (!lines.length) throw conflict("Nothing from this offer is still available or still needed.");
  const holdUntil = new Date(Math.min(addMin(now(), policy.reservationHoldMinutes).getTime(), lot.pickupDeadline!.getTime()));
  const allocations = [];
  for (const l of lines) allocations.push(await allocateLine(t, l, { offerId, ticketId: ticket.id, holdUntil, actorId: actor.userId }));
  await refreshTicketStatus(t, ticket.id);
  await audit(t, { actorId: actor.userId, tenantId, action: "offer.accept", entityType: "Offer", entityId: offerId, data: { lines, holdUntil, policyVersion: policy._versions } });
  await notify(t, {
    userIds: await memberIds(t, lot.tenantId, ["OWNER", "MANAGER", "OPERATOR"]), tenantId: lot.tenantId, type: "offer",
    title: `${ticket.tenant.name} reserved food from "${lot.title}"`, body: "Reserved — transport pending, not delivery guaranteed.", link: `/restaurant/surplus/${lot.id}`, dedupeKey: `accepted:${offerId}`,
  });
  return allocations;
}

export async function acceptOffer(actor: Actor, offerId: string) {
  const c = requireActiveRecipient(actor);
  return tx((t) => acceptInTx(t, offerId, actor, c.tenantId));
}

/** Organisation reserves eligible stock directly (after its own confirmation screen). */
export async function reserveLot(actor: Actor, lotId: string, ticketId: string, idempotencyKey: string) {
  const c = requireActiveRecipient(actor);
  return tx(async (t) => {
    const prior = await t.offer.findUnique({ where: { idempotencyKey } });
    if (prior) return prior;
    const ticket = await t.needTicket.findFirst({ where: { id: ticketId, tenantId: c.tenantId }, include: ticketInclude });
    if (!ticket) throw notFound();
    const lot = await t.surplusLot.findUnique({ where: { id: lotId }, include: lotInclude });
    if (!lot) throw notFound();
    const policy = await getPolicy(t);
    const m = evaluate(ticket, lot, policy, now());
    if (!m.eligible) throw invalid(`Not eligible: ${m.reasons.join("; ")}`);
    const offer = await t.offer.create({
      data: {
        lotId, ticketId, direction: "RECIPIENT_REQUEST", expiresAt: addMin(now(), 5), createdById: actor.userId, idempotencyKey,
        lines: { create: m.lines.map((l) => ({ foodItemId: l.foodItemId, requirementId: l.requirementId, quantity: l.quantity })) },
      },
    });
    await acceptInTx(t, offer.id, actor, c.tenantId);
    return offer;
  });
}

export async function declineOffer(actor: Actor, offerId: string, reason: string) {
  const c = requireCtx(actor, ["RECIPIENT"], ["OWNER", "COORDINATOR"]);
  return tx(async (t) => {
    const o = await t.offer.findFirst({ where: { id: offerId, ticket: { tenantId: c.tenantId } }, include: { lot: true } });
    if (!o) throw notFound();
    const r = await t.offer.updateMany({ where: { id: offerId, status: "PROPOSED" }, data: { status: "DECLINED", reason, decidedById: actor.userId, decidedAt: now() } });
    if (r.count !== 1) throw conflict("Offer is no longer pending.");
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "offer.decline", entityType: "Offer", entityId: offerId, data: { reason } });
    await notify(t, { userIds: await memberIds(t, o.lot.tenantId, ["OWNER", "MANAGER", "OPERATOR"]), type: "offer", title: "Offer declined", body: reason, link: `/restaurant/surplus/${o.lotId}`, dedupeKey: `declined:${offerId}` });
  });
}

export async function withdrawOffer(actor: Actor, offerId: string, reason: string) {
  const c = requireCtx(actor, ["RESTAURANT"], ["OWNER", "MANAGER", "OPERATOR"]);
  return tx(async (t) => {
    const o = await t.offer.findFirst({ where: { id: offerId, lot: { tenantId: c.tenantId } } });
    if (!o) throw notFound();
    const r = await t.offer.updateMany({ where: { id: offerId, status: "PROPOSED" }, data: { status: "WITHDRAWN", reason, decidedById: actor.userId, decidedAt: now() } });
    if (r.count !== 1) throw conflict("Only pending offers can be withdrawn. Accepted reservations must be cancelled from the batch.");
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "offer.withdraw", entityType: "Offer", entityId: offerId, data: { reason } });
  });
}

/** Either party (or admin) cancels an uncollected reservation with a reason. */
export async function cancelAllocation(actor: Actor, allocationId: string, reason: string) {
  if ((reason ?? "").trim().length < 3) throw invalid("Give a reason.", { reason: "Required" });
  return tx(async (t) => {
    const a = await t.allocation.findUnique({ where: { id: allocationId }, include: { ticket: true, foodItem: { include: { lot: true } } } });
    if (!a) throw notFound();
    const c = actor.ctx;
    const allowed = actor.isAdmin || (c && c.role !== "VIEWER" && c.role !== "DRIVER" && (c.tenantId === a.ticket.tenantId || c.tenantId === a.foodItem.lot.tenantId));
    if (!allowed) throw forbidden();
    if (a.jobId) {
      const job = await t.deliveryJob.findUnique({ where: { id: a.jobId } });
      if (job && !["CANCELLED", "FAILED"].includes(job.status)) throw conflict("This reservation is on an active delivery job — cancel or fail the job first.");
    }
    if (!(await releaseAllocation(t, a.id, reason, actor.userId))) throw conflict("Only uncollected reservations can be cancelled.");
    const ids = [...(await memberIds(t, a.ticket.tenantId, ["OWNER", "COORDINATOR"])), ...(await memberIds(t, a.foodItem.lot.tenantId, ["OWNER", "MANAGER"]))];
    await notify(t, { userIds: ids, type: "reservation", title: "Reservation cancelled", body: reason, link: `/org/tickets/${a.ticketId}`, dedupeKey: `cancelalloc:${a.id}` });
  });
}
