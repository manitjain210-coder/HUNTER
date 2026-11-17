import { db, tx, type Tx } from "@/lib/db";
import { audit, notify, memberIds, adminIds } from "@/lib/audit";
import { type Actor, requireAdmin } from "@/lib/authz";
import { conflict, forbidden, invalid, notFound, assertTransition, JOB_TRANSITIONS, parseJson } from "@/lib/domain";
import { distanceKm, estTravelMin } from "@/lib/geo";
import { getPolicy } from "@/lib/policy";
import { addMin, fmtDateTime, now } from "@/lib/time";
import { refreshTicketStatus } from "./tickets";

// Rough per-unit weights for capacity checks. shortcut: estimates only; capture real weights per item if vehicles run near capacity.
const KG_PER: Record<string, number> = { PLATES: 0.5, KG: 1, LITRES: 1, PIECES: 0.3, PORTIONS: 0.25 };

/** Who may dispatch: admin, logistics staff (owner/coordinator), or a recipient org using its own vehicle. */
function dispatcherScope(actor: Actor) {
  if (actor.isAdmin && !actor.ctx) return { admin: true as const };
  const c = actor.ctx;
  if (c?.tenantKind === "LOGISTICS" && ["OWNER", "COORDINATOR"].includes(c.role)) return { logisticsTenantId: c.tenantId };
  if (c?.tenantKind === "RECIPIENT" && ["OWNER", "COORDINATOR"].includes(c.role) && c.verificationStatus === "APPROVED") return { orgTenantId: c.tenantId };
  if (actor.isAdmin) return { admin: true as const };
  throw forbidden("Only dispatchers can manage delivery jobs.");
}

async function loadJobForDispatcher(t: Tx, actor: Actor, jobId: string) {
  const s = dispatcherScope(actor);
  const job = await t.deliveryJob.findUnique({ where: { id: jobId }, include: { stops: true, allocations: true, funding: true } });
  if (!job) throw notFound();
  if ("logisticsTenantId" in s && job.logisticsTenantId !== s.logisticsTenantId) throw notFound();
  if ("orgTenantId" in s && (job.mode !== "ORG_VEHICLE" || !job.stops.some((st) => st.kind === "DROPOFF" && st.tenantId === s.orgTenantId))) throw notFound();
  return job;
}

