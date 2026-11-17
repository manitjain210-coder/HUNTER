import { db, tx } from "@/lib/db";
import { audit, notify, adminIds, memberIds } from "@/lib/audit";
import { type Actor, requireAdmin, requireCtx } from "@/lib/authz";
import {
  AppError, forbidden, invalid, notFound, conflict, RECIPIENT_CATEGORIES, PROGRAMME_REQUIRED, VERIFICATION_TRANSITIONS, assertTransition,
  ORG_ROLES, SUPPLIER_ROLES, DIETS,
} from "@/lib/domain";
import { newToken, sha256 } from "@/lib/auth";
import { addMin, now } from "@/lib/time";
import { parse, z, str, reqStr, optNum, bool, strList } from "@/lib/validate";

const orgSchema = z
  .object({
    kind: z.enum(["RECIPIENT", "RESTAURANT", "SUPERMARKET"]),
    name: reqStr(120),
    category: z.string().optional(),
    description: str(2000),
    address: reqStr(300, "Operating address is required"),
    serviceArea: reqStr(120, "Service area is required"),
    lat: optNum.pipe(z.number().min(-90).max(90).optional()),
    lng: optNum.pipe(z.number().min(-180).max(180).optional()),
    timezone: z.string().default("Asia/Kolkata"),
    hours: str(200),
    pocName: reqStr(80, "POC name is required"),
    pocRole: reqStr(80, "POC role is required"),
    phone: reqStr(20, "Phone is required"),
    email: z.preprocess((v) => (v === "" ? undefined : v), z.email().optional()),
    backupContact: str(120),
    dailyCapacity: optNum.pipe(z.number().int().positive().max(100000).optional()),
    beneficiaryInfo: str(500),
    dietAccepted: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.enum(DIETS))),
    allergensOk: strList,
    exclusions: strList,
    programmeNotes: str(1000),
    hasKitchen: bool,
    hasRefrigeration: bool,
    storageCapacity: str(200),
    hasVehicle: bool,
    maxDistanceKm: optNum.pipe(z.number().positive().max(200).optional()),
    packingNeeds: str(300),
    acceptsPartial: bool,
    acceptsComponents: bool,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "RECIPIENT") {
      if (!v.category || !(v.category in RECIPIENT_CATEGORIES)) ctx.addIssue({ code: "custom", path: ["category"], message: "Choose an applicant category" });
      if (v.category && PROGRAMME_REQUIRED.includes(v.category) && v.programmeNotes.length < 10)
        ctx.addIssue({ code: "custom", path: ["programmeNotes"], message: "Describe the intended programme and authorised dietary restrictions" });
      if (!v.dailyCapacity) ctx.addIssue({ code: "custom", path: ["dailyCapacity"], message: "Approximate daily serving capacity is required" });
    }
  });

export async function createOrganisation(actor: Actor, raw: unknown) {
  const v = parse(orgSchema, raw);
  return tx(async (t) => {
    const tenant = await t.tenant.create({
      data: {
        ...v,
        category: v.kind === "RECIPIENT" ? v.category : null,
        dietAccepted: JSON.stringify(v.dietAccepted),
        allergensOk: JSON.stringify(v.allergensOk),
        exclusions: JSON.stringify(v.exclusions),
        verificationStatus: "DRAFT",
      },
    });
    await t.membership.create({ data: { userId: actor.userId, tenantId: tenant.id, role: "OWNER" } });
    await t.verificationApplication.create({ data: { tenantId: tenant.id } });
    await t.branch.create({ data: { tenantId: tenant.id, name: "Main", address: v.address, lat: v.lat, lng: v.lng } });
    await audit(t, { actorId: actor.userId, tenantId: tenant.id, action: "org.create", entityType: "Tenant", entityId: tenant.id });
    return tenant;
  });
}

const SENSITIVE = ["name", "category", "address", "pocName", "phone", "programmeNotes"] as const;

