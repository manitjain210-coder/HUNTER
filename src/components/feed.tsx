import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";
import { Timeline } from "./kit";

/** Recent audit events for a tenant plus the user's own notifications, newest first. */
export async function Feed({ tenantId, userId }: { tenantId?: string; userId: string }) {
  const [events, notes] = await Promise.all([
    tenantId ? db.auditEvent.findMany({ where: { tenantId }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 8 }) : Promise.resolve([]),
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const items = [
    ...events.map((e) => ({ t: e.createdAt, label: e.action.replace(/\./g, " · "), detail: e.actor?.name ?? "system" })),
    ...notes.map((n) => ({ t: n.createdAt, label: n.title, detail: n.readAt ? "notification" : "unread notification" })),
  ].sort((a, b) => b.t.getTime() - a.t.getTime()).slice(0, 10);
  return <Timeline events={items.map((i) => ({ at: fmtDateTime(i.t), label: i.label, detail: i.detail }))} />;
}