export async function createJob(actor: Actor, input: { allocationIds: string[]; mode: string; quoteMinor: number }) {
  const s = dispatcherScope(actor);
  const mode = "orgTenantId" in s ? "ORG_VEHICLE" : input.mode;
  if (!["ORG_VEHICLE", "PLATFORM_DISPATCH", "ON_DEMAND_MANUAL"].includes(mode)) throw invalid("Invalid mode.");
  if (!Number.isInteger(input.quoteMinor) || input.quoteMinor < 0) throw invalid("Quote must be ≥ 0.", { quoteMinor: "Invalid amount" });
  if (!input.allocationIds?.length) throw invalid("Select at least one reservation.");
  return tx(async (t) => {
    const allocs = await t.allocation.findMany({ where: { id: { in: input.allocationIds } }, include: { foodItem: { include: { lot: { include: { tenant: true } } } }, ticket: { include: { tenant: true } } } });
    if (allocs.length !== input.allocationIds.length) throw notFound();
    for (const a of allocs) {
      if (a.status !== "RESERVED") throw conflict("Only reserved (uncollected) food can be put on a job.");
      if (a.jobId) {
        const j = await t.deliveryJob.findUnique({ where: { id: a.jobId } });
        if (j && !["CANCELLED", "FAILED"].includes(j.status)) throw conflict("A reservation is already on an active job.");
      }
      if ("orgTenantId" in s && a.ticket.tenantId !== s.orgTenantId) throw forbidden();
    }
    const handlings = [...new Set(allocs.map((a) => a.foodItem.lot.storage))];
    if (handlings.includes("HOT_HELD") && handlings.includes("CHILLED")) throw conflict("Hot-held and chilled food cannot share one job. Create separate jobs.");
    const job = await t.deliveryJob.create({
      data: {
        mode, quoteMinor: input.quoteMinor, handling: handlings.includes("HOT_HELD") ? "HOT_HELD" : handlings.includes("CHILLED") ? "CHILLED" : "AMBIENT",
        logisticsTenantId: "logisticsTenantId" in s ? s.logisticsTenantId : null, createdById: actor.userId, status: "PLANNING",
      },
    });
    const lots = new Map(allocs.map((a) => [a.foodItem.lotId, a.foodItem.lot]));
    const tickets = new Map(allocs.map((a) => [a.ticketId, a.ticket]));
    let seq = 0;
    for (const lot of lots.values())
      await t.deliveryStop.create({ data: { jobId: job.id, kind: "PICKUP", tenantId: lot.tenantId, lotId: lot.id, seq: seq++, address: lot.tenant.address, lat: lot.lat, lng: lot.lng, windowStart: lot.readyAt, windowEnd: lot.pickupDeadline, plannedQty: allocs.filter((a) => a.foodItem.lotId === lot.id).reduce((x, a) => x + a.quantity, 0) } });
    for (const tk of tickets.values())
      await t.deliveryStop.create({ data: { jobId: job.id, kind: "DROPOFF", tenantId: tk.tenantId, ticketId: tk.id, seq: seq++, address: tk.deliveryAddress || tk.tenant.address, lat: tk.lat, lng: tk.lng, windowStart: tk.receiveFrom, windowEnd: tk.latestDelivery, plannedQty: allocs.filter((a) => a.ticketId === tk.id).reduce((x, a) => x + a.quantity, 0) } });
    await t.allocation.updateMany({ where: { id: { in: input.allocationIds } }, data: { jobId: job.id } });
    await audit(t, { actorId: actor.userId, tenantId: actor.ctx?.tenantId, action: "job.create", entityType: "DeliveryJob", entityId: job.id, data: { allocations: input.allocationIds, mode } });
    for (const tk of tickets.values())
      await notify(t, { userIds: await memberIds(t, tk.tenantId, ["OWNER", "COORDINATOR"]), type: "transport", title: "Delivery job planned — please confirm you can receive", link: `/logistics/jobs/${job.id}`, dedupeKey: `jobplan:${job.id}:${tk.id}` });
    return job;
  });
}

/**
 * Suggested stop order (pickups by ready time + nearest neighbour, then drop-offs nearest first) with feasibility checks
 * against pickup windows, capacity and every delivery/consumption deadline. Straight-line estimates — not road routing.
 */
