import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createOrganisation, submitApplication, reviewApplication, createInvitation, acceptInvitation } from "@/services/orgs";
import { createTicket, ticketQuantities, getTicketFor, generateRecurring, createSchedule } from "@/services/tickets";
import { confirmReady } from "@/services/surplus";
import { proposeOffer, acceptOffer, reserveLot } from "@/services/offers";
import { evaluate } from "@/services/matching";
import { POLICY_DEFAULTS } from "@/lib/policy";
import { releaseExpiredHolds } from "@/services/worker";
import { addMin, now } from "@/lib/time";
import { resetDb, user, actorFor, member, join, ticketInput, lotInput } from "./helpers";

beforeEach(resetDb);

const orgInput = {
  kind: "RECIPIENT", name: "Test Shelter", category: "SHELTER", description: "", address: "1 Road", serviceArea: "Bengaluru", hours: "", pocName: "P", pocRole: "Director",
  phone: "9000000000", backupContact: "", dailyCapacity: 100, beneficiaryInfo: "", dietAccepted: ["VEG"], allergensOk: "", exclusions: "", programmeNotes: "",
  storageCapacity: "", packingNeeds: "", acceptsPartial: "on", acceptsComponents: "on",
};

describe("1. onboarding and verification gate ticket publishing", () => {
  it("pending org cannot publish; approved org can; no self-approval", async () => {
    const u = await user();
    const t = await createOrganisation(await actorFor(u.id), orgInput);
    const owner = await actorFor(u.id, t.id);
    // Draft allowed, publish blocked while pending.
    await expect(createTicket(owner, ticketInput(), true)).rejects.toThrow(/approved/);
    await createTicket(owner, ticketInput(), false);
    await submitApplication(owner, { declaration: "on", registrationDetails: "REG-123" });

    // An admin who is a member of the org cannot review it.
    const selfAdmin = await db.user.update({ where: { id: u.id }, data: { isPlatformAdmin: true } });
    const app = await db.verificationApplication.findFirstOrThrow({ where: { tenantId: t.id } });
    await expect(reviewApplication(await actorFor(selfAdmin.id), app.id, { action: "START", reason: "" })).rejects.toThrow(/belong/);
    await db.user.update({ where: { id: u.id }, data: { isPlatformAdmin: false } });

    const admin = await actorFor((await user({ admin: true })).id);
    await reviewApplication(admin, app.id, { action: "START", reason: "" });
    await reviewApplication(admin, app.id, { action: "APPROVE", reason: "ok" });
    const ownerNow = await actorFor(u.id, t.id);
    const tk = await createTicket(ownerNow, ticketInput(), true);
    expect(tk.status).toBe("OPEN");
    expect(await db.verificationReview.count({ where: { applicationId: app.id } })).toBe(3);
  });

  it("non-admin cannot review", async () => {
    const { actor, tenant } = await member("RECIPIENT", "OWNER", "SUBMITTED");
    const app = await db.verificationApplication.create({ data: { tenantId: tenant.id, status: "SUBMITTED" } });
    await expect(reviewApplication(actor, app.id, { action: "APPROVE", reason: "" })).rejects.toThrow();
  });
});

describe("2. roles: invitations, coordinator, viewer, public buyer", () => {
  it("coordinator acts only for its org; viewer and buyer are blocked", async () => {
    const { actor: owner, tenant } = await member("RECIPIENT");
    const token = await createInvitation(owner, "COORDINATOR");
    const coordUser = await user();
    await acceptInvitation(await actorFor(coordUser.id), token);
    await expect(acceptInvitation(await actorFor((await user()).id), token)).rejects.toThrow(/invalid|used/);
    const coord = await actorFor(coordUser.id, tenant.id);
    const tk = await createTicket(coord, ticketInput(), true);
    expect(tk.tenantId).toBe(tenant.id);

    const viewer = await join(tenant.id, "VIEWER");
    await expect(createTicket(viewer, ticketInput(), true)).rejects.toThrow(/role/);
    const buyer = await actorFor((await user()).id);
    await expect(createTicket(buyer, ticketInput(), true)).rejects.toThrow(/organisation/);

    // Another org's coordinator cannot read this ticket.
    const other = await member("RECIPIENT", "COORDINATOR");
    await expect(getTicketFor(other.actor, tk.id)).rejects.toThrow(/Not found/);
  });
});

