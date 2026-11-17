import { db, tx, type Tx } from "@/lib/db";
import { audit, notify, adminIds, memberIds } from "@/lib/audit";
import { type Actor, requireActiveRecipient, requireCtx, requireAdmin } from "@/lib/authz";
import { conflict, forbidden, invalid, notFound, parseJson, MEAL_SLOTS, PURPOSES, UNITS } from "@/lib/domain";
import { getPolicy } from "@/lib/policy";
import { localDate, localToUtc, now, parseLocalInput } from "@/lib/time";
import { parse, z, str, reqStr, posInt, optNum, bool, strList } from "@/lib/validate";
import { releaseAllocation } from "./offers";

const reqLine = z.object({
  name: reqStr(60),
  unit: z.enum(UNITS),
  quantity: posInt(100000),
  servingNote: str(200).default(""),
});

export const ticketSchema = z
  .object({
    title: reqStr(120),
    branchId: z.string().optional(),
    purpose: z.enum(Object.keys(PURPOSES) as [string, ...string[]]),
    mealSlot: z.enum(MEAL_SLOTS),
    needDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    peopleCount: posInt(100000),
    foodCategory: z.enum(["COMPLETE_MEALS", "PACKAGED", "COMPONENTS"]),
    plates: optNum,
    packagedUnits: optNum,
    components: z.preprocess((v) => (typeof v === "string" ? parseJson(v, []) : v ?? []), z.array(reqLine)).default([]),
    dietPref: z.enum(["VEG", "NONVEG", "VEGAN", "ANY"]),
    exclusions: strList,
    otherDietary: str(300),
    receiveFrom: reqStr(20, "Required"),
    latestDelivery: reqStr(20, "Required"),
    servingTime: reqStr(20, "Required"),
    partialOk: bool,
    minUseful: optNum,
    fulfilment: z.enum(["PICKUP_BY_ORG", "DELIVERY"]),
    deliveryAddress: str(300),
    lat: optNum,
    lng: optNum,
    maxDistanceKm: optNum,
    receivingContact: str(120),
    storageNotes: str(300),
    containers: str(200),
    unloading: str(300),
    transportFunding: z.enum(["ORG", "RESTAURANT", "SPONSOR", "PLATFORM", "UNDECIDED"]),
    urgent: bool,
    urgencyReason: str(300),
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (v.foodCategory === "COMPLETE_MEALS" && !(Number(v.plates) > 0)) add("plates", "Enter the number of complete-meal plates");
    if (v.foodCategory === "PACKAGED" && !(Number(v.packagedUnits) > 0)) add("packagedUnits", "Enter the number of packaged items");
    if (v.foodCategory === "COMPONENTS" && !v.components.length) add("components", "Add at least one component with its unit");
    if (v.fulfilment === "DELIVERY" && v.deliveryAddress.length < 5) add("deliveryAddress", "Delivery address is required");
    if (v.fulfilment === "DELIVERY" && v.receivingContact.length < 5) add("receivingContact", "Receiving contact is required");
    if (v.urgent && v.urgencyReason.length < 5) add("urgencyReason", "Explain why this is urgent");
  });

function buildRequirements(v: z.infer<typeof ticketSchema>) {
  if (v.foodCategory === "COMPLETE_MEALS") return [{ kind: "MEAL", name: "Complete meal plates", unit: "PLATES", quantity: Number(v.plates), servingNote: "" }];
  if (v.foodCategory === "PACKAGED") return [{ kind: "PACKAGED", name: "Packaged food items", unit: "PIECES", quantity: Number(v.packagedUnits), servingNote: "" }];
  // Components are tracked per unit and never converted into plates.
  return v.components.map((c) => ({ kind: "COMPONENT", ...c, name: c.name.trim() }));
}

