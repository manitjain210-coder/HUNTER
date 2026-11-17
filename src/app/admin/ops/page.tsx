import { db } from "@/lib/db";
import { adminGate } from "@/lib/gate";
import { fmtDateTime } from "@/lib/time";
import { unitLabel } from "@/lib/domain";
import { A, Card, Empty, PageHeader, Status } from "@/components/kit";

export const metadata = { title: "Exceptions" };

export default async function Ops() {
  const g = await adminGate();
  if ("deny" in g) return g.deny;
  const [jobs, suspended] = await Promise.all([
    db.deliveryJob.findMany({ where: { status: { in: ["FAILED", "PARTIALLY_COMPLETED"] }, resolution: null }, include: { allocations: { include: { foodItem: true, ticket: { include: { tenant: true } } } } }, orderBy: { updatedAt: "desc" } }),
    db.allocation.findMany({ where: { status: { in: ["RESERVED", "COLLECTED"] }, OR: [{ ticket: { tenant: { verificationStatus: "SUSPENDED" } } }, { foodItem: { lot: { tenant: { verificationStatus: "SUSPENDED" } } } }] }, include: { ticket: { include: { tenant: true } }, foodItem: { include: { lot: { include: { tenant: true } } } } } }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="Exceptions needing a resolution" subtitle="Collected-but-rejected or failed food is never put back on sale or into the donation pool automatically." />
      <Card title="Failed / partially completed jobs">
        {!jobs.length ? <Empty title="Nothing to resolve" /> : (
          <ul className="space-y-2 text-sm">{jobs.map((j) => (
            <li key={j.id} className="rounded-lg border border-line p-3">
              <div className="flex justify-between"><A href={`/logistics/jobs/${j.id}`}>Job {j.id.slice(-6)}</A><Status s={j.status} /></div>
              <div className="text-xs text-muted-foreground">{j.failureReason ?? "Rejected at receipt"} · updated {fmtDateTime(j.updatedAt)}</div>
              <div className="text-xs">{j.allocations.map((a) => `${a.foodItem.name}: collected ${a.collectedQty}, accepted ${a.acceptedQty}, rejected ${a.rejectedQty} ${unitLabel[a.foodItem.unit]} → ${a.ticket.tenant.name}`).join(" · ")}</div>
            </li>
          ))}</ul>
        )}
      </Card>
      <Card title="Active commitments involving suspended organisations">
        {!suspended.length ? <Empty title="None" /> : (
          <ul className="space-y-2 text-sm">{suspended.map((a) => (
            <li key={a.id}>{a.quantity} {unitLabel[a.foodItem.unit]} {a.foodItem.name} · {a.foodItem.lot.tenant.name} → {a.ticket.tenant.name} · <Status s={a.status} /> · <A href={`/org/tickets/${a.ticketId}`}>ticket</A>{a.jobId && <> · <A href={`/logistics/jobs/${a.jobId}`}>job</A></>}</li>
          ))}</ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Decide explicitly: release the reservation from the ticket page, or let the delivery complete and record a resolution on the job.</p>
      </Card>
    </div>
  );
}