export async function suggestRoute(jobId: string, vehicleCapacityKg?: number, at = now()) {
  const policy = await getPolicy();
  const job = await db.deliveryJob.findUniqueOrThrow({ where: { id: jobId }, include: { stops: true, allocations: { include: { foodItem: { include: { lot: true } }, ticket: true } } } });
  const pickups = job.stops.filter((s) => s.kind === "PICKUP").sort((a, b) => (a.windowStart?.getTime() ?? 0) - (b.windowStart?.getTime() ?? 0));
  const order: typeof job.stops = [];
  const rest = [...pickups];
  while (rest.length) {
    const prev = order.at(-1);
    rest.sort((a, b) => (prev ? (distanceKm(prev, a) ?? 99) - (distanceKm(prev, b) ?? 99) : 0));
    order.push(rest.shift()!);
  }
  const drops = job.stops.filter((s) => s.kind === "DROPOFF");
  while (drops.length) {
    const prev = order.at(-1)!;
    drops.sort((a, b) => (distanceKm(prev, a) ?? 99) - (distanceKm(prev, b) ?? 99) || (a.windowEnd?.getTime() ?? 0) - (b.windowEnd?.getTime() ?? 0));
    order.push(drops.shift()!);
  }
  const failures: string[] = [], steps: string[] = [];
  const load = job.allocations.reduce((s, a) => s + a.quantity * (KG_PER[a.foodItem.unit] ?? 1), 0);
  if (vehicleCapacityKg != null && load > vehicleCapacityKg) failures.push(`Estimated load ${load.toFixed(0)} kg exceeds vehicle capacity ${vehicleCapacityKg} kg`);
  let t = at;
  let prev: (typeof order)[number] | null = null;
  for (const s of order) {
    const d = prev ? distanceKm(prev, s) : 0;
    t = addMin(t, prev ? (d == null ? policy.travelBufferMinutes : estTravelMin(d, policy.avgSpeedKmh, policy.travelBufferMinutes)) : 0);
    if (s.kind === "PICKUP") {
      if (s.windowStart && t < s.windowStart) t = s.windowStart;
      if (s.windowEnd && t > s.windowEnd) failures.push(`Pickup at ${s.address || s.id} would be after its deadline`);
    } else {
      if (s.windowEnd && t > s.windowEnd) failures.push(`Drop-off at ${s.address || s.id} would miss the latest delivery time`);
      for (const a of job.allocations.filter((x) => x.ticketId === s.ticketId))
        if (a.foodItem.lot.consumeBy && addMin(t, policy.servingBufferMinutes) > a.foodItem.lot.consumeBy) failures.push(`${a.foodItem.name} would reach ${a.ticket.title} without enough time to serve safely`);
    }
    steps.push(`${s.kind === "PICKUP" ? "Pick up" : "Drop off"} · ${s.address || "(no address)"} · est. ${fmtDateTime(t)}${d == null && prev ? " (no coordinates: buffer only)" : ""}`);
    prev = s;
  }
  return { feasible: failures.length === 0, order: order.map((s) => s.id), steps, failures, estimatedLoadKg: Math.round(load) };
}

export async function saveRoute(actor: Actor, jobId: string, orderIds: string[] | null, vehicleCapacityKg?: number) {
  return tx(async (t) => {
    const job = await loadJobForDispatcher(t, actor, jobId);
    const sug = await suggestRoute(jobId, vehicleCapacityKg);
    const ids = orderIds ?? sug.order;
    if (ids.length !== job.stops.length || !job.stops.every((s) => ids.includes(s.id))) throw invalid("Route must include every stop exactly once.");
    for (const [i, id] of ids.entries()) await t.deliveryStop.update({ where: { id }, data: { seq: i } });
    await t.deliveryJob.update({ where: { id: jobId }, data: { routeSuggestion: JSON.stringify(sug), routeApproved: true } });
    await audit(t, { actorId: actor.userId, action: "job.route.approve", entityType: "DeliveryJob", entityId: jobId, data: { order: ids, edited: !!orderIds, feasible: sug.feasible } });
    return sug;
  });
}

/** Records who pays for transport. A commitment is a record, not proof of payment. Donated food stays free. */
export async function addFunding(actor: Actor, jobId: string, input: { payerType: string; amountMinor: number; sponsorName?: string }) {
  if (!["ORG", "RESTAURANT", "SPONSOR", "PLATFORM"].includes(input.payerType)) throw invalid("Choose who pays.");
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 0) throw invalid("Amount must be ≥ 0.");
  if (input.payerType === "PLATFORM" && !actor.isAdmin) throw forbidden("Only admins can commit platform budget.");
  if (input.payerType === "SPONSOR" && !(input.sponsorName ?? "").trim()) throw invalid("Name the sponsor.", { sponsorName: "Required" });
  return tx(async (t) => {
    const job = await t.deliveryJob.findUnique({ where: { id: jobId }, include: { stops: true } });
    if (!job) throw notFound();
    const c = actor.ctx;
    const payerTenantId =
      input.payerType === "ORG" ? job.stops.find((s) => s.kind === "DROPOFF" && s.tenantId === c?.tenantId)?.tenantId
      : input.payerType === "RESTAURANT" ? job.stops.find((s) => s.kind === "PICKUP" && s.tenantId === c?.tenantId)?.tenantId : null;
    // An org/restaurant can only commit its own money; admins/dispatchers record sponsors and platform budget.
    if ((input.payerType === "ORG" || input.payerType === "RESTAURANT") && (!payerTenantId || !c || !["OWNER", "COORDINATOR", "MANAGER"].includes(c.role)))
      throw forbidden("Switch to the paying organisation (owner/coordinator/manager) to commit its funds.");
    if (input.payerType === "SPONSOR") await loadJobForDispatcher(t, actor, jobId);
    const f = await t.fundingCommitment.create({ data: { jobId, payerType: input.payerType, payerTenantId, sponsorName: input.sponsorName, amountMinor: input.amountMinor, createdById: actor.userId } });
    if (job.status === "PLANNING") await t.deliveryJob.update({ where: { id: jobId }, data: { status: "AWAITING_FUNDING" } });
    await audit(t, { actorId: actor.userId, tenantId: c?.tenantId, action: "job.funding", entityType: "DeliveryJob", entityId: jobId, data: { ...input, fundingId: f.id } });
    return f;
  });
}

