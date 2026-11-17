import { db } from "@/lib/db";
import { loadActor, type Actor } from "@/lib/authz";
import { addMin, now, toLocalInput } from "@/lib/time";

let n = 0;
const phone = () => `+9198${String(Date.now()).slice(-6)}${String(++n).padStart(2, "0")}`;

export async function resetDb() {
  const tables = await db.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite_%'`);
  await db.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  for (const t of tables) await db.$executeRawUnsafe(`DELETE FROM "${t.name}"`);
  await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
}

export async function user(opts: { admin?: boolean } = {}) {
  return db.user.create({ data: { phone: phone(), name: "Test user", passwordHash: "x", isPlatformAdmin: !!opts.admin } });
}

export async function actorFor(userId: string, tenantId?: string): Promise<Actor> {
  const m = tenantId ? await db.membership.findFirst({ where: { userId, tenantId } }) : null;
  return (await loadActor(userId, m?.id ?? null))!;
}

export async function tenant(kind: string, status = "APPROVED", extra: Record<string, unknown> = {}) {
  return db.tenant.create({ data: { kind, name: `${kind} ${++n}`, verificationStatus: status, lat: 12.97, lng: 77.59, maxDistanceKm: 20, ...extra } });
}

/** A tenant plus a member actor in one call. */
export async function member(kind: string, role = "OWNER", status = "APPROVED", extra: Record<string, unknown> = {}) {
  const t = await tenant(kind, status, extra);
  const u = await user();
  await db.membership.create({ data: { userId: u.id, tenantId: t.id, role } });
  return { tenant: t, user: u, actor: await actorFor(u.id, t.id) };
}

export async function join(tenantId: string, role: string) {
  const u = await user();
  await db.membership.create({ data: { userId: u.id, tenantId, role } });
  return actorFor(u.id, tenantId);
}

export const local = (minFromNow: number) => toLocalInput(addMin(now(), minFromNow));

export function ticketInput(over: Record<string, unknown> = {}) {
  return {
    title: "Dinner", purpose: "REGULAR_MEALS", mealSlot: "DINNER", needDate: local(0).slice(0, 10), peopleCount: 80, foodCategory: "COMPLETE_MEALS", plates: 80,
    dietPref: "ANY", exclusions: "", otherDietary: "", receiveFrom: local(10), latestDelivery: local(150), servingTime: local(180), partialOk: "on", minUseful: 1,
    fulfilment: "DELIVERY", deliveryAddress: "Gate 1, Test Road", receivingContact: "Coordinator 9000000000", transportFunding: "ORG", storageNotes: "", containers: "", unloading: "", urgencyReason: "",
    ...over,
  };
}

export function lotInput(over: Record<string, unknown> = {}, items?: unknown[]) {
  return {
    title: "Veg meals", dietCategory: "VEG", storage: "HOT_HELD", packaging: "Sealed boxes", preparedAt: local(-30), readyAt: local(-5), pickupDeadline: local(90), consumeBy: local(300),
    notes: "", handlingDeclaration: "on",
    items: items ?? [{ name: "Veg meal", kind: "MEAL", unit: "PLATES", quantity: 50, allergens: ["milk"], allergensUnknown: false }],
    ...over,
  };
}
