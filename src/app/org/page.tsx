import Link from "next/link";
import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { fmtDateTime, now } from "@/lib/time";
import { A, Card, Empty, Notice, PageHeader, Stat, Status } from "@/components/kit";
import { Feed } from "@/components/feed";

export const metadata = { title: "Organisation overview" };

export default async function OrgHome() {
  const g = await gate(["RECIPIENT"]);
  if ("deny" in g) return g.deny;
  const { ctx, actor } = g;
  const at = now();
  const [open, pendingOffers, awaitingTransport, inbound, upcoming] = await Promise.all([
    db.needTicket.count({ where: { tenantId: ctx.tenantId, status: "OPEN" } }),
    db.offer.count({ where: { ticket: { tenantId: ctx.tenantId }, status: "PROPOSED", expiresAt: { gt: at } } }),
    db.allocation.count({ where: { ticket: { tenantId: ctx.tenantId }, status: "RESERVED", jobId: null } }),
    db.deliveryJob.count({ where: { stops: { some: { tenantId: ctx.tenantId, kind: "DROPOFF", doneAt: null } }, status: { in: ["ASSIGNED", "ACCEPTED", "AT_PICKUP", "COLLECTED", "IN_TRANSIT", "DELIVERED"] } } }),
    db.needTicket.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["OPEN", "FILLED"] } }, include: { requirements: true }, orderBy: { servingTime: "asc" }, take: 6 }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title={ctx.tenantName} subtitle={<>Verification: <Status s={ctx.verificationStatus} /></>} action={ctx.role !== "VIEWER" && ctx.role !== "DRIVER" ? <Link href="/org/tickets/new" className="btn btn-accent">Raise a ticket</Link> : undefined} />
      {ctx.verificationStatus !== "APPROVED" && <Notice>Your organisation is not approved yet. You cannot publish tickets or accept donations. <A href="/org/profile">Complete verification</A></Notice>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open tickets" value={open} />
        <Stat label="Offers waiting for you" value={pendingOffers} />
        <Stat label="Reserved, transport pending" value={awaitingTransport} />
        <Stat label="Deliveries on the way" value={inbound} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Upcoming needs" action={<A href="/org/tickets">All tickets</A>}>
          {!upcoming.length ? <Empty title="No open needs">Raise tickets in advance so restaurants can plan.</Empty> : (
            <ul className="divide-y divide-line">{upcoming.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div><A href={`/org/tickets/${t.id}`}>{t.title}</A><div className="text-xs text-muted-foreground">Serving {fmtDateTime(t.servingTime, ctx.timezone)}</div></div>
                <div className="text-sm">{t.requirements.map((r) => `${r.reservedQty}/${r.quantity} ${r.unit.toLowerCase()}`).join(" · ")} <Status s={t.status} /></div>
              </li>
            ))}</ul>
          )}
        </Card>
        <Card title="Activity"><Feed tenantId={ctx.tenantId} userId={actor.userId} /></Card>
      </div>
    </div>
  );
}