export async function confirmReceiver(actor: Actor, jobId: string) {
  const c = actor.ctx;
  if (!c || c.tenantKind !== "RECIPIENT" || !["OWNER", "COORDINATOR"].includes(c.role)) throw forbidden();
  return tx(async (t) => {
    const job = await t.deliveryJob.findUnique({ where: { id: jobId }, include: { stops: true } });
    if (!job || !job.stops.some((s) => s.kind === "DROPOFF" && s.tenantId === c.tenantId)) throw notFound();
    await t.deliveryJob.update({ where: { id: jobId }, data: { receiverConfirmedAt: now(), receiverConfirmedById: actor.userId } });
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "job.receiver.confirm", entityType: "DeliveryJob", entityId: jobId });
  });
}

/** Dispatch requires: receiver confirmed, funding ≥ quote, an eligible collector. */
export async function assignCollector(actor: Actor, jobId: string, collectorId: string, vehicleId: string | null) {
  return tx(async (t) => {
    const job = await loadJobForDispatcher(t, actor, jobId);
    if (!job.receiverConfirmedAt) throw conflict("The receiving organisation has not confirmed it can receive this delivery.");
    const funded = job.funding.reduce((s, f) => s + f.amountMinor, 0);
    if (job.funding.length === 0 || funded < job.quoteMinor) throw conflict(`Transport funding not confirmed: ₹${(funded / 100).toFixed(2)} committed of ₹${(job.quoteMinor / 100).toFixed(2)} quote.`);
    // Collector: logistics staff of the dispatching tenant, or the receiving org's own staff for ORG_VEHICLE.
    const scopeTenant = job.mode === "ORG_VEHICLE" ? job.stops.find((s) => s.kind === "DROPOFF")!.tenantId : job.logisticsTenantId;
    const m = await t.membership.findFirst({ where: { userId: collectorId, active: true, role: { in: ["DRIVER", "COORDINATOR", "OWNER"] }, ...(scopeTenant ? { tenantId: scopeTenant } : { tenant: { kind: "LOGISTICS" } }) } });
    if (!m) throw invalid("Choose a verified driver from the dispatching or receiving organisation.");
    if (vehicleId && !(await t.vehicle.findFirst({ where: { id: vehicleId, tenantId: m.tenantId, active: true } }))) throw invalid("Choose one of that organisation's vehicles.");
    assertTransition(JOB_TRANSITIONS, job.status === "PLANNING" ? "AWAITING_FUNDING" : job.status, "ASSIGNED");
    await t.deliveryJob.update({ where: { id: jobId }, data: { status: "ASSIGNED", collectorId, vehicleId } });
    await audit(t, { actorId: actor.userId, action: "job.assign", entityType: "DeliveryJob", entityId: jobId, data: { collectorId, vehicleId } });
    await notify(t, { userIds: [collectorId], type: "transport", title: "New collection assigned to you", link: `/driver/jobs/${jobId}`, dedupeKey: `assign:${jobId}:${collectorId}` });
    const parties = [...new Set(job.stops.map((s) => s.tenantId))];
    for (const p of parties) await notify(t, { userIds: await memberIds(t, p, ["OWNER", "COORDINATOR", "MANAGER", "OPERATOR"]), type: "transport", title: "Collector assigned", link: `/logistics/jobs/${jobId}`, dedupeKey: `assigned:${jobId}:${p}` });
  });
}