export async function updateOrganisation(actor: Actor, raw: unknown) {
  const c = requireCtx(actor, ["RECIPIENT", "RESTAURANT", "SUPERMARKET", "LOGISTICS"], ["OWNER"]);
  const current = await db.tenant.findUniqueOrThrow({ where: { id: c.tenantId } });
  const v = parse(orgSchema, { ...(raw as object), kind: current.kind === "LOGISTICS" ? "RESTAURANT" : current.kind });
  return tx(async (t) => {
    const changed = SENSITIVE.filter((k) => String(current[k] ?? "") !== String((v as Record<string, unknown>)[k] ?? ""));
    const reReview = current.verificationStatus === "APPROVED" && changed.length > 0;
    await t.tenant.update({
      where: { id: c.tenantId },
      data: {
        ...v, kind: current.kind,
        category: current.kind === "RECIPIENT" ? v.category : null,
        dietAccepted: JSON.stringify(v.dietAccepted), allergensOk: JSON.stringify(v.allergensOk), exclusions: JSON.stringify(v.exclusions),
        ...(reReview ? { needsReReview: true } : {}),
      },
    });
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "org.update", entityType: "Tenant", entityId: c.tenantId, data: { changed } });
    if (reReview)
      await notify(t, {
        userIds: await adminIds(t), type: "verification", title: `${v.name} changed sensitive profile fields`, body: changed.join(", "),
        link: `/admin/verification`, dedupeKey: `rereview:${c.tenantId}:${Date.now()}`,
      });
    return { reReview, changed };
  });
}

export async function submitApplication(actor: Actor, raw: unknown) {
  const c = requireCtx(actor, ["RECIPIENT", "RESTAURANT", "SUPERMARKET"], ["OWNER"]);
  const v = parse(z.object({ declaration: bool, registrationDetails: str(1000) }), raw);
  if (!v.declaration) throw invalid("The POC authorisation declaration is required.", { declaration: "Confirm you are authorised to apply for this organisation" });
  const docs = await db.storedFile.count({ where: { tenantId: c.tenantId, purpose: "VERIFICATION" } });
  if (!docs && v.registrationDetails.length < 5)
    throw invalid("Add registration details or upload at least one supporting document.", { registrationDetails: "Provide registration details or upload evidence" });
  return tx(async (t) => {
    const app = await t.verificationApplication.findFirstOrThrow({ where: { tenantId: c.tenantId }, orderBy: { createdAt: "desc" } });
    assertTransition(VERIFICATION_TRANSITIONS, app.status, "SUBMITTED");
    await t.verificationApplication.update({
      where: { id: app.id },
      data: { status: "SUBMITTED", declarationAccepted: true, declarationBy: actor.userId, registrationDetails: v.registrationDetails, submittedAt: now() },
    });
    await t.verificationReview.create({ data: { applicationId: app.id, fromStatus: app.status, toStatus: "SUBMITTED", actorId: actor.userId } });
    await t.tenant.update({ where: { id: c.tenantId }, data: { verificationStatus: "SUBMITTED" } });
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "verification.submit", entityType: "Tenant", entityId: c.tenantId });
    await notify(t, { userIds: await adminIds(t), type: "verification", title: `New application: ${c.tenantName}`, link: `/admin/verification/${app.id}`, dedupeKey: `submit:${app.id}:${app.status}:${Date.now()}` });
  });
}

const reviewSchema = z.object({
  action: z.enum(["START", "APPROVE", "REQUEST_CHANGES", "REJECT"]),
  reason: str(1000),
  restrictedFoodTypes: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.enum(["COMPLETE_MEALS", "PACKAGED", "COMPONENTS"]))),
});
const ACTION_TO: Record<string, string> = { START: "UNDER_REVIEW", APPROVE: "APPROVED", REQUEST_CHANGES: "CHANGES_REQUESTED", REJECT: "REJECTED" };

