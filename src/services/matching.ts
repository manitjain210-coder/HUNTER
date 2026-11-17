import { db } from "@/lib/db";
import { parseJson } from "@/lib/domain";
import { distanceKm, estTravelMin } from "@/lib/geo";
import { getPolicy, type Policy } from "@/lib/policy";
import { addMin, now } from "@/lib/time";
import type { FoodItem, NeedTicket, SurplusLot, Tenant, TicketRequirement } from "@prisma/client";

export type TicketFull = NeedTicket & { tenant: Tenant; requirements: TicketRequirement[] };
export type LotFull = SurplusLot & { tenant: Tenant; items: FoodItem[] };
export type Line = { foodItemId: string; requirementId: string; quantity: number; unit: string; name: string };
export type MatchResult = { eligible: boolean; reasons: string[]; why: string[]; score: number; lines: Line[]; distanceKm: number | null; etaMin: number | null };

const DIET_OK: Record<string, string[]> = { VEG: ["VEG", "VEGAN"], VEGAN: ["VEGAN"], NONVEG: ["VEG", "VEGAN", "NONVEG"], ANY: ["VEG", "VEGAN", "NONVEG"] };

/** Does an item satisfy a requirement? Same kind + same unit (+ same component name). Never converts units. */
export function itemFits(item: FoodItem, req: TicketRequirement) {
  if (item.unit !== req.unit) return false;
  if (item.kind !== req.kind) return false;
  if (req.kind === "COMPONENT") return item.name.trim().toLowerCase() === req.name.trim().toLowerCase();
  return true;
}

/**
 * Deterministic, explainable match. Hard filters first (any failure => ineligible with reasons), then a
 * transparent score. `recentAllocations` feeds the fairness factor (auditable, shown in `why`).
 */
export function evaluate(ticket: TicketFull, lot: LotFull, policy: Policy, at: Date, recentAllocations = 0): MatchResult {
  const reasons: string[] = [], why: string[] = [];
  const org = ticket.tenant;
  if (org.verificationStatus !== "APPROVED") reasons.push("Organisation is not verified/active");
  if (lot.tenant.verificationStatus !== "APPROVED") reasons.push("Restaurant is not approved");
  if (ticket.status !== "OPEN") reasons.push(`Ticket is ${ticket.status.toLowerCase()}`);
  if (lot.stage !== "READY") reasons.push(lot.stage === "EXPECTED" ? "Surplus is only an estimate (not confirmed ready)" : `Surplus is ${lot.stage.toLowerCase()}`);
  if (!lot.handlingDeclaration) reasons.push("Handling declaration missing");
  if (!lot.pickupDeadline || lot.pickupDeadline <= at) reasons.push("Pickup deadline has passed");
  if (!lot.consumeBy || lot.consumeBy <= at) reasons.push("Food is past its consumption deadline");
  const allowed = parseJson<string[]>(org.restrictedFoodTypes, []);
  if (allowed.length && !allowed.includes(ticket.foodCategory)) reasons.push("Organisation is not approved for this food type");
  if (!DIET_OK[ticket.dietPref]?.includes(lot.dietCategory)) reasons.push(`Diet mismatch: needs ${ticket.dietPref.toLowerCase()}, food is ${lot.dietCategory.toLowerCase()}`);

  // Distance and timing (straight-line estimate only).
  const dist = distanceKm(lot, ticket);
  let eta: number | null = null;
  if (dist == null) why.push("No coordinates: needs manual area check by operations");
  else {
    if (ticket.maxDistanceKm && dist > ticket.maxDistanceKm) reasons.push(`Too far: ${dist.toFixed(1)} km > ${ticket.maxDistanceKm} km limit`);
    eta = estTravelMin(dist, policy.avgSpeedKmh, policy.travelBufferMinutes);
  }
  const earliestPickup = lot.readyAt && lot.readyAt > at ? lot.readyAt : at;
  const arrival = addMin(earliestPickup, eta ?? policy.travelBufferMinutes);
  if (arrival > ticket.latestDelivery) reasons.push("Cannot arrive before the latest acceptable delivery time (estimate)");
  if (lot.consumeBy && addMin(ticket.servingTime, 0) > lot.consumeBy) reasons.push("Serving time is after the food's consumption deadline");
  if (lot.consumeBy && addMin(arrival, policy.servingBufferMinutes) > lot.consumeBy) reasons.push("Not enough safe time left to serve after delivery");
  if (lot.pickupDeadline && earliestPickup > lot.pickupDeadline) reasons.push("Ready time is after pickup deadline");

  // Quantity lines, per requirement, same unit only.
  const exclusions = parseJson<string[]>(ticket.exclusions, []).map((s) => s.toLowerCase());
  const lines: Line[] = [];
  const itemLeft = new Map(lot.items.map((i) => [i.id, i.quantity - i.allocatedQty]));
  let fitTotal = 0, needTotal = 0;
  for (const req of ticket.requirements) {
    let remaining = req.quantity - req.reservedQty;
    if (remaining <= 0) continue;
    needTotal += remaining;
    for (const item of lot.items) {
      if (!itemFits(item, req)) continue;
      if (exclusions.length && item.allergensUnknown) { reasons.push(`${item.name}: allergen information unknown; ticket excludes ${exclusions.join(", ")}`); continue; }
      const hit = parseJson<string[]>(item.allergens, []).map((s) => s.toLowerCase()).filter((a) => exclusions.includes(a));
      if (hit.length) { reasons.push(`${item.name} contains excluded allergen(s): ${hit.join(", ")}`); continue; }
      const left = itemLeft.get(item.id) ?? 0;
      const q = Math.min(left, remaining);
      if (q <= 0) continue;
      lines.push({ foodItemId: item.id, requirementId: req.id, quantity: q, unit: req.unit, name: req.name });
      itemLeft.set(item.id, left - q);
      remaining -= q;
      fitTotal += q;
    }
  }
  if (!lines.length) {
    const units = lot.items.map((i) => `${i.name} (${i.unit.toLowerCase()})`).join(", ");
    const needs = ticket.requirements.map((r) => `${r.name} (${r.unit.toLowerCase()})`).join(", ");
    if (!reasons.some((r) => r.includes("allergen"))) reasons.push(`No compatible items/units: offers ${units || "nothing"}; needs ${needs}`);
  } else {
    for (const l of lines) {
      const req = ticket.requirements.find((r) => r.id === l.requirementId)!;
      const rem = req.quantity - req.reservedQty;
      if (!ticket.partialOk && l.quantity < rem) reasons.push(`Ticket does not accept partial fulfilment (${l.quantity}/${rem} ${l.unit.toLowerCase()})`);
      if (l.quantity < Math.min(ticket.minUseful, rem)) reasons.push(`${l.quantity} ${l.unit.toLowerCase()} is below the minimum useful amount (${ticket.minUseful})`);
    }
  }

  // Score (only meaningful when eligible).
  let score = 0;
  if (ticket.urgency === "URGENT") { score += 30; why.push("+30 urgent (approved)"); }
  if (dist != null) { const d = Math.max(0, 25 - dist * 2); score += d; why.push(`+${d.toFixed(0)} distance ${dist.toFixed(1)} km (straight line)`); }
  if (needTotal) { const f = Math.round((fitTotal / needTotal) * 30); score += f; why.push(`+${f} quantity fit ${fitTotal}/${needTotal}`); }
  const hrs = (ticket.servingTime.getTime() - at.getTime()) / 3600000;
  const dl = Math.max(0, Math.round(15 - hrs * 3)); score += dl; if (dl) why.push(`+${dl} serving soon (${hrs.toFixed(1)} h)`);
  const fair = Math.min(20, recentAllocations * 4); score -= fair; if (fair) why.push(`-${fair} fairness: ${recentAllocations} allocations in last ${policy.fairnessLookbackDays} days`);

  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)], why, score: Math.round(score), lines, distanceKm: dist, etaMin: eta };
}