async function loadJobForCollector(t: Tx, actor: Actor, jobId: string) {
  const job = await t.deliveryJob.findUnique({ where: { id: jobId }, include: { stops: true, allocations: { include: { foodItem: true } } } });
  if (!job || job.collectorId !== actor.userId) throw notFound();
  return job;
}

async function moveJob(t: Tx, jobId: string, from: string, to: string, actorId: string, extra: Record<string, unknown> = {}) {
  assertTransition(JOB_TRANSITIONS, from, to);
  const r = await t.deliveryJob.updateMany({ where: { id: jobId, status: from }, data: { status: to, ...extra } });
  if (r.count !== 1) throw conflict("Job changed meanwhile; refresh and try again.");
  await audit(t, { actorId, action: `job.${to.toLowerCase()}`, entityType: "DeliveryJob", entityId: jobId });
}

export async function collectorAccept(actor: Actor, jobId: string) {
  return tx(async (t) => {
    const job = await loadJobForCollector(t, actor, jobId);
    await moveJob(t, jobId, job.status, "ACCEPTED", actor.userId);
    await t.handoverEvent.create({ data: { jobId, type: "COLLECTOR_ACCEPTED", actorId: actor.userId } });
  });
}

export async function arriveAtPickup(actor: Actor, jobId: string, stopId: string) {
  return tx(async (t) => {
    const job = await loadJobForCollector(t, actor, jobId);
    const stop = job.stops.find((s) => s.id === stopId && s.kind === "PICKUP");
    if (!stop) throw notFound();
    if (job.status === "ACCEPTED") await moveJob(t, jobId, "ACCEPTED", "AT_PICKUP", actor.userId);
    else if (job.status !== "AT_PICKUP" && job.status !== "COLLECTED") throw conflict("Accept the job first.");
    await t.deliveryStop.update({ where: { id: stopId }, data: { arrivedAt: now() } });
    await t.handoverEvent.create({ data: { jobId, stopId, type: "ARRIVED", actorId: actor.userId } });
  });
}

/** Record actual quantities collected at one pickup stop. Shortfalls release only the uncollected part. */
export async function recordPickup(actor: Actor, jobId: string, stopId: string, qty: Record<string, number>, notes = "", evidenceId?: string) {
  return tx(async (t) => {
    const job = await loadJobForCollector(t, actor, jobId);
    if (!["AT_PICKUP", "COLLECTED"].includes(job.status)) throw conflict("Mark arrival at the pickup first.");
    const stop = job.stops.find((s) => s.id === stopId && s.kind === "PICKUP");
    if (!stop || stop.doneAt) throw conflict("This pickup is already recorded.");
    const here = job.allocations.filter((a) => a.foodItem.lotId === stop.lotId && a.status === "RESERVED");
    let total = 0;
    for (const a of here) {
      const q = Math.round(Number(qty[a.id] ?? 0));
      if (!(q >= 0 && q <= a.quantity)) throw invalid(`Collected quantity for ${a.foodItem.name} must be between 0 and ${a.quantity}.`);
      const short = a.quantity - q;
      if (short > 0) {
        await t.$executeRaw`UPDATE "FoodItem" SET "allocatedQty" = "allocatedQty" - ${short} WHERE "id" = ${a.foodItemId}`;
        await t.$executeRaw`UPDATE "TicketRequirement" SET "reservedQty" = "reservedQty" - ${short} WHERE "id" = ${a.requirementId}`;
        await t.inventoryMovement.create({ data: { foodItemId: a.foodItemId, allocationId: a.id, type: "RELEASE", quantity: short, reason: "Partial collection", actorId: actor.userId } });
      }
      await t.allocation.update({ where: { id: a.id }, data: { collectedQty: q, status: q > 0 ? "COLLECTED" : "RELEASED" } });
      if (q > 0) await t.inventoryMovement.create({ data: { foodItemId: a.foodItemId, allocationId: a.id, type: "COLLECT", quantity: q, actorId: actor.userId } });
      await refreshTicketStatus(t, a.ticketId);
      total += q;
    }
    await t.deliveryStop.update({ where: { id: stopId }, data: { actualQty: total, doneAt: now() } });
    await t.handoverEvent.create({ data: { jobId, stopId, type: "PICKED_UP", actorId: actor.userId, notes, evidenceId } });
    const remaining = job.stops.filter((s) => s.kind === "PICKUP" && !s.doneAt && s.id !== stopId);
    if (job.status === "AT_PICKUP") await moveJob(t, jobId, "AT_PICKUP", "COLLECTED", actor.userId);
    return { total, remainingPickups: remaining.length };
  });
}

