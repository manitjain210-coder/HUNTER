import { db, tx } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { type Actor, requireAdmin } from "@/lib/authz";
import { invalid, notFound } from "@/lib/domain";
import { POLICY_DEFAULTS } from "@/lib/policy";
import { parse, z, reqStr, str } from "@/lib/validate";

/** Update one policy value. Versions increase so transactions can snapshot which version they used. */
export async function setPolicy(actor: Actor, key: string, rawValue: string, reason: string) {
  requireAdmin(actor);
  if (!(key in POLICY_DEFAULTS)) throw invalid("Unknown policy key.");
  if ((reason ?? "").trim().length < 3) throw invalid("Give a reason.", { reason: "Required" });
  const def = POLICY_DEFAULTS[key as keyof typeof POLICY_DEFAULTS];
  let value: unknown;
  if (typeof def === "number") {
    value = Number(rawValue);
    if (!Number.isFinite(value) || (value as number) < 0) throw invalid("Enter a non-negative number.", { value: "Invalid" });
  } else value = String(rawValue).split(",").map((s) => s.trim()).filter(Boolean);
  return tx(async (t) => {
    const prev = await t.policySetting.findUnique({ where: { key } });
    await t.policySetting.upsert({ where: { key }, create: { key, value: JSON.stringify(value), updatedById: actor.userId }, update: { value: JSON.stringify(value), version: { increment: 1 }, updatedById: actor.userId } });
    await audit(t, { actorId: actor.userId, action: "policy.set", entityType: "PolicySetting", entityId: key, data: { from: prev?.value ?? JSON.stringify(def), to: value, reason } });
  });
}

export async function postAnnouncement(actor: Actor, raw: unknown) {
  requireAdmin(actor);
  const v = parse(z.object({ title: reqStr(120), body: reqStr(2000) }), raw);
  const a = await db.announcement.create({ data: { ...v, createdById: actor.userId } });
  const users = await db.user.findMany({ where: { active: true }, select: { id: true } });
  await notify(db, { userIds: users.map((u) => u.id), type: "announcement", title: v.title, body: v.body.slice(0, 200), link: "/notifications", dedupeKey: `ann:${a.id}` });
  return a;
}

export async function fileComplaint(actor: Actor, raw: unknown) {
  const v = parse(z.object({ subject: reqStr(120), body: reqStr(2000), relatedType: str(40), relatedId: str(40) }), raw);
  const c = await db.complaint.create({ data: { ...v, reporterId: actor.userId, tenantId: actor.ctx?.tenantId } });
  await audit(db, { actorId: actor.userId, tenantId: actor.ctx?.tenantId, action: "complaint.file", entityType: "Complaint", entityId: c.id });
  return c;
}

export async function resolveComplaint(actor: Actor, id: string, resolution: string) {
  requireAdmin(actor);
  if ((resolution ?? "").trim().length < 3) throw invalid("Describe the resolution.");
  const r = await db.complaint.updateMany({ where: { id, status: "OPEN" }, data: { status: "RESOLVED", resolution } });
  if (!r.count) throw notFound();
  await audit(db, { actorId: actor.userId, action: "complaint.resolve", entityType: "Complaint", entityId: id, data: { resolution } });
}

/** Admin-assisted password reset (no SMS/email exists). Generates a one-time temporary password shown to the admin. */
export async function adminResetPassword(actor: Actor, userId: string) {
  requireAdmin(actor);
  if (userId === actor.userId) throw invalid("Use your own account settings to change your password.");
  const { hashPassword, newToken } = await import("@/lib/auth");
  const temp = newToken().slice(0, 14);
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(temp) } });
  await db.session.deleteMany({ where: { userId } });
  await audit(db, { actorId: actor.userId, action: "user.password.reset", entityType: "User", entityId: userId });
  return temp;
}