/** Server-side checks shared by create/edit/recurring generation. Returns fields + soft warnings (flags). */
async function prepare(t: Tx, tenantId: string, v: z.infer<typeof ticketSchema>, tz: string, excludeId?: string) {
  const policy = await getPolicy(t);
  const tenant = await t.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const receiveFrom = parseLocalInput(v.receiveFrom, tz), latestDelivery = parseLocalInput(v.latestDelivery, tz), servingTime = parseLocalInput(v.servingTime, tz);
  const fe: Record<string, string> = {};
  if (!receiveFrom) fe.receiveFrom = "Invalid time";
  if (!latestDelivery) fe.latestDelivery = "Invalid time";
  if (!servingTime) fe.servingTime = "Invalid time";
  if (receiveFrom && latestDelivery && latestDelivery <= receiveFrom) fe.latestDelivery = "Must be after the start of the receiving window";
  if (latestDelivery && servingTime && servingTime < latestDelivery) fe.servingTime = "Serving time cannot be before the latest delivery time";
  const reqs = buildRequirements(v);
  const plates = reqs.filter((r) => r.unit === "PLATES").reduce((s, r) => s + r.quantity, 0);
  if (plates > policy.maxPlatesPerTicket) fe.plates = `At most ${policy.maxPlatesPerTicket} plates per ticket`;
  if (v.peopleCount > policy.maxPeoplePerTicket) fe.peopleCount = `At most ${policy.maxPeoplePerTicket} people per ticket`;
  const minUseful = Math.max(1, Math.round(Number(v.minUseful ?? 1)));
  if (Object.keys(fe).length) throw invalid("Please fix the highlighted fields.", fe);

  const allowed = parseJson<string[]>(tenant.restrictedFoodTypes, []);
  if (allowed.length && !allowed.includes(v.foodCategory)) throw invalid(`Your organisation is approved only for: ${allowed.join(", ").toLowerCase()}.`, { foodCategory: "Not permitted for this organisation" });
  if (v.foodCategory === "COMPONENTS" && !tenant.acceptsComponents) throw invalid("Your profile says you do not accept component donations.", { foodCategory: "Update your profile first" });

  // Soft warnings for admin review: duplicates and unrealistic quantities.
  const flags: string[] = [];
  const needDate = localToUtc(v.needDate, "00:00", tz);
  const dup = await t.needTicket.findFirst({
    where: { tenantId, needDate, mealSlot: v.mealSlot, status: { in: ["OPEN", "DRAFT", "FILLED"] }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (dup) flags.push(`Possible duplicate of "${dup.title}" (same date and meal slot)`);
  const branch = v.branchId ? await t.branch.findFirst({ where: { id: v.branchId, tenantId } }) : null;
  if (v.branchId && !branch) throw invalid("Unknown branch.", { branchId: "Choose one of your branches" });
  const cap = branch?.maxPlatesPerDay ?? tenant.dailyCapacity;
  if (cap && plates > cap) flags.push(`Requested ${plates} plates exceeds declared capacity ${cap}`);
  if (cap && v.peopleCount > cap * 1.5) flags.push(`People count ${v.peopleCount} is far above declared capacity ${cap}`);
  if (plates && plates > v.peopleCount * 2) flags.push("More than two plates per person requested");

  return {
    data: {
      title: v.title, branchId: v.branchId || null, purpose: v.purpose, mealSlot: v.mealSlot, needDate, peopleCount: v.peopleCount,
      foodCategory: v.foodCategory, dietPref: v.dietPref, exclusions: JSON.stringify(v.exclusions), otherDietary: v.otherDietary,
      receiveFrom: receiveFrom!, latestDelivery: latestDelivery!, servingTime: servingTime!, partialOk: v.partialOk, minUseful,
      fulfilment: v.fulfilment, deliveryAddress: v.deliveryAddress, lat: v.lat ?? branch?.lat ?? tenant.lat, lng: v.lng ?? branch?.lng ?? tenant.lng,
      maxDistanceKm: v.maxDistanceKm ?? tenant.maxDistanceKm, receivingContact: v.receivingContact, storageNotes: v.storageNotes,
      containers: v.containers, unloading: v.unloading, transportFunding: v.transportFunding,
      urgency: v.urgent ? "URGENT_PENDING" : "NORMAL", urgencyReason: v.urgencyReason, flags: JSON.stringify(flags),
    },
    reqs,
    flags,
  };
}

/** Create a draft or publish. Drafts are allowed while pending verification; publishing requires approval. */
export async function createTicket(actor: Actor, raw: unknown, publish: boolean) {
  const c = publish ? requireActiveRecipient(actor) : requireCtx(actor, ["RECIPIENT"], ["OWNER", "COORDINATOR"]);
  const v = parse(ticketSchema, raw);
  return tx(async (t) => {
    const p = await prepare(t, c.tenantId, v, c.timezone);
    if (publish && p.data.latestDelivery <= now()) throw invalid("The latest delivery time has already passed.", { latestDelivery: "Must be in the future" });
    const ticket = await t.needTicket.create({
      data: { ...p.data, tenantId: c.tenantId, requesterId: actor.userId, status: publish ? "OPEN" : "DRAFT", publishedAt: publish ? now() : null, requirements: { create: p.reqs } },
    });
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: publish ? "ticket.publish" : "ticket.draft", entityType: "NeedTicket", entityId: ticket.id, data: { flags: p.flags } });
    if (publish && (p.flags.length || p.data.urgency === "URGENT_PENDING"))
      await notify(t, { userIds: await adminIds(t), type: "ticket_review", title: `Ticket needs review: ${ticket.title}`, body: [...p.flags, p.data.urgency === "URGENT_PENDING" ? "Urgency requested" : ""].filter(Boolean).join("; "), link: `/admin/tickets`, dedupeKey: `ticketreview:${ticket.id}` });
    return ticket;
  });
}

export async function updateTicket(actor: Actor, ticketId: string, raw: unknown, publish: boolean) {
  const c = publish ? requireActiveRecipient(actor) : requireCtx(actor, ["RECIPIENT"], ["OWNER", "COORDINATOR"]);
  const v = parse(ticketSchema, raw);
  return tx(async (t) => {
    const ticket = await t.needTicket.findFirst({ where: { id: ticketId, tenantId: c.tenantId }, include: { requirements: true } });
    if (!ticket) throw notFound();
    if (!["DRAFT", "OPEN"].includes(ticket.status)) throw conflict("Only draft or open tickets can be edited.");
    const p = await prepare(t, c.tenantId, v, c.timezone, ticket.id);
    const committed = ticket.requirements.filter((r) => r.reservedQty > 0);
    if (committed.length) {
      // Allocated tickets: keep requirement structure; quantities can't drop below commitments.
      for (const r of committed) {
        const nr = p.reqs.find((x) => x.name === r.name && x.unit === r.unit);
        if (!nr) throw conflict(`"${r.name}" already has ${r.reservedQty} ${r.unit.toLowerCase()} committed; resolve those allocations before removing it.`);
        if (nr.quantity < r.reservedQty) throw conflict(`"${r.name}" cannot go below ${r.reservedQty} (already committed). Cancel those allocations first.`);
      }
      if (p.data.latestDelivery.getTime() !== ticket.latestDelivery.getTime() || p.data.servingTime.getTime() !== ticket.servingTime.getTime())
        throw conflict("Timing cannot change while food is committed; resolve the allocations first.");
    }
    for (const nr of p.reqs) {
      const r = ticket.requirements.find((x) => x.name === nr.name && x.unit === nr.unit);
      if (r) await t.ticketRequirement.update({ where: { id: r.id }, data: { quantity: nr.quantity, servingNote: nr.servingNote } });
      else await t.ticketRequirement.create({ data: { ...nr, ticketId } });
    }
    for (const r of ticket.requirements) if (r.reservedQty === 0 && !p.reqs.some((x) => x.name === r.name && x.unit === r.unit)) {
      await t.offerLine.deleteMany({ where: { requirementId: r.id, offer: { status: { not: "ACCEPTED" } } } });
      await t.ticketRequirement.delete({ where: { id: r.id } }).catch(() => undefined);
    }
    const status = ticket.status === "DRAFT" && publish ? "OPEN" : ticket.status;
    await t.needTicket.update({ where: { id: ticketId }, data: { ...p.data, status, publishedAt: status === "OPEN" && !ticket.publishedAt ? now() : undefined } });
    await refreshTicketStatus(t, ticketId);
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "ticket.update", entityType: "NeedTicket", entityId: ticketId, data: { flags: p.flags } });
  });
}