export async function startTransit(actor: Actor, jobId: string) {
  return tx(async (t) => {
    const job = await loadJobForCollector(t, actor, jobId);
    if (job.stops.some((s) => s.kind === "PICKUP" && !s.doneAt)) throw conflict("Record every pickup stop first.");
    await moveJob(t, jobId, job.status, "IN_TRANSIT", actor.userId);
  });
}

export async function markDelivered(actor: Actor, jobId: string, stopId: string, notes = "", evidenceId?: string) {
  return tx(async (t) => {
    const job = await loadJobForCollector(t, actor, jobId);
    const stop = job.stops.find((s) => s.id === stopId && s.kind === "DROPOFF");
    if (!stop) throw notFound();
    if (job.status !== "IN_TRANSIT" && job.status !== "DELIVERED") throw conflict("Start transit first.");
    await t.deliveryStop.update({ where: { id: stopId }, data: { arrivedAt: now() } });
    await t.handoverEvent.create({ data: { jobId, stopId, type: "DELIVERED", actorId: actor.userId, notes, evidenceId } });
    const allArrived = job.stops.filter((s) => s.kind === "DROPOFF").every((s) => s.id === stopId || s.arrivedAt);
    if (allArrived && job.status === "IN_TRANSIT") await moveJob(t, jobId, "IN_TRANSIT", "DELIVERED", actor.userId);
    await notify(t, { userIds: await memberIds(t, stop.tenantId, ["OWNER", "COORDINATOR"]), tenantId: stop.tenantId, type: "transport", title: "Delivery arrived — record what you accepted", link: `/logistics/jobs/${jobId}`, dedupeKey: `arrived:${stopId}` });
  });
}

/**
 * Receiver records accepted/rejected quantities per allocation. accepted + rejected must equal collected.
 * Rejected food reopens that part of the need and is queued for an operations resolution (never re-listed).
 */
