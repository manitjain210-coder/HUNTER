import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createTicket, getTicketFor, ticketQuantities } from "@/services/tickets";
import { confirmReady } from "@/services/surplus";
import { reserveLot } from "@/services/offers";
import { createJob, addFunding, confirmReceiver, assignCollector, collectorAccept, arriveAtPickup, recordPickup, startTransit, markDelivered, recordReceipt, failJob, getJobFor } from "@/services/logistics";
import { quote, addToCart, checkout, confirmCollection, recordPayment, getOrderFor, parseStockCsv, applyStockImport, setBatchStatus, cartFor } from "@/services/marketplace";
import { authorizeFile, saveUpload, sniff, addImage, changeImage, imagesFor, MAX_IMAGES } from "@/services/files";
import { exportRows, toCsv, donationReport, scopeFor } from "@/services/reports";
import { addMin, now } from "@/lib/time";
import { resetDb, user, actorFor, member, join, ticketInput, lotInput } from "./helpers";

beforeEach(resetDb);

async function reservedScenario(plates = 40, lotQty = 50) {
  const org = await member("RECIPIENT");
  const tk = await createTicket(org.actor, ticketInput({ plates, peopleCount: plates }), true);
  const r = await member("RESTAURANT");
  const lot = await confirmReady(r.actor, lotInput({}, [{ name: "Veg meal", kind: "MEAL", unit: "PLATES", quantity: lotQty, allergens: [], allergensUnknown: false }]));
  await reserveLot(org.actor, lot.id, tk.id, `res-${tk.id}`);
  const alloc = await db.allocation.findFirstOrThrow({ where: { ticketId: tk.id } });
  const lg = await member("LOGISTICS", "COORDINATOR");
  const driver = await join(lg.tenant.id, "DRIVER");
  return { org, tk, r, lot, alloc, lg, driver };
}