async function setupLot(qty: number, extra: Record<string, unknown> = {}, items?: unknown[]) {
  const r = await member("RESTAURANT");
  const lot = await confirmReady(r.actor, lotInput(extra, items ?? [{ name: "Veg meal", kind: "MEAL", unit: "PLATES", quantity: qty, allergens: ["milk"], allergensUnknown: false }]));
  return { ...r, lot };
}

describe("3. 80-plate ticket filled 50 + 30", () => {
  it("tracks remaining demand per source", async () => {
    const org = await member("RECIPIENT");
    const tk = await createTicket(org.actor, ticketInput({ plates: 80 }), true);
    const A = await setupLot(50), B = await setupLot(30);
    const oA = await proposeOffer(A.actor, A.lot.id, tk.id, "k-a");
    await acceptOffer(org.actor, oA.id);
    let q = (await ticketQuantities(tk.id))[0];
    expect(q).toMatchObject({ requested: 80, reserved: 50, remaining: 30 });
    const oB = await proposeOffer(B.actor, B.lot.id, tk.id, "k-b");
    await acceptOffer(org.actor, oB.id);
    q = (await ticketQuantities(tk.id))[0];
    expect(q).toMatchObject({ requested: 80, reserved: 80, remaining: 0 });
    expect((await db.needTicket.findUniqueOrThrow({ where: { id: tk.id } })).status).toBe("FILLED");
  });

  it("components stay in their own units and never add up to plates", async () => {
    const org = await member("RECIPIENT");
    const tk = await createTicket(org.actor, ticketInput({ foodCategory: "COMPONENTS", components: [{ name: "Rice", unit: "KG", quantity: 20 }, { name: "Dal", unit: "LITRES", quantity: 10 }] }), true);
    const r = await setupLot(0, {}, [{ name: "Rice", kind: "COMPONENT", unit: "KG", quantity: 12, allergens: [], allergensUnknown: false }, { name: "Dal", kind: "COMPONENT", unit: "LITRES", quantity: 10, allergens: [], allergensUnknown: false }]);
    await reserveLot(org.actor, r.lot.id, tk.id, "comp-1");
    const q = await ticketQuantities(tk.id);
    expect(q.find((x) => x.name === "Rice")).toMatchObject({ unit: "KG", reserved: 12, remaining: 8 });
    expect(q.find((x) => x.name === "Dal")).toMatchObject({ unit: "LITRES", reserved: 10, remaining: 0 });
    expect(q.some((x) => x.unit === "PLATES")).toBe(false);
  });
});

describe("4. concurrency cannot over-reserve", () => {
  it("two orgs racing for the same 30 plates get at most 30 total", async () => {
    const r = await setupLot(30);
    const o1 = await member("RECIPIENT"), o2 = await member("RECIPIENT");
    const t1 = await createTicket(o1.actor, ticketInput({ plates: 25, peopleCount: 25 }), true);
    const t2 = await createTicket(o2.actor, ticketInput({ plates: 25, peopleCount: 25 }), true);
    const results = await Promise.allSettled([reserveLot(o1.actor, r.lot.id, t1.id, "race-1"), reserveLot(o2.actor, r.lot.id, t2.id, "race-2")]);
    const item = await db.foodItem.findFirstOrThrow({ where: { lotId: r.lot.id } });
    expect(item.allocatedQty).toBeLessThanOrEqual(30);
    const allocated = await db.allocation.aggregate({ where: { foodItemId: item.id, status: "RESERVED" }, _sum: { quantity: true } });
    expect(allocated._sum.quantity).toBe(item.allocatedQty);
    expect(results.some((x) => x.status === "fulfilled")).toBe(true);
  });

  it("the same offer cannot be accepted twice", async () => {
    const r = await setupLot(50);
    const org = await member("RECIPIENT");
    const coord = await join(org.tenant.id, "COORDINATOR");
    const tk = await createTicket(org.actor, ticketInput({ plates: 40, peopleCount: 40 }), true);
    const o = await proposeOffer(r.actor, r.lot.id, tk.id, "dbl");
    const res = await Promise.allSettled([acceptOffer(org.actor, o.id), acceptOffer(coord, o.id)]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.allocation.count({ where: { offerId: o.id } })).toBe(1);
  });
});