export async function recordReceipt(actor: Actor, jobId: string, stopId: string, lines: Record<string, { accepted: number; rejected: number; reason?: string }>, condition: string) {
  const c = actor.ctx;
  if (!c || c.tenantKind !== "RECIPIENT" || !["OWNER", "COORDINATOR"].includes(c.role)) throw forbidden();
  return tx(async (t) => {
    const job = await t.deliveryJob.findUnique({ where: { id: jobId }, include: { stops: true, allocations: { include: { ticket: true, foodItem: { include: { lot: true } } } } } });
    if (!job) throw notFound();
    // One receipt per drop-off stop (an org may have several tickets, hence several stops, on one job).
    const stop = job.stops.find((s) => s.id === stopId && s.kind === "DROPOFF" && s.tenantId === c.tenantId);
    if (!stop) throw notFound();
    if (stop.doneAt) throw conflict("Receipt already recorded.");
    if (!["IN_TRANSIT", "DELIVERED"].includes(job.status)) throw conflict("Nothing has been delivered yet.");
    const mine = job.allocations.filter((a) => a.ticketId === stop.ticketId && a.status === "COLLECTED");
    let rejectedAny = false, acceptedTotal = 0;
    for (const a of mine) {
      const l = lines[a.id];
      if (!l) throw invalid(`${a.foodItem.name}: record the accepted and rejected quantities.`);
      const acc = Math.round(Number(l.accepted)), rej = Math.round(Number(l.rejected));
      if (acc < 0 || rej < 0 || acc + rej !== a.collectedQty) throw invalid(`${a.foodItem.name}: accepted + rejected must equal the ${a.collectedQty} collected.`);
      if (rej > 0 && !(l.reason ?? "").trim()) throw invalid(`${a.foodItem.name}: give a reason for the rejected quantity.`);
      await t.allocation.update({ where: { id: a.id }, data: { acceptedQty: acc, rejectedQty: rej, status: rej ? "PARTIAL" : "DELIVERED" } });
      if (acc) await t.inventoryMovement.create({ data: { foodItemId: a.foodItemId, allocationId: a.id, type: "ACCEPT", quantity: acc, actorId: actor.userId } });
      if (rej) {
        rejectedAny = true;
        await t.$executeRaw`UPDATE "TicketRequirement" SET "reservedQty" = "reservedQty" - ${rej} WHERE "id" = ${a.requirementId}`;
        await t.inventoryMovement.create({ data: { foodItemId: a.foodItemId, allocationId: a.id, type: "REJECT", quantity: rej, reason: l.reason, actorId: actor.userId } });
      }
      acceptedTotal += acc;
      await refreshTicketStatus(t, a.ticketId);
    }
    await t.deliveryStop.update({ where: { id: stop.id }, data: { doneAt: now(), actualQty: acceptedTotal, arrivedAt: stop.arrivedAt ?? now() } });
    await t.handoverEvent.create({ data: { jobId, stopId: stop.id, type: "RECEIVED", actorId: actor.userId, tenantId: c.tenantId, notes: condition } });
    // Close the job when every drop-off is recorded.
    const fresh = await t.deliveryStop.findMany({ where: { jobId, kind: "DROPOFF" } });
    if (fresh.every((s) => s.doneAt)) {
      if (job.status === "IN_TRANSIT") await moveJob(t, jobId, "IN_TRANSIT", "DELIVERED", actor.userId);
      const all = await t.allocation.findMany({ where: { jobId } });
      const partial = all.some((a) => a.rejectedQty > 0 || a.status === "RELEASED");
      await moveJob(t, jobId, "DELIVERED", partial ? "PARTIALLY_COMPLETED" : "COMPLETED", actor.userId);
    }
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "job.receipt", entityType: "DeliveryJob", entityId: jobId, data: { lines, condition } });
    const restaurants = [...new Set(mine.map((a) => a.foodItem.lot.tenantId))];
    for (const r of restaurants) await notify(t, { userIds: await memberIds(t, r, ["OWNER", "MANAGER"]), tenantId: r, type: "receipt", title: "Receipt confirmed", body: `${acceptedTotal} accepted${rejectedAny ? ", some rejected" : ""}`, link: `/restaurant/surplus`, dedupeKey: `receipt:${stop.id}:${r}` });
    if (rejectedAny) await notify(t, { userIds: await adminIds(t), type: "ops", title: "Collected food rejected at receipt — resolution needed", link: `/admin/ops`, dedupeKey: `rejected:${stop.id}` });
  });
}