export async function cancelTicket(actor: Actor, ticketId: string, reason: string) {
  const c = requireCtx(actor, ["RECIPIENT"], ["OWNER", "COORDINATOR"]);
  if ((reason ?? "").trim().length < 3) throw invalid("Give a reason.", { reason: "Required" });
  return tx(async (t) => {
    const ticket = await t.needTicket.findFirst({ where: { id: ticketId, tenantId: c.tenantId } });
    if (!ticket) throw notFound();
    if (!["DRAFT", "OPEN", "FILLED"].includes(ticket.status)) throw conflict("This ticket is already closed.");
    const inFlight = await t.allocation.count({ where: { ticketId, status: "COLLECTED" } });
    if (inFlight) throw conflict("Food is already collected for this ticket; record receipt or a failure before cancelling.");
    const held = await t.allocation.findMany({ where: { ticketId, status: "RESERVED" } });
    for (const a of held) await releaseAllocation(t, a.id, `Ticket cancelled: ${reason}`, actor.userId);
    await t.offer.updateMany({ where: { ticketId, status: "PROPOSED" }, data: { status: "WITHDRAWN", reason: "Ticket cancelled", decidedAt: now() } });
    await t.needTicket.update({ where: { id: ticketId }, data: { status: "CANCELLED" } });
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "ticket.cancel", entityType: "NeedTicket", entityId: ticketId, data: { reason, released: held.length } });
  });
}