export async function reviewApplication(actor: Actor, applicationId: string, raw: unknown) {
  requireAdmin(actor);
  const v = parse(reviewSchema, raw);
  if (v.action !== "START" && v.action !== "APPROVE" && v.reason.length < 5) throw invalid("A reason is required.", { reason: "Explain what must change or why it is rejected" });
  return tx(async (t) => {
    const app = await t.verificationApplication.findUnique({ where: { id: applicationId }, include: { tenant: true } });
    if (!app) throw notFound();
    const own = await t.membership.findFirst({ where: { tenantId: app.tenantId, userId: actor.userId } });
    if (own) throw forbidden("You cannot review an organisation you belong to.");
    const to = ACTION_TO[v.action];
    assertTransition(VERIFICATION_TRANSITIONS, app.status, to);
    await t.verificationApplication.update({ where: { id: app.id }, data: { status: to } });
    await t.verificationReview.create({ data: { applicationId: app.id, fromStatus: app.status, toStatus: to, reason: v.reason, actorId: actor.userId } });
    await t.tenant.update({
      where: { id: app.tenantId },
      data: { verificationStatus: to, needsReReview: false, ...(to === "APPROVED" ? { restrictedFoodTypes: JSON.stringify(v.restrictedFoodTypes) } : {}) },
    });
    await audit(t, { actorId: actor.userId, action: `verification.${v.action.toLowerCase()}`, entityType: "Tenant", entityId: app.tenantId, data: { reason: v.reason, restrictedFoodTypes: v.restrictedFoodTypes } });
    await notify(t, {
      userIds: await memberIds(t, app.tenantId, ["OWNER", "COORDINATOR", "MANAGER"]), tenantId: app.tenantId, type: "verification",
      title: `Verification: ${to.replace("_", " ").toLowerCase()}`, body: v.reason, link: "/org/profile", dedupeKey: `review:${app.id}:${to}:${Date.now()}`,
    });
  });
}

/** Suspend or reinstate. Active deliveries stay visible and are surfaced to admins for explicit resolution. */
export async function setSuspended(actor: Actor, tenantId: string, suspend: boolean, reason: string) {
  requireAdmin(actor);
  if ((reason ?? "").trim().length < 5) throw invalid("A reason is required.", { reason: "Required" });
  return tx(async (t) => {
    const tenant = await t.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw notFound();
    if (await t.membership.findFirst({ where: { tenantId, userId: actor.userId } })) throw forbidden("You cannot act on your own organisation.");
    const to = suspend ? "SUSPENDED" : "APPROVED";
    assertTransition(VERIFICATION_TRANSITIONS, tenant.verificationStatus, to);
    await t.tenant.update({ where: { id: tenantId }, data: { verificationStatus: to } });
    const app = await t.verificationApplication.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    if (app) {
      await t.verificationApplication.update({ where: { id: app.id }, data: { status: to } });
      await t.verificationReview.create({ data: { applicationId: app.id, fromStatus: tenant.verificationStatus, toStatus: to, reason, actorId: actor.userId } });
    }
    let pendingOffersClosed = 0;
    if (suspend) {
      // No new commitments: close proposals; existing reservations/jobs remain for explicit admin resolution.
      const r = await t.offer.updateMany({
        where: { status: "PROPOSED", OR: [{ ticket: { tenantId } }, { lot: { tenantId } }] },
        data: { status: "WITHDRAWN", reason: "Organisation suspended", decidedAt: now() },
      });
      pendingOffersClosed = r.count;
    }
    await audit(t, { actorId: actor.userId, action: suspend ? "org.suspend" : "org.reinstate", entityType: "Tenant", entityId: tenantId, data: { reason, pendingOffersClosed } });
    return { pendingOffersClosed };
  });
}

// ---------- Members & invitations ----------

export async function createInvitation(actor: Actor, role: string) {
  const c = requireCtx(actor, ["RECIPIENT", "RESTAURANT", "SUPERMARKET", "LOGISTICS"], ["OWNER"]);
  const allowed: readonly string[] = c.tenantKind === "RECIPIENT" || c.tenantKind === "LOGISTICS" ? ORG_ROLES : SUPPLIER_ROLES;
  if (!allowed.includes(role) || role === "OWNER") throw invalid("Choose a valid role.", { role: "Invalid role" });
  const token = newToken();
  await tx(async (t) => {
    const inv = await t.invitation.create({ data: { tenantId: c.tenantId, role, tokenHash: sha256(token), expiresAt: addMin(now(), 72 * 60), createdById: actor.userId } });
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "invite.create", entityType: "Invitation", entityId: inv.id, data: { role } });
  });
  return token; // shown once as a copyable link; never emailed/SMSed
}

