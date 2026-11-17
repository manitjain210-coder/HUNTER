// Fictional demo data, relative to "now". Idempotent: skips if already seeded; `npm run db:reset` rebuilds from scratch.
// All people, businesses and organisations here are invented.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { attachDemoPhotos } from "./demo-photos";

const db = new PrismaClient();
export const DEMO_PASSWORD = "demo-password-123";
const off = Number(process.env.KHANA_BRIDGE_CLOCK_OFFSET_MIN ?? 0);
const NOW = new Date(Date.now() + off * 60000);
const m = (min: number) => new Date(NOW.getTime() + min * 60000);
const day = (d: number) => new Date(NOW.getTime() + d * 86400000);
const J = JSON.stringify;
const BLR = { lat: 12.9716, lng: 77.5946 };
const near = (dLat: number, dLng: number) => ({ lat: BLR.lat + dLat, lng: BLR.lng + dLng });

async function main() {
  if (await db.user.findUnique({ where: { phone: "+919000000001" } })) {
    console.log("Already seeded. Use `npm run db:reset` to rebuild.");
    return;
  }
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = (phone: string, name: string, isPlatformAdmin = false) => db.user.create({ data: { phone, name, passwordHash: hash, isDemo: true, isPlatformAdmin } });

  const admin = await user("+919000000001", "Asha Admin (demo)", true);

  type TArgs = Parameters<typeof db.tenant.create>[0]["data"];
  async function tenant(data: TArgs, members: [string, string, string][], appStatus?: string) {
    const t = await db.tenant.create({ data: { ...data, isDemo: true } });
    await db.branch.create({ data: { tenantId: t.id, name: "Main", address: t.address, lat: t.lat, lng: t.lng } });
    const users = [];
    for (const [phone, name, role] of members) {
      const u = await user(phone, name);
      await db.membership.create({ data: { userId: u.id, tenantId: t.id, role } });
      users.push(u);
    }
    const app = await db.verificationApplication.create({
      data: { tenantId: t.id, status: appStatus ?? t.verificationStatus, declarationAccepted: t.verificationStatus !== "DRAFT", declarationBy: users[0]?.id, registrationDetails: "Demo registration ref (fictional)", submittedAt: t.verificationStatus === "DRAFT" ? null : day(-10) },
    });
    if (t.verificationStatus !== "DRAFT") {
      await db.verificationReview.create({ data: { applicationId: app.id, fromStatus: "DRAFT", toStatus: "SUBMITTED", actorId: users[0].id, createdAt: day(-10) } });
      if (!["SUBMITTED"].includes(t.verificationStatus)) await db.verificationReview.create({ data: { applicationId: app.id, fromStatus: "SUBMITTED", toStatus: "UNDER_REVIEW", actorId: admin.id, createdAt: day(-9) } });
      if (["APPROVED", "SUSPENDED"].includes(t.verificationStatus)) await db.verificationReview.create({ data: { applicationId: app.id, fromStatus: "UNDER_REVIEW", toStatus: "APPROVED", actorId: admin.id, reason: "Documents checked (demo)", createdAt: day(-8) } });
      if (t.verificationStatus === "SUSPENDED") await db.verificationReview.create({ data: { applicationId: app.id, fromStatus: "APPROVED", toStatus: "SUSPENDED", actorId: admin.id, reason: "Complaint under investigation (demo)", createdAt: day(-1) } });
      if (t.verificationStatus === "CHANGES_REQUESTED") await db.verificationReview.create({ data: { applicationId: app.id, fromStatus: "UNDER_REVIEW", toStatus: "CHANGES_REQUESTED", actorId: admin.id, reason: "Please upload the trust registration certificate.", createdAt: day(-2) } });
    }
    return { t, users };
  }
  const base = { timezone: "Asia/Kolkata", serviceArea: "Bengaluru" };

  // --- Supermarkets
  const gb = await tenant({ ...base, kind: "SUPERMARKET", name: "GreenBasket Mart (demo)", address: "12 Market Rd, Jayanagar", ...near(-0.04, -0.01), pocName: "Meera", pocRole: "Store manager", phone: "+919000000011", verificationStatus: "APPROVED" },
    [["+919000000011", "Meera (GreenBasket owner)", "OWNER"], ["+919000000012", "Kiran (GreenBasket operator)", "OPERATOR"]]);
  const df = await tenant({ ...base, kind: "SUPERMARKET", name: "Daily Fresh Stores (demo)", address: "8 Lake View, Indiranagar", ...near(0.01, 0.05), pocName: "Imran", pocRole: "Owner", phone: "+919000000013", verificationStatus: "APPROVED" },
    [["+919000000013", "Imran (Daily Fresh owner)", "OWNER"]]);

  // --- Restaurants
  const rA = await tenant({ ...base, kind: "RESTAURANT", name: "Spice Route Kitchen (demo)", address: "45 MG Road", ...near(0.003, 0.01), pocName: "Arjun", pocRole: "Head chef", phone: "+919000000021", verificationStatus: "APPROVED" },
    [["+919000000021", "Arjun (Spice Route owner)", "OWNER"]]);
  const rB = await tenant({ ...base, kind: "RESTAURANT", name: "Annapoorna Bhojanalaya (demo)", address: "3 Temple St, Basavanagudi", ...near(-0.03, -0.02), pocName: "Lakshmi", pocRole: "Owner", phone: "+919000000022", verificationStatus: "APPROVED" },
    [["+919000000022", "Lakshmi (Annapoorna owner)", "OWNER"]]);
  const rC = await tenant({ ...base, kind: "RESTAURANT", name: "Coastal Curry House (demo)", address: "77 Residency Rd", ...near(0.0, 0.006), pocName: "Joseph", pocRole: "Manager", phone: "+919000000023", verificationStatus: "APPROVED" },
    [["+919000000023", "Joseph (Coastal Curry owner)", "OWNER"]]);
  await tenant({ ...base, kind: "RESTAURANT", name: "Little Tiffin Co. (demo)", address: "9 Church St", ...near(0.002, 0.004), pocName: "Nisha", pocRole: "Owner", phone: "+919000000024", verificationStatus: "SUBMITTED" },
    [["+919000000024", "Nisha (Little Tiffin owner)", "OWNER"]]);

  // --- Recipient organisations
  const recip = { ...base, kind: "RECIPIENT", hasKitchen: true, acceptsPartial: true, acceptsComponents: true, maxDistanceKm: 15, dietAccepted: J(["VEG", "VEGAN", "NONVEG"]) };
  const hope = await tenant({ ...recip, name: "Hope Shelter Trust (demo)", category: "SHELTER", address: "21 Shanti Nagar", ...near(-0.01, 0.0), pocName: "Fatima", pocRole: "Director", phone: "+919000000031", dailyCapacity: 150, beneficiaryInfo: "Adults in night shelter (~120)", publicSummary: "Night shelter serving dinner and lunch.", hasRefrigeration: true, verificationStatus: "APPROVED" },
    [["+919000000031", "Fatima (Hope Shelter POC)", "OWNER"], ["+919000000032", "Sanjay (Hope coordinator)", "COORDINATOR"], ["+919000000033", "Priya (Hope viewer)", "VIEWER"], ["+919000000034", "Ramesh (Hope driver)", "DRIVER"]]);
  const sunrise = await tenant({ ...recip, name: "Sunrise Children's Home (demo)", category: "CHILD_WELFARE", address: "5 Garden Lane, Richmond Town", ...near(-0.015, 0.008), pocName: "Grace", pocRole: "Superintendent", phone: "+919000000035", dailyCapacity: 60, beneficiaryInfo: "Children 6–16 (~50)", programmeNotes: "Residential children's home; vegetarian complete meals only; no peanuts.", exclusions: J(["peanut"]), dietAccepted: J(["VEG", "VEGAN"]), restrictedFoodTypes: J(["COMPLETE_MEALS"]), verificationStatus: "APPROVED" },
    [["+919000000035", "Grace (Sunrise POC)", "OWNER"]]);
  const ckc = await tenant({ ...recip, name: "Community Kitchen Collective (demo)", category: "COMMUNITY_KITCHEN", address: "60 Old Airport Rd", ...near(-0.005, 0.03), pocName: "Deepak", pocRole: "Coordinator", phone: "+919000000036", dailyCapacity: 300, beneficiaryInfo: "Daily free lunch (~250)", verificationStatus: "APPROVED" },
    [["+919000000036", "Deepak (Community Kitchen POC)", "OWNER"]]);
  await tenant({ ...recip, name: "City General Hospital Programme (demo)", category: "HOSPITAL", address: "1 Hospital Rd", ...near(0.02, -0.01), pocName: "Dr. Rao", pocRole: "Welfare officer", phone: "+919000000037", dailyCapacity: 100, programmeNotes: "Attendant (non-patient) meal programme only. No patient meals.", verificationStatus: "SUBMITTED" },
    [["+919000000037", "Dr. Rao (Hospital programme POC)", "OWNER"]]);
  await tenant({ ...recip, name: "New Leaf Foundation (demo)", category: "NGO", address: "14 Hosur Rd", ...near(-0.05, 0.02), pocName: "Vikram", pocRole: "Trustee", phone: "+919000000038", dailyCapacity: 80, verificationStatus: "CHANGES_REQUESTED" },
    [["+919000000038", "Vikram (New Leaf POC)", "OWNER"]]);
  await tenant({ ...recip, name: "Riverbank Relief (demo)", category: "DISASTER_RELIEF", address: "2 Riverside", ...near(0.04, 0.04), pocName: "Anita", pocRole: "Lead", phone: "+919000000039", dailyCapacity: 200, verificationStatus: "SUSPENDED" },
    [["+919000000039", "Anita (Riverbank POC)", "OWNER"]]);

  // --- Logistics
  const lg = await tenant({ ...base, kind: "LOGISTICS", name: "Khana Bridge Local Dispatch (demo)", address: "Ops desk", ...BLR, pocName: "Ops", pocRole: "Dispatcher", phone: "+919000000041", verificationStatus: "APPROVED" },
    [["+919000000041", "Kavya (dispatcher)", "COORDINATOR"], ["+919000000042", "Suresh (logistics driver)", "DRIVER"]]);
  const van = await db.vehicle.create({ data: { tenantId: lg.t.id, label: "Insulated van KA-01-DEMO", capacityKg: 300 } });
  await db.vehicle.create({ data: { tenantId: lg.t.id, label: "Cargo bike", capacityKg: 40 } });
  await db.vehicle.create({ data: { tenantId: hope.t.id, label: "Hope Shelter auto", capacityKg: 120 } });

  const buyer = await user("+919000000051", "Ravi (personal buyer)");

  // --- Marketplace
  const rule = { timeTiers: J([{ maxDaysLeft: 1, pct: 50 }, { maxDaysLeft: 3, pct: 30 }, { maxDaysLeft: 7, pct: 15 }]), qtyTiers: J([{ minQty: 5, pct: 5 }, { minQty: 20, pct: 10 }]), maxPct: 60, illustrative: true };
  await db.discountRule.create({ data: { tenantId: gb.t.id, ...rule, floorMinor: 500 } });
  await db.discountRule.create({ data: { tenantId: df.t.id, ...rule, floorMinor: 0 } });
  async function product(tenantId: string, name: string, category: string, unit: string, batches: [string, number, number, number, string?][]) {
    const p = await db.product.create({ data: { tenantId, name, category, unit } });
    const out = [];
    for (const [code, qty, priceInr, daysToExpiry, storage] of batches) {
      out.push(await db.productBatch.create({ data: { productId: p.id, tenantId, batchCode: code, quantity: qty, originalPriceMinor: priceInr * 100, expiryDate: day(daysToExpiry), storage: storage ?? "AMBIENT", pickupLocation: "Customer service desk" } }));
    }
    return out;
  }
  const milk = await product(gb.t.id, "Toned milk 1 L", "Dairy", "LITRE", [["MILK-A", 40, 56, 1.5, "CHILLED"], ["MILK-B", 60, 56, 5, "CHILLED"]]);
  await product(gb.t.id, "Whole wheat bread", "Bakery", "PACK", [["BRD-1", 25, 45, 0.8], ["BRD-2", 30, 45, 3]]);
  const tom = await product(gb.t.id, "Tomatoes", "Produce", "KG", [["TOM-1", 50, 40, 3]]);
  await product(gb.t.id, "Basmati rice 5 kg", "Staples", "PACK", [["RICE-1", 20, 520, 60]]);
  await product(gb.t.id, "Curd 400 g", "Dairy", "ITEM", [["CURD-1", 30, 35, 2, "CHILLED"]]);
  await product(gb.t.id, "Recalled snack mix", "Snacks", "PACK", [["SNK-R", 10, 60, 20]]).then(([b]) => db.productBatch.update({ where: { id: b.id }, data: { status: "RECALLED" } }));
  await product(df.t.id, "Paneer 200 g", "Dairy", "PACK", [["PAN-1", 40, 90, 4, "CHILLED"]]);
  await product(df.t.id, "Bananas", "Produce", "KG", [["BAN-1", 35, 60, 2]]);
  await product(df.t.id, "Wheat atta 5 kg", "Staples", "PACK", [["ATTA-1", 15, 260, 30]]);
  await product(df.t.id, "Expired yoghurt cups", "Dairy", "ITEM", [["YOG-X", 12, 25, -1, "CHILLED"]]);

  // Orders: one reserved (personal buyer), one collected with a manually reported payment (restaurant buyer).
  async function order(buyerId: string, buyerTenantId: string | null, batch: { id: string; tenantId: string; originalPriceMinor: number }, qty: number, unitMinor: number, status: string, pay: string) {
    const o = await db.groceryOrder.create({
      data: {
        buyerUserId: buyerId, buyerTenantId, sellerTenantId: batch.tenantId, status, paymentStatus: pay, totalMinor: unitMinor * qty, reservationExpiresAt: m(240), idempotencyKey: `seed:${batch.id}:${buyerId}`,
        collectedAt: status === "COLLECTED" ? m(-60) : null,
        items: { create: [{ batchId: batch.id, quantity: qty, unitPriceMinor: unitMinor, originalPriceMinor: batch.originalPriceMinor, pricingSnapshot: J({ note: "seeded example; illustrative discount rule", unitMinor }) }] },
      },
    });
    await db.productBatch.update({ where: { id: batch.id }, data: status === "RESERVED" ? { reservedQty: { increment: qty } } : { soldQty: { increment: qty } } });
    await db.inventoryMovement.create({ data: { batchId: batch.id, orderId: o.id, type: status === "RESERVED" ? "ORDER_RESERVE" : "ORDER_COLLECT", quantity: qty } });
    if (pay !== "PENDING") await db.paymentRecord.create({ data: { orderId: o.id, method: "CASH_AT_PICKUP", amountMinor: o.totalMinor, status: pay, recordedById: gb.users[1].id } });
    return o;
  }
  await order(buyer.id, null, milk[0], 2, 2800, "RESERVED", "PENDING");
  await order(rA.users[0].id, rA.t.id, tom[0], 20, 2520, "COLLECTED", "MANUAL_REPORTED");

  // --- Donation network helpers that keep counters consistent with allocations.
  async function lot(tenant: { t: { id: string; lat: number | null; lng: number | null } }, data: Record<string, unknown>, items: Record<string, unknown>[]) {
    return db.surplusLot.create({
      data: { tenantId: tenant.t.id, lat: tenant.t.lat, lng: tenant.t.lng, handlingDeclaration: true, storage: "HOT_HELD", packaging: "Sealed food-grade containers", ...data, items: { create: items.map((i) => ({ allergensUnknown: false, allergens: "[]", ...i })) } } as never,
      include: { items: true },
    });
  }
  async function ticket(org: { t: { id: string; lat: number | null; lng: number | null }; users: { id: string }[] }, data: Record<string, unknown>, reqs: { kind: string; name: string; unit: string; quantity: number }[]) {
    return db.needTicket.create({
      data: {
        tenantId: org.t.id, requesterId: org.users[0].id, purpose: "REGULAR_MEALS", peopleCount: 80, foodCategory: "COMPLETE_MEALS", dietPref: "ANY", fulfilment: "DELIVERY",
        deliveryAddress: "Main gate", receivingContact: "Duty coordinator +91 90000 00032", lat: org.t.lat, lng: org.t.lng, maxDistanceKm: 15, publishedAt: m(-300), ...data, requirements: { create: reqs },
      } as never,
      include: { requirements: true },
    });
  }
  async function allocate(offerTicket: { id: string; requirements: { id: string }[] }, reqIdx: number, item: { id: string; lotId: string }, qty: number, opts: { status: string; collected?: number; accepted?: number; rejected?: number; hold?: Date; jobId?: string }) {
    const offer = await db.offer.create({ data: { lotId: item.lotId, ticketId: offerTicket.id, direction: "SUPPLIER_OFFER", status: "ACCEPTED", expiresAt: m(-200), createdById: admin.id, decidedAt: m(-250), idempotencyKey: `seed:${item.id}:${offerTicket.id}`, lines: { create: [{ foodItemId: item.id, requirementId: offerTicket.requirements[reqIdx].id, quantity: qty }] } } });
    const a = await db.allocation.create({ data: { offerId: offer.id, ticketId: offerTicket.id, requirementId: offerTicket.requirements[reqIdx].id, foodItemId: item.id, quantity: qty, status: opts.status, collectedQty: opts.collected ?? 0, acceptedQty: opts.accepted ?? 0, rejectedQty: opts.rejected ?? 0, holdExpiresAt: opts.hold ?? m(90), jobId: opts.jobId } });
    const itemQty = opts.status === "RESERVED" ? qty : opts.status === "RELEASED" ? 0 : opts.collected ?? 0;
    const reqQty = opts.status === "RESERVED" ? qty : opts.status === "COLLECTED" ? opts.collected ?? 0 : ["DELIVERED", "PARTIAL"].includes(opts.status) ? opts.accepted ?? 0 : 0;
    await db.foodItem.update({ where: { id: item.id }, data: { allocatedQty: { increment: itemQty } } });
    await db.ticketRequirement.update({ where: { id: offerTicket.requirements[reqIdx].id }, data: { reservedQty: { increment: reqQty } } });
    await db.inventoryMovement.create({ data: { foodItemId: item.id, allocationId: a.id, type: "ALLOCATE", quantity: qty } });
    if (opts.status === "RELEASED") await db.inventoryMovement.create({ data: { foodItemId: item.id, allocationId: a.id, type: "RELEASE", quantity: qty, reason: "Reservation hold expired before collection" } });
    if ((opts.collected ?? 0) > 0) await db.inventoryMovement.create({ data: { foodItemId: item.id, allocationId: a.id, type: "COLLECT", quantity: opts.collected! } });
    if ((opts.accepted ?? 0) > 0) await db.inventoryMovement.create({ data: { foodItemId: item.id, allocationId: a.id, type: "ACCEPT", quantity: opts.accepted! } });
    return a;
  }

  // 1) The 80-plate example: 50 from Spice Route (delivered + accepted) and 30 from Annapoorna (reserved, transport pending).
  const t80 = await ticket(hope, { title: "Dinner for 80 residents", mealSlot: "DINNER", needDate: m(0), peopleCount: 80, dietPref: "VEG", receiveFrom: m(-60), latestDelivery: m(150), servingTime: m(180), transportFunding: "PLATFORM", status: "FILLED" }, [{ kind: "MEAL", name: "Complete meal plates", unit: "PLATES", quantity: 80 }]);
  const lotA = await lot(rA, { title: "Veg biryani with raita", stage: "CLOSED", closeReason: "Fully collected", dietCategory: "VEG", preparedAt: m(-150), readyAt: m(-120), pickupDeadline: m(-30), consumeBy: m(200), confirmedAt: m(-125) }, [{ name: "Veg biryani meal", kind: "MEAL", unit: "PLATES", quantity: 50, ingredients: "rice, vegetables, spices, curd", allergens: J(["milk"]) }]);
  const lotB = await lot(rB, { title: "South Indian veg thali", stage: "READY", dietCategory: "VEG", preparedAt: m(-40), readyAt: m(-20), pickupDeadline: m(100), consumeBy: m(240), confirmedAt: m(-25) }, [{ name: "Veg thali", kind: "MEAL", unit: "PLATES", quantity: 30, ingredients: "rice, sambar, poriyal, curd", allergens: J(["milk", "mustard"]) }]);
  const job1 = await db.deliveryJob.create({ data: { status: "COMPLETED", mode: "PLATFORM_DISPATCH", logisticsTenantId: lg.t.id, collectorId: lg.users[1].id, vehicleId: van.id, quoteMinor: 35000, handling: "HOT_HELD", routeApproved: true, receiverConfirmedAt: m(-110), receiverConfirmedById: hope.users[0].id, createdById: lg.users[0].id } });
  await allocate(t80, 0, lotA.items[0], 50, { status: "DELIVERED", collected: 50, accepted: 50, jobId: job1.id });
  await db.deliveryStop.createMany({ data: [
    { jobId: job1.id, kind: "PICKUP", tenantId: rA.t.id, lotId: lotA.id, seq: 0, address: "45 MG Road", lat: rA.t.lat, lng: rA.t.lng, plannedQty: 50, actualQty: 50, arrivedAt: m(-95), doneAt: m(-90) },
    { jobId: job1.id, kind: "DROPOFF", tenantId: hope.t.id, ticketId: t80.id, seq: 1, address: "21 Shanti Nagar", lat: hope.t.lat, lng: hope.t.lng, plannedQty: 50, actualQty: 50, arrivedAt: m(-70), doneAt: m(-65) },
  ] });
  await db.fundingCommitment.create({ data: { jobId: job1.id, payerType: "PLATFORM", amountMinor: 35000, createdById: admin.id } });
  for (const [type, at] of [["COLLECTOR_ACCEPTED", -105], ["PICKED_UP", -90], ["DELIVERED", -70], ["RECEIVED", -65]] as const)
    await db.handoverEvent.create({ data: { jobId: job1.id, type, actorId: type === "RECEIVED" ? hope.users[0].id : lg.users[1].id, createdAt: m(at), notes: type === "RECEIVED" ? "Hot, sealed, all 50 accepted" : "" } });
  await allocate(t80, 0, lotB.items[0], 30, { status: "RESERVED", hold: m(95) });

  // 2) Component request with correct units (rice kg / dal litres / rotis pieces) — partially covered.
  const tComp = await ticket(ckc, { title: "Lunch components for community kitchen", mealSlot: "LUNCH", needDate: day(1), peopleCount: 250, foodCategory: "COMPONENTS", receiveFrom: m(60 * 20), latestDelivery: m(60 * 22), servingTime: m(60 * 23), status: "OPEN" },
    [{ kind: "COMPONENT", name: "Rice", unit: "KG", quantity: 20 }, { kind: "COMPONENT", name: "Dal", unit: "LITRES", quantity: 15 }, { kind: "COMPONENT", name: "Roti", unit: "PIECES", quantity: 200 }]);
  const lotC = await lot(rC, { title: "Bulk rice and dal (veg)", stage: "READY", dietCategory: "VEG", storage: "HOT_HELD", preparedAt: m(-30), readyAt: m(-10), pickupDeadline: m(120), consumeBy: m(60 * 24), confirmedAt: m(-12), flags: J(["Declared consume-by is more than 12 h after preparation — flagged for review"]) },
    [{ name: "Rice", kind: "COMPONENT", unit: "KG", quantity: 12, ingredients: "rice" }, { name: "Dal", kind: "COMPONENT", unit: "LITRES", quantity: 10, ingredients: "toor dal, spices", allergens: J(["mustard"]) }]);
  await allocate(tComp, 0, lotC.items[0], 12, { status: "RESERVED", hold: m(110) });
  await allocate(tComp, 1, lotC.items[1], 10, { status: "RESERVED", hold: m(110) });

  // 3) Open ticket + ready lot that match (for the live demo), and a lot with unknown allergens that must not match.
  const tSun = await ticket(sunrise, { title: "Veg dinner for 40 children", mealSlot: "DINNER", needDate: m(0), peopleCount: 40, dietPref: "VEG", exclusions: J(["peanut"]), receiveFrom: m(30), latestDelivery: m(150), servingTime: m(170), status: "OPEN", urgency: "URGENT_PENDING", urgencyReason: "Regular supplier cancelled today" }, [{ kind: "MEAL", name: "Complete meal plates", unit: "PLATES", quantity: 40 }]);
  const lotD = await lot(rA, { title: "Paneer curry + jeera rice", stage: "READY", dietCategory: "VEG", preparedAt: m(-20), readyAt: m(0), pickupDeadline: m(75), consumeBy: m(240), confirmedAt: m(-5) }, [{ name: "Paneer curry meal", kind: "MEAL", unit: "PLATES", quantity: 25, ingredients: "paneer, tomato, rice", allergens: J(["milk"]) }]);
  await lot(rC, { title: "Mixed meals (allergens not recorded)", stage: "READY", dietCategory: "VEG", preparedAt: m(-15), readyAt: m(0), pickupDeadline: m(80), consumeBy: m(240), confirmedAt: m(-3) }, [{ name: "Veg pulao meal", kind: "MEAL", unit: "PLATES", quantity: 20, allergensUnknown: true }]);
  await db.offer.create({ data: { lotId: lotD.id, ticketId: tSun.id, direction: "SUPPLIER_OFFER", status: "PROPOSED", expiresAt: m(25), createdById: rA.users[0].id, idempotencyKey: "seed:pending-offer", lines: { create: [{ foodItemId: lotD.items[0].id, requirementId: tSun.requirements[0].id, quantity: 25 }] } } });

  // 4) Expected (not reservable) surplus.
  await lot(rB, { title: "Expected: evening buffet leftovers", stage: "EXPECTED", handlingDeclaration: false, dietCategory: "VEG", expectedFrom: m(180), expectedUntil: m(300), notes: "Estimate only" }, [{ name: "Buffet meal", kind: "MEAL", unit: "PLATES", quantity: 35, allergensUnknown: true }]);

  // 5) Failed delivery (yesterday) needing resolution, and an expired hold.
  const tFail = await ticket(sunrise, { title: "Lunch for 30 (yesterday)", mealSlot: "LUNCH", needDate: day(-1), peopleCount: 30, dietPref: "VEG", receiveFrom: m(-1500), latestDelivery: m(-1380), servingTime: m(-1360), status: "EXPIRED" }, [{ kind: "MEAL", name: "Complete meal plates", unit: "PLATES", quantity: 30 }]);
  const lotF = await lot(rB, { title: "Lemon rice (yesterday)", stage: "CLOSED", dietCategory: "VEG", preparedAt: m(-1560), readyAt: m(-1530), pickupDeadline: m(-1470), consumeBy: m(-1300), confirmedAt: m(-1530), closeReason: "Collected; delivery failed" }, [{ name: "Lemon rice meal", kind: "MEAL", unit: "PLATES", quantity: 30, allergens: J(["mustard", "peanut"]) }]);
  const jobF = await db.deliveryJob.create({ data: { status: "FAILED", mode: "PLATFORM_DISPATCH", logisticsTenantId: lg.t.id, collectorId: lg.users[1].id, quoteMinor: 20000, failureReason: "Vehicle breakdown en route", receiverConfirmedAt: m(-1500), createdById: lg.users[0].id } });
  await allocate(tFail, 0, lotF.items[0], 20, { status: "FAILED", collected: 20, jobId: jobF.id });
  await db.deliveryStop.createMany({ data: [
    { jobId: jobF.id, kind: "PICKUP", tenantId: rB.t.id, lotId: lotF.id, seq: 0, address: "3 Temple St", plannedQty: 20, actualQty: 20, doneAt: m(-1480) },
    { jobId: jobF.id, kind: "DROPOFF", tenantId: sunrise.t.id, ticketId: tFail.id, seq: 1, address: "5 Garden Lane", plannedQty: 20 },
  ] });
  await db.fundingCommitment.create({ data: { jobId: jobF.id, payerType: "SPONSOR", sponsorName: "Example sponsor (fictional; commitment record only)", amountMinor: 20000, createdById: admin.id } });
  await db.handoverEvent.create({ data: { jobId: jobF.id, type: "FAILED", actorId: lg.users[1].id, notes: "Vehicle breakdown en route", createdAt: m(-1450) } });
  const tOld = await ticket(hope, { title: "Breakfast (expired hold example)", mealSlot: "BREAKFAST", needDate: day(-1), peopleCount: 40, receiveFrom: m(-1700), latestDelivery: m(-1620), servingTime: m(-1600), status: "EXPIRED" }, [{ kind: "MEAL", name: "Complete meal plates", unit: "PLATES", quantity: 40 }]);
  const lotO = await lot(rC, { title: "Idli & chutney (yesterday)", stage: "EXPIRED", dietCategory: "VEG", preparedAt: m(-1760), readyAt: m(-1740), pickupDeadline: m(-1680), consumeBy: m(-1560), confirmedAt: m(-1740), closeReason: "Pickup deadline passed without a safe collection" }, [{ name: "Idli meal", kind: "MEAL", unit: "PLATES", quantity: 40, allergens: J([]) }]);
  await allocate(tOld, 0, lotO.items[0], 40, { status: "RELEASED", hold: m(-1690) });

  // 6) Recurring lunch schedule (Mon–Sat 13:00).
  await db.recurringSchedule.create({
    data: {
      tenantId: hope.t.id, createdById: hope.users[0].id, daysOfWeek: J([1, 2, 3, 4, 5, 6]), localTime: "13:00", startDate: new Date(NOW.getTime() - 7 * 86400000).toISOString().slice(0, 10),
      template: J({ title: "Weekday lunch (recurring)", purpose: "REGULAR_MEALS", mealSlot: "LUNCH", peopleCount: 60, foodCategory: "COMPLETE_MEALS", plates: 60, dietPref: "VEG", exclusions: "", otherDietary: "", partialOk: "on", minUseful: 10, fulfilment: "DELIVERY", deliveryAddress: "21 Shanti Nagar, side gate", receivingContact: "Sanjay +91 90000 00032", transportFunding: "ORG", storageNotes: "", containers: "", unloading: "", urgencyReason: "", receiveLeadMin: 90, latestLeadMin: 20 }),
    },
  });

  // 7) Admin queue items, notifications, announcement.
  await db.complaint.create({ data: { reporterId: sunrise.users[0].id, tenantId: sunrise.t.id, subject: "Food arrived lukewarm (demo)", body: "Yesterday's delivery failed; please review transport timing.", relatedType: "DeliveryJob", relatedId: jobF.id } });
  await db.announcement.create({ data: { title: "Welcome to the Khana Bridge demo", body: "All organisations, people and figures here are fictional seed data.", createdById: admin.id } });
  for (const u of [hope.users[0], hope.users[1]])
    await db.notification.create({ data: { userId: u.id, tenantId: hope.t.id, type: "transport", title: "50 plates received from Spice Route Kitchen", link: `/org/tickets/${t80.id}`, dedupeKey: `seed:recv:${u.id}` } });
  await db.notification.create({ data: { userId: sunrise.users[0].id, tenantId: sunrise.t.id, type: "offer", title: "Spice Route Kitchen offered 25 plates for \"Veg dinner for 40 children\"", link: `/org/tickets/${tSun.id}`, dedupeKey: "seed:offer" } });
  await db.auditEvent.create({ data: { actorId: admin.id, action: "seed", entityType: "System", entityId: "seed", data: J({ at: NOW }) } });

  await attachDemoPhotos(db);
  console.log(`Seeded demo data. Demo password for every seeded account: ${DEMO_PASSWORD} (local demo only).`);
}

main().finally(() => db.$disconnect());