async function recentCounts(tenantIds: string[], days: number, at: Date) {
  const since = new Date(at.getTime() - days * 86400000);
  const rows = await db.allocation.groupBy({
    by: ["ticketId"], where: { createdAt: { gte: since }, status: { not: "RELEASED" }, ticket: { tenantId: { in: tenantIds } } }, _count: true,
  });
  const tickets = await db.needTicket.findMany({ where: { id: { in: rows.map((r) => r.ticketId) } }, select: { id: true, tenantId: true } });
  const m = new Map<string, number>();
  for (const r of rows) {
    const tid = tickets.find((t) => t.id === r.ticketId)!.tenantId;
    m.set(tid, (m.get(tid) ?? 0) + r._count);
  }
  return m;
}

const lotInclude = { tenant: true, items: true } as const;
const ticketInclude = { tenant: true, requirements: true } as const;

/** Rank open tickets for a lot. */
export async function matchesForLot(lotId: string, at = now()) {
  const policy = await getPolicy();
  const lot = await db.surplusLot.findUniqueOrThrow({ where: { id: lotId }, include: lotInclude });
  const tickets = await db.needTicket.findMany({ where: { status: "OPEN", latestDelivery: { gt: at } }, include: ticketInclude });
  const fair = await recentCounts([...new Set(tickets.map((t) => t.tenantId))], policy.fairnessLookbackDays, at);
  return tickets
    .map((t) => ({ ticket: t, m: evaluate(t, lot, policy, at, fair.get(t.tenantId) ?? 0) }))
    .sort((a, b) => Number(b.m.eligible) - Number(a.m.eligible) || b.m.score - a.m.score);
}

/** Rank ready lots for a ticket. */
export async function matchesForTicket(ticketId: string, at = now()) {
  const policy = await getPolicy();
  const ticket = await db.needTicket.findUniqueOrThrow({ where: { id: ticketId }, include: ticketInclude });
  const lots = await db.surplusLot.findMany({ where: { stage: "READY", pickupDeadline: { gt: at } }, include: lotInclude });
  const fair = (await recentCounts([ticket.tenantId], policy.fairnessLookbackDays, at)).get(ticket.tenantId) ?? 0;
  return lots
    .map((lot) => ({ lot, m: evaluate(ticket, lot, policy, at, fair) }))
    .sort((a, b) => Number(b.m.eligible) - Number(a.m.eligible) || b.m.score - a.m.score);
}