describe("5. eligibility hard filters", () => {
  async function pair(ticketOver: Record<string, unknown>, lotOver: Record<string, unknown> = {}, items?: unknown[]) {
    const org = await member("RECIPIENT");
    const tk = await createTicket(org.actor, ticketInput(ticketOver), true);
    const r = await setupLot(40, lotOver, items);
    const T = await db.needTicket.findUniqueOrThrow({ where: { id: tk.id }, include: { tenant: true, requirements: true } });
    const L = await db.surplusLot.findUniqueOrThrow({ where: { id: r.lot.id }, include: { tenant: true, items: true } });
    return { T, L, org, r };
  }
  it("unknown allergens cannot satisfy an exclusion", async () => {
    const { T, L } = await pair({ exclusions: "peanut" }, {}, [{ name: "Meal", kind: "MEAL", unit: "PLATES", quantity: 40, allergens: [], allergensUnknown: true }]);
    const m = evaluate(T, L, POLICY_DEFAULTS, now());
    expect(m.eligible).toBe(false);
    expect(m.reasons.join()).toMatch(/allergen information unknown/);
  });
  it("incompatible units are not matched", async () => {
    const { T, L } = await pair({}, {}, [{ name: "Rice", kind: "COMPONENT", unit: "KG", quantity: 40, allergens: [], allergensUnknown: false }]);
    expect(evaluate(T, L, POLICY_DEFAULTS, now()).eligible).toBe(false);
  });
  it("impossible timing is rejected", async () => {
    const { T, L } = await pair({ receiveFrom: (await import("./helpers")).local(400), latestDelivery: (await import("./helpers")).local(500), servingTime: (await import("./helpers")).local(520) });
    const m = evaluate(T, L, POLICY_DEFAULTS, now());
    expect(m.eligible).toBe(false);
    expect(m.reasons.join()).toMatch(/consumption deadline/);
  });
  it("expired food is rejected and cannot be reserved", async () => {
    const { T, L, org } = await pair({});
    const later = addMin(now(), 120); // past pickup deadline (90 min)
    expect(evaluate(T, L, POLICY_DEFAULTS, later).reasons.join()).toMatch(/Pickup deadline has passed/);
    await db.surplusLot.update({ where: { id: L.id }, data: { pickupDeadline: addMin(now(), -1) } });
    await expect(reserveLot(org.actor, L.id, T.id, "late")).rejects.toThrow(/Not eligible/);
  });
  it("expected (unconfirmed) surplus cannot be reserved", async () => {
    const { T, L } = await pair({});
    await db.surplusLot.update({ where: { id: L.id }, data: { stage: "EXPECTED" } });
    const L2 = await db.surplusLot.findUniqueOrThrow({ where: { id: L.id }, include: { tenant: true, items: true } });
    expect(evaluate(T, L2, POLICY_DEFAULTS, now()).reasons.join()).toMatch(/estimate/);
  });
});

describe("6. worker idempotency and hold expiry", () => {
  it("retried recurring generation creates one ticket per occurrence", async () => {
    const org = await member("RECIPIENT");
    const today = new Date().toISOString().slice(0, 10);
    const tpl = ticketInput();
    await createSchedule(org.actor, tpl, { daysOfWeek: ["0", "1", "2", "3", "4", "5", "6"], localTime: "23:30", startDate: today, exceptions: "" });
    const a = await generateRecurring(2);
    const b = await generateRecurring(2);
    const both = await Promise.all([generateRecurring(2), generateRecurring(2)]);
    const count = await db.needTicket.count({ where: { scheduleId: { not: null } } });
    expect(b + both[0] + both[1]).toBe(0);
    expect(count).toBe(a);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("expired holds release only the uncollected quantity", async () => {
    const org = await member("RECIPIENT");
    const tk = await createTicket(org.actor, ticketInput({ plates: 40, peopleCount: 40 }), true);
    const r = await setupLot(50);
    await reserveLot(org.actor, r.lot.id, tk.id, "h1");
    const a = await db.allocation.findFirstOrThrow({ where: { ticketId: tk.id } });
    await db.allocation.update({ where: { id: a.id }, data: { holdExpiresAt: addMin(now(), -1) } });
    const res = await releaseExpiredHolds();
    expect(res.released).toBe(1);
    expect((await releaseExpiredHolds()).released).toBe(0);
    const item = await db.foodItem.findFirstOrThrow({ where: { lotId: r.lot.id } });
    expect(item.allocatedQty).toBe(0);
    expect((await ticketQuantities(tk.id))[0].remaining).toBe(40);
  });
});