describe("7. delivery: receiver, collector and funding gates; partial quantities; failure", () => {
  it("cannot dispatch without receiver confirmation and funding; partial pickup and receipt keep quantities right", async () => {
    const s = await reservedScenario();
    const job = await createJob(s.lg.actor, { allocationIds: [s.alloc.id], mode: "PLATFORM_DISPATCH", quoteMinor: 30000 });
    await expect(assignCollector(s.lg.actor, job.id, s.driver.userId, null)).rejects.toThrow(/receiving organisation/);
    await confirmReceiver(s.org.actor, job.id);
    await expect(assignCollector(s.lg.actor, job.id, s.driver.userId, null)).rejects.toThrow(/funding/);
    await expect(addFunding(s.org.actor, job.id, { payerType: "PLATFORM", amountMinor: 30000 })).rejects.toThrow(/admins/);
    await addFunding(s.org.actor, job.id, { payerType: "ORG", amountMinor: 30000 });
    // A driver from an unrelated tenant is not eligible.
    const stranger = await member("LOGISTICS", "DRIVER");
    await expect(assignCollector(s.lg.actor, job.id, stranger.user.id, null)).rejects.toThrow(/driver/);
    await assignCollector(s.lg.actor, job.id, s.driver.userId, null);

    await collectorAccept(s.driver, job.id);
    const stops = await db.deliveryStop.findMany({ where: { jobId: job.id } });
    const pickup = stops.find((x) => x.kind === "PICKUP")!, drop = stops.find((x) => x.kind === "DROPOFF")!;
    await arriveAtPickup(s.driver, job.id, pickup.id);
    await recordPickup(s.driver, job.id, pickup.id, { [s.alloc.id]: 35 }); // 5 short of the 40 reserved
    let item = await db.foodItem.findFirstOrThrow({ where: { lotId: s.lot.id } });
    expect(item.allocatedQty).toBe(35); // shortfall released, collected food not returned to stock
    await startTransit(s.driver, job.id);
    await markDelivered(s.driver, job.id, drop.id);
    await expect(recordReceipt(s.org.actor, job.id, drop.id, {}, "ok")).rejects.toThrow(/record the accepted/);
    await expect(recordReceipt(s.org.actor, job.id, drop.id, { [s.alloc.id]: { accepted: 30, rejected: 4 } }, "ok")).rejects.toThrow(/must equal/);
    await expect(recordReceipt(s.org.actor, job.id, drop.id, { [s.alloc.id]: { accepted: 30, rejected: 5 } }, "ok")).rejects.toThrow(/reason/);
    await recordReceipt(s.org.actor, job.id, drop.id, { [s.alloc.id]: { accepted: 30, rejected: 5, reason: "Lids broken" } }, "Mostly warm");

    const q = (await ticketQuantities(s.tk.id))[0];
    expect(q).toMatchObject({ requested: 40, collected: 35, accepted: 30, rejected: 5, remaining: 10 });
    expect((await db.needTicket.findUniqueOrThrow({ where: { id: s.tk.id } })).status).toBe("OPEN"); // partial ≠ fulfilled
    expect((await db.deliveryJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("PARTIALLY_COMPLETED");
    item = await db.foodItem.findFirstOrThrow({ where: { lotId: s.lot.id } });
    expect(item.allocatedQty).toBe(35); // rejected food never goes back on offer
    expect(await db.auditEvent.count({ where: { entityId: job.id } })).toBeGreaterThan(5);

    const rep = await donationReport(scopeFor(s.org.actor), addMin(now(), -60), addMin(now(), 60));
    expect(rep!.accepted).toEqual({ PLATES: 30 });
    expect(rep!.rejected).toEqual({ PLATES: 5 });
  });

  it("failure after collection keeps collected quantity out of the pool and reopens the need", async () => {
    const s = await reservedScenario();
    const job = await createJob(s.lg.actor, { allocationIds: [s.alloc.id], mode: "PLATFORM_DISPATCH", quoteMinor: 0 });
    await confirmReceiver(s.org.actor, job.id);
    await addFunding(s.org.actor, job.id, { payerType: "ORG", amountMinor: 0 });
    await assignCollector(s.lg.actor, job.id, s.driver.userId, null);
    await collectorAccept(s.driver, job.id);
    const pickup = (await db.deliveryStop.findMany({ where: { jobId: job.id, kind: "PICKUP" } }))[0];
    await arriveAtPickup(s.driver, job.id, pickup.id);
    await recordPickup(s.driver, job.id, pickup.id, { [s.alloc.id]: 40 });
    await failJob(s.driver, job.id, "Vehicle breakdown");
    const a = await db.allocation.findUniqueOrThrow({ where: { id: s.alloc.id } });
    expect(a.status).toBe("FAILED");
    expect((await ticketQuantities(s.tk.id))[0].remaining).toBe(40);
    expect((await db.foodItem.findFirstOrThrow({ where: { lotId: s.lot.id } })).allocatedQty).toBe(40);
  });
});

describe("8. grocery pricing, oversell and checkout changes", () => {
  async function shop(qty = 10, priceInr = 100, daysToExpiry = 2) {
    const sm = await member("SUPERMARKET");
    const p = await db.product.create({ data: { tenantId: sm.tenant.id, name: "Milk", category: "Dairy", unit: "LITRE" } });
    const b = await db.productBatch.create({ data: { productId: p.id, tenantId: sm.tenant.id, batchCode: "B1", quantity: qty, originalPriceMinor: priceInr * 100, expiryDate: addMin(now(), daysToExpiry * 1440) } });
    await db.discountRule.create({ data: { tenantId: sm.tenant.id, timeTiers: JSON.stringify([{ maxDaysLeft: 3, pct: 30 }]), qtyTiers: JSON.stringify([{ minQty: 5, pct: 10 }]), maxPct: 60, floorMinor: 1000 } });
    return { sm, b };
  }
  it("pricing formula is deterministic, capped, floored, and never higher for more units", () => {
    const rule = { id: "r", tenantId: "t", category: null, batchId: null, timeTiers: JSON.stringify([{ maxDaysLeft: 1, pct: 50 }, { maxDaysLeft: 3, pct: 30 }]), qtyTiers: JSON.stringify([{ minQty: 5, pct: 10 }, { minQty: 20, pct: 20 }]), maxPct: 55, floorMinor: 3000, illustrative: true, version: 1, active: true };
    const at = new Date("2026-01-01T00:00:00Z");
    const batch = { originalPriceMinor: 10000, expiryDate: new Date("2026-01-01T20:00:00Z") };
    const q1 = quote(batch, rule, 1, at, 80), q5 = quote(batch, rule, 5, at, 80), q20 = quote(batch, rule, 20, at, 80);
    expect(q1).toMatchObject({ daysLeft: 1, timePct: 50, qtyPct: 0, combinedPct: 50, unitMinor: 5000 });
    expect(q5.combinedPct).toBe(55); // 1-(0.5*0.9)=55 → at cap
    expect(q20).toMatchObject({ combinedPct: 55, unitMinor: 4500 });
    for (let n = 1; n < 40; n++) expect(quote(batch, rule, n + 1, at, 80).unitMinor).toBeLessThanOrEqual(quote(batch, rule, n, at, 80).unitMinor);
    expect(quote(batch, { ...rule, floorMinor: 4800 }, 20, at, 80)).toMatchObject({ unitMinor: 4800, floorApplied: true }); // floor
  });

  it("orders snapshot the batch price and cannot oversell under concurrency", async () => {
    const { b } = await shop(10);
    const u1 = await actorFor((await user()).id), u2 = await actorFor((await user()).id);
    await addToCart(u1, b.id, 6);
    await addToCart(u2, b.id, 6);
    const res = await Promise.allSettled([checkout(u1, "c1"), checkout(u2, "c2")]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const batch = await db.productBatch.findUniqueOrThrow({ where: { id: b.id } });
    expect(batch.reservedQty).toBe(6);
    const item = await db.orderItem.findFirstOrThrow();
    const snap = JSON.parse(item.pricingSnapshot);
    expect(snap).toMatchObject({ timePct: 30, qtyPct: 10, combinedPct: 37 });
    expect(item.unitPriceMinor).toBe(6300);
    // Retrying with the same key returns the same order rather than a second one.
    const winner = res[0].status === "fulfilled" ? u1 : u2;
    const again = await checkout(winner, res[0].status === "fulfilled" ? "c1" : "c2");
    expect(again).toHaveLength(1);
    expect(await db.groceryOrder.count()).toBe(1);
  });

  it("repricing and expiry between cart and checkout are surfaced", async () => {
    const { b } = await shop(10);
    const u = await actorFor((await user()).id);
    await addToCart(u, b.id, 2);
    await db.productBatch.update({ where: { id: b.id }, data: { originalPriceMinor: 12000 } });
    await expect(checkout(u, "p1")).rejects.toThrow(/price changed/);
    const cart = await cartFor(u);
    expect(cart[0].repriced).toBe(false); // acknowledged price stored
    await db.productBatch.update({ where: { id: b.id }, data: { expiryDate: addMin(now(), -1) } });
    await expect(checkout(u, "p2")).rejects.toThrow(/expired/);
  });

  it("collection moves stock to sold; payments cannot be self-marked paid outside demo; recall cancels orders", async () => {
    const { sm, b } = await shop(10);
    const u = await actorFor((await user()).id);
    await addToCart(u, b.id, 2);
    const [o] = await checkout(u, "x1");
    await expect(recordPayment(u, o.id, { method: "DEMO_SIMULATED", reference: "" }, false)).rejects.toThrow(/demo mode/);
    await expect(recordPayment(u, o.id, { method: "CASH_AT_PICKUP", reference: "" }, false)).rejects.toThrow(/seller/);
    await recordPayment(sm.actor, o.id, { method: "CASH_AT_PICKUP", reference: "till 4" }, false);
    expect((await db.groceryOrder.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe("MANUAL_REPORTED");
    await confirmCollection(sm.actor, o.id);
    const batch = await db.productBatch.findUniqueOrThrow({ where: { id: b.id } });
    expect(batch).toMatchObject({ reservedQty: 0, soldQty: 2 });

    await addToCart(u, b.id, 3);
    const [o2] = await checkout(u, "x2");
    await setBatchStatus(sm.actor, b.id, "RECALLED", "Supplier recall");
    expect((await db.groceryOrder.findUniqueOrThrow({ where: { id: o2.id } })).status).toBe("CANCELLED");
    expect((await db.productBatch.findUniqueOrThrow({ where: { id: b.id } })).reservedQty).toBe(0);
  });

  it("CSV import validates and is all-or-nothing", async () => {
    const sm = await member("SUPERMARKET");
    const bad = "product_name,category,unit,batch_code,quantity,price_inr,expiry_date\nMilk,Dairy,LITRE,A1,10,50,2099-01-01\nBread,Bakery,LOAF,A2,-3,40,2000-01-01";
    const parsed = parseStockCsv(bad);
    expect(parsed.rows[1].errors.length).toBeGreaterThan(0);
    await expect(applyStockImport(sm.actor, bad)).rejects.toThrow(/nothing was imported/);
    expect(await db.productBatch.count()).toBe(0);
    await applyStockImport(sm.actor, bad.split("\n").slice(0, 2).join("\n"));
    expect(await db.productBatch.count()).toBe(1);
  });
});

describe("9. cross-tenant direct access is rejected", () => {
  it("tickets, files, jobs, orders and exports are tenant-scoped", async () => {
    const s = await reservedScenario();
    const other = await member("RECIPIENT");
    await expect(getTicketFor(other.actor, s.tk.id)).rejects.toThrow(/Not found/);

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const f = await saveUpload(s.org.actor, { tenantId: s.org.tenant.id, purpose: "VERIFICATION", file: { name: "reg.png", bytes: png } });
    await expect(authorizeFile(other.actor, f.id)).rejects.toThrow();
    const viewer = await join(s.org.tenant.id, "VIEWER");
    await expect(authorizeFile(viewer, f.id)).rejects.toThrow(); // viewers can't open verification docs
    await expect(authorizeFile(s.org.actor, f.id)).resolves.toBeTruthy();
    expect(() => sniff(new TextEncoder().encode("<script>alert(1)</script>"))).toThrow(/Only PDF/);

    const job = await createJob(s.lg.actor, { allocationIds: [s.alloc.id], mode: "PLATFORM_DISPATCH", quoteMinor: 0 });
    await expect(getJobFor(other.actor, job.id)).rejects.toThrow(/Not found/);
    const otherDriver = await member("LOGISTICS", "DRIVER");
    await expect(getJobFor(otherDriver.actor, job.id)).rejects.toThrow(/Not found/);
    await expect(getJobFor(s.driver, job.id)).rejects.toThrow(/Not found/); // not yet assigned
    const otherLg = await member("LOGISTICS", "COORDINATOR");
    await expect(confirmReceiver(other.actor, job.id)).rejects.toThrow(/Not found/);
    await expect(addFunding(otherLg.actor, job.id, { payerType: "SPONSOR", amountMinor: 1, sponsorName: "X" })).rejects.toThrow(/Not found/);

    const rows = await exportRows(other.actor, "allocations");
    expect(rows).toHaveLength(0);
    expect((await exportRows(s.org.actor, "allocations")).length).toBe(1);
    await expect(exportRows(other.actor, "orders")).rejects.toThrow();

    const sm = await member("SUPERMARKET");
    const p = await db.product.create({ data: { tenantId: sm.tenant.id, name: "X", category: "C", unit: "ITEM" } });
    const b = await db.productBatch.create({ data: { productId: p.id, tenantId: sm.tenant.id, batchCode: "Z", quantity: 5, originalPriceMinor: 100, expiryDate: addMin(now(), 3000) } });
    const buyer = await actorFor((await user()).id);
    await addToCart(buyer, b.id, 1);
    const [o] = await checkout(buyer, "z");
    await expect(getOrderFor(other.actor, o.id)).rejects.toThrow(/Not found/);
    const sm2 = await member("SUPERMARKET");
    await expect(confirmCollection(sm2.actor, o.id)).rejects.toThrow(/Not found/);
  });

  it("CSV export escapes spreadsheet formulas", () => {
    expect(toCsv([{ a: "=HYPERLINK(1)", b: "plain", c: 'q"uote' }])).toBe(`a,b,c\n'=HYPERLINK(1),plain,"q""uote"`);
  });
});

describe("10. product and surplus photos", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  it("product photos are public; surplus photos only for organisations; owners only upload", async () => {
    const sm = await member("SUPERMARKET");
    const p = await db.product.create({ data: { tenantId: sm.tenant.id, name: "Milk", category: "Dairy", unit: "LITRE" } });
    const img = await addImage(sm.actor, { productId: p.id }, { name: "milk.png", bytes: png });
    await expect(authorizeFile(null, img.id)).resolves.toBeTruthy(); // anonymous shopper can see product photo

    const other = await member("SUPERMARKET");
    await expect(addImage(other.actor, { productId: p.id }, { name: "x.png", bytes: png })).rejects.toThrow(/Not found/);
    const viewer = await join(sm.tenant.id, "VIEWER");
    await expect(addImage(viewer, { productId: p.id }, { name: "x.png", bytes: png })).rejects.toThrow();
    const pdf = new TextEncoder().encode("%PDF-1.4 hello");
    await expect(addImage(sm.actor, { productId: p.id }, { name: "x.pdf", bytes: pdf })).rejects.toThrow(/PNG, JPEG or WebP/);

    const r = await member("RESTAURANT");
    const lot = await confirmReady(r.actor, lotInput());
    const lotImg = await addImage(r.actor, { lotId: lot.id }, { name: "food.png", bytes: png });
    await expect(authorizeFile(null, lotImg.id)).rejects.toThrow();
    await expect(authorizeFile(await actorFor((await user()).id), lotImg.id)).rejects.toThrow(); // personal buyer
    const org = await member("RECIPIENT");
    await expect(authorizeFile(org.actor, lotImg.id)).resolves.toBeTruthy();
    const pending = await member("RECIPIENT", "OWNER", "SUBMITTED");
    await expect(authorizeFile(pending.actor, lotImg.id)).rejects.toThrow();

    for (let i = 1; i < MAX_IMAGES; i++) await addImage(r.actor, { lotId: lot.id }, { name: `f${i}.png`, bytes: png });
    await expect(addImage(r.actor, { lotId: lot.id }, { name: "over.png", bytes: png })).rejects.toThrow(/Up to/);
    const ids = (await imagesFor("lot", [lot.id])).get(lot.id)!;
    await changeImage(r.actor, ids[3], "cover");
    expect((await imagesFor("lot", [lot.id])).get(lot.id)![0]).toBe(ids[3]);
  });
});