/** Fail a job. Uncollected food is released; collected food is held for an ops resolution (never re-listed). */
export async function failJob(actor: Actor, jobId: string, reason: string) {
  if ((reason ?? "").trim().length < 3) throw invalid("Give a reason.", { reason: "Required" });
  return tx(async (t) => {
    const job = await t.deliveryJob.findUnique({ where: { id: jobId }, include: { stops: true, allocations: true } });
    if (!job) throw notFound();
    const isCollector = job.collectorId === actor.userId;
    if (!isCollector) await loadJobForDispatcher(t, actor, jobId);
    const before = job.status;
    for (const a of job.allocations) {
      if (a.status === "RESERVED") {
        await t.$executeRaw`UPDATE "FoodItem" SET "allocatedQty" = "allocatedQty" - ${a.quantity} WHERE "id" = ${a.foodItemId}`;
        await t.$executeRaw`UPDATE "TicketRequirement" SET "reservedQty" = "reservedQty" - ${a.quantity} WHERE "id" = ${a.requirementId}`;
        await t.allocation.update({ where: { id: a.id }, data: { status: "RELEASED" } });
        await t.inventoryMovement.create({ data: { foodItemId: a.foodItemId, allocationId: a.id, type: "RELEASE", quantity: a.quantity, reason: `Job failed: ${reason}`, actorId: actor.userId } });
      } else if (a.status === "COLLECTED") {
        await t.$executeRaw`UPDATE "TicketRequirement" SET "reservedQty" = "reservedQty" - ${a.collectedQty} WHERE "id" = ${a.requirementId}`;
        await t.allocation.update({ where: { id: a.id }, data: { status: "FAILED" } });
      }
      await refreshTicketStatus(t, a.ticketId);
    }
    await moveJob(t, jobId, before, "FAILED", actor.userId, { failureReason: reason });
    await t.handoverEvent.create({ data: { jobId, type: "FAILED", actorId: actor.userId, notes: reason } });
    const parties = [...new Set(job.stops.map((s) => s.tenantId))];
    for (const p of parties) await notify(t, { userIds: await memberIds(t, p, ["OWNER", "COORDINATOR", "MANAGER"]), type: "transport", title: "Collection failed", body: reason, link: `/logistics/jobs/${jobId}`, dedupeKey: `failed:${jobId}:${p}` });
    await notify(t, { userIds: await adminIds(t), type: "ops", title: "Delivery job failed — resolution needed", body: reason, link: `/admin/ops`, dedupeKey: `failed-admin:${jobId}` });
  });
}

/** Cancel before collection: reservations stay held (transport pending) until their hold expires. */
export async function cancelJob(actor: Actor, jobId: string, reason: string) {
  if ((reason ?? "").trim().length < 3) throw invalid("Give a reason.", { reason: "Required" });
  return tx(async (t) => {
    const job = await loadJobForDispatcher(t, actor, jobId);
    await moveJob(t, jobId, job.status, "CANCELLED", actor.userId, { failureReason: reason });
    await t.allocation.updateMany({ where: { jobId, status: "RESERVED" }, data: { jobId: null } });
  });
}

export async function resolveJob(actor: Actor, jobId: string, resolution: string) {
  requireAdmin(actor);
  if ((resolution ?? "").trim().length < 5) throw invalid("Describe the resolution.", { resolution: "Required" });
  await db.deliveryJob.update({ where: { id: jobId }, data: { resolution } });
  await audit(db, { actorId: actor.userId, action: "job.resolve", entityType: "DeliveryJob", entityId: jobId, data: { resolution } });
}

/** Read access: admin, dispatcher, collector, or a party (pickup restaurant / drop-off org) to the job. */
export async function getJobFor(actor: Actor | null, jobId: string) {
  if (!actor) throw forbidden();
  const job = await db.deliveryJob.findUnique({
    where: { id: jobId },
    include: { stops: { orderBy: { seq: "asc" } }, allocations: { include: { foodItem: { include: { lot: true } }, ticket: { include: { tenant: true } } } }, funding: true, handovers: { orderBy: { createdAt: "asc" } } },
  });
  if (!job) throw notFound();
  const c = actor.ctx;
  const role =
    actor.isAdmin && !c ? "admin"
    : job.collectorId === actor.userId ? "collector"
    : c?.tenantKind === "LOGISTICS" && c.tenantId === job.logisticsTenantId && c.role !== "DRIVER" ? "dispatcher"
    : c && c.role !== "DRIVER" && job.stops.some((s) => s.tenantId === c.tenantId) ? "party"
    : actor.isAdmin ? "admin" : null;
  if (!role) throw notFound();
  return { job, role, receiverTenantIds: job.stops.filter((s) => s.kind === "DROPOFF").map((s) => s.tenantId), route: parseJson(job.routeSuggestion, null) };
}
