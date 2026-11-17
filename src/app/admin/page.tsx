import { db } from "@/lib/db";
import { adminGate } from "@/lib/gate";
import { now } from "@/lib/time";
import { A, Card, PageHeader, Stat } from "@/components/kit";
import { ActionButton } from "@/components/form";
import { sweepAction } from "@/app/actions/ops";
import { Feed } from "@/components/feed";

export const metadata = { title: "Operations" };

export default async function AdminHome() {
  const g = await adminGate();
  if ("deny" in g) return g.deny;
  const at = now();
  const [apps, reReview, urgent, flagged, flaggedLots, expiredStock, stalled, transportPending, failed, rejected, complaints, payments, suspendedActive] = await Promise.all([
    db.verificationApplication.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    db.tenant.count({ where: { needsReReview: true } }),
    db.needTicket.count({ where: { urgency: "URGENT_PENDING", status: "OPEN" } }),
    db.needTicket.count({ where: { status: "OPEN", NOT: { flags: "[]" } } }),
    db.surplusLot.count({ where: { stage: "READY", NOT: { flags: "[]" } } }),
    db.productBatch.count({ where: { expiryDate: { lte: at }, status: "ACTIVE" } }),
    db.allocation.count({ where: { status: "RESERVED", holdExpiresAt: { lt: at } } }),
    db.allocation.count({ where: { status: "RESERVED", jobId: null } }),
    db.deliveryJob.count({ where: { status: "FAILED", resolution: null } }),
    db.deliveryJob.count({ where: { status: "PARTIALLY_COMPLETED", resolution: null } }),
    db.complaint.count({ where: { status: "OPEN" } }),
    db.groceryOrder.count({ where: { paymentStatus: "MANUAL_REPORTED" } }),
    db.allocation.count({ where: { status: { in: ["RESERVED", "COLLECTED"] }, OR: [{ ticket: { tenant: { verificationStatus: "SUSPENDED" } } }, { foodItem: { lot: { tenant: { verificationStatus: "SUSPENDED" } } } }] } }),
  ]);
  const q: [string, number, string][] = [
    ["Verification applications", apps, "/admin/verification"], ["Profiles needing re-review", reReview, "/admin/tenants"], ["Urgency requests", urgent, "/admin/tickets"], ["Flagged tickets (duplicates / quantities)", flagged, "/admin/tickets"],
    ["Flagged food batches (deadline review)", flaggedLots, "/admin/tickets"], ["Expired grocery batches still active", expiredStock, "/admin/orders"], ["Stalled reservations (hold passed)", stalled, "/logistics"], ["Reserved — transport pending", transportPending, "/logistics"],
    ["Failed jobs needing resolution", failed, "/admin/ops"], ["Partially completed jobs (rejected food)", rejected, "/admin/ops"], ["Open complaints / reported food", complaints, "/admin/complaints"], ["Offline payments to confirm", payments, "/admin/orders"],
    ["Active deliveries of suspended organisations", suspendedActive, "/admin/ops"],
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="Operations console" action={<ActionButton action={sweepAction} variant="ghost">Run worker sweep now</ActionButton>} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {q.map(([label, n, href]) => <a key={label} href={href} className="block"><Stat label={label} value={<span className={n ? "text-coral" : ""}>{n}</span>} /></a>)}
      </div>
      <Card title="Recent platform activity"><Feed userId={g.actor.userId} /></Card>
      <p className="text-sm text-muted-foreground">The background worker normally runs as <code>npm run worker</code>. <A href="/admin/audit">Audit log</A></p>
    </div>
  );
}