export async function acceptInvitation(actor: Actor, token: string) {
  return tx(async (t) => {
    const inv = await t.invitation.findUnique({ where: { tokenHash: sha256(token ?? "") }, include: { tenant: true } });
    if (!inv || inv.usedAt || inv.expiresAt < now()) throw invalid("This invitation is invalid, used or expired.");
    const used = await t.invitation.updateMany({ where: { id: inv.id, usedAt: null }, data: { usedAt: now(), usedById: actor.userId } });
    if (used.count !== 1) throw conflict("This invitation was already used.");
    const existing = await t.membership.findUnique({ where: { userId_tenantId: { userId: actor.userId, tenantId: inv.tenantId } } });
    if (existing?.active) throw conflict("You are already a member of this organisation.");
    const m = existing
      ? await t.membership.update({ where: { id: existing.id }, data: { active: true, role: inv.role } })
      : await t.membership.create({ data: { userId: actor.userId, tenantId: inv.tenantId, role: inv.role } });
    await audit(t, { actorId: actor.userId, tenantId: inv.tenantId, action: "invite.accept", entityType: "Membership", entityId: m.id, data: { role: inv.role } });
    return { membershipId: m.id, tenantName: inv.tenant.name };
  });
}

export async function changeMember(actor: Actor, membershipId: string, change: { role?: string; active?: boolean }) {
  const c = requireCtx(actor, ["RECIPIENT", "RESTAURANT", "SUPERMARKET", "LOGISTICS"], ["OWNER"]);
  return tx(async (t) => {
    const m = await t.membership.findFirst({ where: { id: membershipId, tenantId: c.tenantId } });
    if (!m) throw notFound();
    const allowed: readonly string[] = c.tenantKind === "RECIPIENT" || c.tenantKind === "LOGISTICS" ? ORG_ROLES : SUPPLIER_ROLES;
    if (change.role && !allowed.includes(change.role)) throw invalid("Invalid role.");
    const losingOwner = m.role === "OWNER" && (change.active === false || (change.role && change.role !== "OWNER"));
    if (losingOwner && (await t.membership.count({ where: { tenantId: c.tenantId, role: "OWNER", active: true } })) <= 1)
      throw conflict("An organisation must keep at least one active owner.");
    await t.membership.update({ where: { id: m.id }, data: change });
    await audit(t, { actorId: actor.userId, tenantId: c.tenantId, action: "member.change", entityType: "Membership", entityId: m.id, data: change });
  });
}

export async function addBranch(actor: Actor, raw: unknown) {
  const c = requireCtx(actor, ["RECIPIENT", "RESTAURANT", "SUPERMARKET", "LOGISTICS"], ["OWNER"]);
  const v = parse(z.object({ name: reqStr(80), address: reqStr(300), lat: optNum, lng: optNum, maxPlatesPerDay: optNum, capacityReason: str(300) }), raw);
  return db.branch.create({ data: { tenantId: c.tenantId, ...v } });
}

/** Switch the session's active organisation. Membership is re-checked server-side. */
export async function switchContext(userId: string, sessionId: string, membershipId: string | null) {
  if (membershipId) {
    const m = await db.membership.findFirst({ where: { id: membershipId, userId, active: true } });
    if (!m) throw forbidden("You are not a member of that organisation.");
  }
  await db.session.update({ where: { id: sessionId, userId }, data: { activeMembershipId: membershipId } });
}

export function assertNotDriverOnly(actor: Actor) {
  if (actor.ctx?.role === "DRIVER") throw new AppError("Drivers can only see assigned collections.", "FORBIDDEN");
}