/** Admin: approve/deny urgency (policy-controlled priority). */
export async function reviewUrgency(actor: Actor, ticketId: string, approve: boolean, reason: string) {
  requireAdmin(actor);
  return tx(async (t) => {
    const tk = await t.needTicket.findUnique({ where: { id: ticketId } });
    if (!tk || tk.urgency !== "URGENT_PENDING") throw conflict("No urgency request pending.");
    await t.needTicket.update({ where: { id: ticketId }, data: { urgency: approve ? "URGENT" : "NORMAL" } });
    await audit(t, { actorId: actor.userId, action: approve ? "ticket.urgency.approve" : "ticket.urgency.deny", entityType: "NeedTicket", entityId: ticketId, data: { reason } });
  });
}

/** Mark FILLED when every requirement is fully committed; reopen when need returns. */
export async function refreshTicketStatus(t: Tx, ticketId: string) {
  const tk = await t.needTicket.findUnique({ where: { id: ticketId }, include: { requirements: true } });
  if (!tk) return;
  const full = tk.requirements.length > 0 && tk.requirements.every((r) => r.reservedQty >= r.quantity);
  if (tk.status === "OPEN" && full) await t.needTicket.update({ where: { id: ticketId }, data: { status: "FILLED" } });
  if (tk.status === "FILLED" && !full) await t.needTicket.update({ where: { id: ticketId }, data: { status: tk.latestDelivery > now() ? "OPEN" : "EXPIRED" } });
}

/** Per-requirement quantities, kept separate by unit. */
export async function ticketQuantities(ticketId: string, t: Tx = db) {
  const reqs = await t.ticketRequirement.findMany({ where: { ticketId }, include: { allocations: true, offerLines: { include: { offer: true } } } });
  return reqs.map((r) => {
    const live = r.allocations.filter((a) => !["RELEASED"].includes(a.status));
    const offered = r.offerLines.filter((l) => l.offer.status === "PROPOSED").reduce((s, l) => s + l.quantity, 0);
    const reserved = live.filter((a) => a.status === "RESERVED").reduce((s, a) => s + a.quantity, 0);
    const collected = live.reduce((s, a) => s + a.collectedQty, 0);
    const accepted = live.reduce((s, a) => s + a.acceptedQty, 0);
    const rejected = live.reduce((s, a) => s + a.rejectedQty, 0);
    return { id: r.id, name: r.name, unit: r.unit, kind: r.kind, requested: r.quantity, offered, reserved, committed: r.reservedQty, collected, accepted, rejected, remaining: Math.max(0, r.quantity - r.reservedQty) };
  });
}

/**
 * Ticket visibility: owning org (all roles except driver), admin, or an approved restaurant (public-safe view, only while open).
 * Returns { ticket, view } where view = "owner" | "admin" | "supplier".
 */
export async function getTicketFor(actor: Actor | null, ticketId: string) {
  if (!actor) throw forbidden();
  const ticket = await db.needTicket.findUnique({ where: { id: ticketId }, include: { tenant: true, requirements: true } });
  if (!ticket) throw notFound();
  if (actor.isAdmin && !actor.ctx) return { ticket, view: "admin" as const };
  const c = actor.ctx;
  if (c?.tenantId === ticket.tenantId && c.role !== "DRIVER") return { ticket, view: "owner" as const };
  if (c?.tenantKind === "RESTAURANT" && c.verificationStatus === "APPROVED") {
    const hasAlloc = await db.allocation.count({ where: { ticketId, foodItem: { lot: { tenantId: c.tenantId } } } });
    if (["OPEN", "FILLED"].includes(ticket.status) || hasAlloc) return { ticket, view: "supplier" as const, hasAlloc: hasAlloc > 0 };
  }
  if (actor.isAdmin) return { ticket, view: "admin" as const };
  throw notFound(); // don't reveal existence across tenants
}

// ---------- Recurring schedules ----------

const scheduleSchema = z.object({
  daysOfWeek: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.coerce.number().int().min(0).max(6)).min(1, "Pick at least one day")),
  localTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  exceptions: strList,
  receiveLeadMin: z.coerce.number().int().min(15).max(600).default(90),
  latestLeadMin: z.coerce.number().int().min(0).max(300).default(20),
});

