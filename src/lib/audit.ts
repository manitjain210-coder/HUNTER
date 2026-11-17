import { db, type Tx } from "./db";

export async function audit(
  t: Tx,
  e: { actorId?: string | null; tenantId?: string | null; action: string; entityType: string; entityId: string; data?: unknown },
) {
  await t.auditEvent.create({
    data: { ...e, data: JSON.stringify(e.data ?? {}) },
  });
}

/** In-app notification; dedupeKey makes retried jobs safe. Email/SMS are not implemented. */
export async function notify(
  t: Tx,
  n: { userIds: string[]; tenantId?: string | null; type: string; title: string; body?: string; link?: string; dedupeKey: string },
) {
  for (const userId of [...new Set(n.userIds)]) {
    const key = `${n.dedupeKey}:${userId}`;
    const exists = await t.notification.findUnique({ where: { dedupeKey: key } });
    if (exists) continue;
    const user = await t.user.findUnique({ where: { id: userId }, select: { notifyPrefs: true } });
    const prefs = JSON.parse(user?.notifyPrefs || "{}") as Record<string, boolean>;
    if (prefs[n.type] === false) continue;
    await t.notification.create({
      data: { userId, tenantId: n.tenantId ?? null, type: n.type, title: n.title, body: n.body ?? "", link: n.link, dedupeKey: key },
    });
  }
}

/** Active members of a tenant with any of the given roles. */
export async function memberIds(t: Tx, tenantId: string, roles?: string[]) {
  const ms = await t.membership.findMany({ where: { tenantId, active: true, ...(roles ? { role: { in: roles } } : {}) }, select: { userId: true } });
  return ms.map((m) => m.userId);
}
export async function adminIds(t: Tx = db) {
  return (await t.user.findMany({ where: { isPlatformAdmin: true, active: true }, select: { id: true } })).map((u) => u.id);
}
