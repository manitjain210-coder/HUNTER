import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { fmtDateTime } from "@/lib/time";
import { unitLabel } from "@/lib/domain";
import { ActionForm, Input, Submit } from "@/components/form";
import { A, Card, Empty, Notice, PageHeader, Status } from "@/components/kit";
import { createJobAction } from "@/app/actions/ops";

export const metadata = { title: "Collections & deliveries" };

/** Shared by recipient orgs (inbound) and restaurants (outbound handovers). */
export default async function Deliveries() {
  const g = await gate(["RECIPIENT", "RESTAURANT"], ["OWNER", "COORDINATOR", "VIEWER", "MANAGER", "OPERATOR"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  const isOrg = ctx.tenantKind === "RECIPIENT";
  const allocWhere = isOrg ? { ticket: { tenantId: ctx.tenantId } } : { foodItem: { lot: { tenantId: ctx.tenantId } } };
  const [pending, jobs] = await Promise.all([
    db.allocation.findMany({ where: { ...allocWhere, status: "RESERVED", jobId: null }, include: { foodItem: { include: { lot: { include: { tenant: true } } } }, ticket: { include: { tenant: true } } } }),
    db.deliveryJob.findMany({ where: { stops: { some: { tenantId: ctx.tenantId } } }, include: { stops: true, allocations: { include: { foodItem: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const canDispatch = isOrg && ["OWNER", "COORDINATOR"].includes(ctx.role) && ctx.verificationStatus === "APPROVED";
  return (
    <div className="space-y-5">
      <PageHeader title={isOrg ? "Collections & deliveries" : "Collection handovers"} />
      <Card title="Reserved — transport pending">
        {!pending.length ? <Empty title="Nothing waiting for transport" /> : (
          <ActionForm action={createJobAction} className="space-y-3">
            <ul className="divide-y divide-line text-sm">{pending.map((a) => (
              <li key={a.id} className="flex items-start gap-3 py-2">
                {canDispatch && <input type="checkbox" name="allocationIds" value={a.id} aria-label={`Include ${a.foodItem.name}`} className="mt-1 h-4 w-4" defaultChecked />}
                <div>
                  <div><strong>{a.quantity} {unitLabel[a.foodItem.unit]}</strong> {a.foodItem.name} · from {a.foodItem.lot.tenant.name} → {a.ticket.tenant.name}</div>
                  <div className="text-xs text-muted-foreground">Hold expires {fmtDateTime(a.holdExpiresAt, ctx.timezone)} · pickup deadline {fmtDateTime(a.foodItem.lot.pickupDeadline, ctx.timezone)} · <A href={`/org/tickets/${a.ticketId}`}>ticket</A></div>
                </div>
              </li>
            ))}</ul>
            {canDispatch ? (
              <div className="rounded-xl border border-line bg-cream/60 p-3">
                <p className="mb-2 text-sm">Collect with your own vehicle and driver. Otherwise the platform dispatch desk will plan a shared collection.</p>
                <input type="hidden" name="mode" value="ORG_VEHICLE" />
                <div className="flex flex-wrap items-end gap-3"><Input name="quoteInr" label="Estimated transport cost (₹)" type="number" min={0} defaultValue="0" /><Submit>Plan collection with our vehicle</Submit></div>
              </div>
            ) : !isOrg ? <Notice tone="blue">The receiving organisation or the dispatch desk arranges transport. You will be notified when a collector is assigned.</Notice> : null}
          </ActionForm>
        )}
      </Card>
      <Card title="Jobs">
        {!jobs.length ? <Empty title="No delivery jobs yet" /> : (
          <div className="overflow-x-auto"><table className="data">
            <thead><tr><th>Job</th><th>Food</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>{jobs.map((j) => (
              <tr key={j.id}>
                <td><A href={`/logistics/jobs/${j.id}`}>{j.id.slice(-6)}</A><div className="text-xs text-muted-foreground">{j.mode.toLowerCase().replace(/_/g, " ")}</div></td>
                <td>{j.allocations.map((a) => `${a.quantity} ${unitLabel[a.foodItem.unit]} ${a.foodItem.name}`).join(", ")}</td>
                <td><Status s={j.status} />{!j.receiverConfirmedAt && isOrg && j.status === "PLANNING" && <div className="text-xs text-amber-ink">Confirm receiving</div>}</td>
                <td>{fmtDateTime(j.createdAt, ctx.timezone)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