/** Template = ticket fields (times are offsets from the serving time). */
export async function createSchedule(actor: Actor, rawTicket: Record<string, unknown>, rawSched: unknown) {
  const c = requireActiveRecipient(actor);
  const s = parse(scheduleSchema, rawSched);
  if (s.endDate && s.endDate < s.startDate) throw invalid("End date is before start date.", { endDate: "Must be after start" });
  // Validate template using a sample occurrence.
  const sample = materialise(rawTicket, s.startDate, s.localTime, s.receiveLeadMin, s.latestLeadMin, c.timezone);
  parse(ticketSchema, sample);
  const sched = await db.recurringSchedule.create({
    data: {
      tenantId: c.tenantId, template: JSON.stringify({ ...rawTicket, receiveLeadMin: s.receiveLeadMin, latestLeadMin: s.latestLeadMin }),
      daysOfWeek: JSON.stringify(s.daysOfWeek), localTime: s.localTime, startDate: s.startDate, endDate: s.endDate ?? null,
      exceptions: JSON.stringify(s.exceptions), createdById: actor.userId,
    },
  });
  await audit(db, { actorId: actor.userId, tenantId: c.tenantId, action: "schedule.create", entityType: "RecurringSchedule", entityId: sched.id });
  return sched;
}

export async function setSchedulePaused(actor: Actor, id: string, paused: boolean) {
  const c = requireCtx(actor, ["RECIPIENT"], ["OWNER", "COORDINATOR"]);
  const r = await db.recurringSchedule.updateMany({ where: { id, tenantId: c.tenantId }, data: { paused } });
  if (!r.count) throw notFound();
  await audit(db, { actorId: actor.userId, tenantId: c.tenantId, action: paused ? "schedule.pause" : "schedule.resume", entityType: "RecurringSchedule", entityId: id });
}

function materialise(tpl: Record<string, unknown>, date: string, time: string, receiveLead: number, latestLead: number, tz: string) {
  const serve = localToUtc(date, time, tz);
  const fmt = (d: Date) => {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
    return `${localDate(d, tz)}T${p}`;
  };
  return {
    ...tpl,
    needDate: date,
    servingTime: fmt(serve),
    latestDelivery: fmt(new Date(serve.getTime() - latestLead * 60000)),
    receiveFrom: fmt(new Date(serve.getTime() - receiveLead * 60000)),
  };
}

/**
 * Generate dated tickets for the next `horizonDays` (default 2). Idempotent via occurrenceKey = scheduleId:date.
 * Policy: occurrences whose latest delivery time has passed are skipped (never created in the past); missed runs
 * are caught up for any still-future occurrence inside the horizon.
 */
export async function generateRecurring(horizonDays = 2, at = now()) {
  const schedules = await db.recurringSchedule.findMany({ where: { paused: false }, include: { tenant: true } });
  let created = 0;
  for (const s of schedules) {
    if (s.tenant.verificationStatus !== "APPROVED") continue;
    const tz = s.tenant.timezone;
    const tpl = parseJson<Record<string, unknown>>(s.template, {});
    const days = parseJson<number[]>(s.daysOfWeek, []);
    const exc = parseJson<string[]>(s.exceptions, []);
    for (let i = 0; i <= horizonDays; i++) {
      const date = localDate(new Date(at.getTime() + i * 86400000), tz);
      if (date < s.startDate || (s.endDate && date > s.endDate) || exc.includes(date)) continue;
      const dow = new Date(date + "T12:00:00Z").getUTCDay();
      if (!days.includes(dow)) continue;
      const key = `${s.id}:${date}`;
      if (await db.needTicket.findUnique({ where: { occurrenceKey: key } })) continue;
      const raw = materialise(tpl, date, s.localTime, Number(tpl.receiveLeadMin ?? 90), Number(tpl.latestLeadMin ?? 20), tz);
      const v = parse(ticketSchema, raw);
      try {
        await tx(async (t) => {
          const p = await prepare(t, s.tenantId, v, tz);
          if (p.data.latestDelivery <= at) return;
          const tk = await t.needTicket.create({
            data: { ...p.data, flags: "[]", tenantId: s.tenantId, requesterId: s.createdById, status: "OPEN", publishedAt: at, scheduleId: s.id, occurrenceKey: key, requirements: { create: p.reqs } },
          });
          await audit(t, { action: "ticket.recurring.generate", tenantId: s.tenantId, entityType: "NeedTicket", entityId: tk.id, data: { key } });
          await notify(t, { userIds: await memberIds(t, s.tenantId, ["OWNER", "COORDINATOR"]), tenantId: s.tenantId, type: "ticket", title: `Recurring ticket created for ${date}`, link: `/org/tickets/${tk.id}`, dedupeKey: `recur:${key}` });
          created++;
        });
      } catch (e) {
        // Unique violation = another worker created it first; safe to ignore.
        if (!/Unique constraint|P2002/.test(String(e))) throw e;
      }
    }
  }
  return created;
}
