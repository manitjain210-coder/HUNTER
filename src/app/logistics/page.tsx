import { db } from "@/lib/db";
import { getActor } from "@/lib/session";
import { redirect } from "next/navigation";
import { fmtDateTime } from "@/lib/time";
import { unitLabel } from "@/lib/domain";
import { ActionForm, Input, Select, Submit } from "@/components/form";
import { A, Card, Empty, Forbidden, Status } from "@/components/kit";
import { PhotoBand } from "@/components/photo-band";
import { createJobAction } from "@/app/actions/ops";

export const metadata = { title: "Dispatch board" };

export default async function Dispatch() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const c = actor.ctx;
  const isAdmin = actor.isAdmin && !c;
  if (!isAdmin && !(c?.tenantKind === "LOGISTICS" && ["OWNER", "COORDINATOR"].includes(c.role))) return <Forbidden message="Dispatch is for logistics coordinators and platform admins." />;
  const [pending, jobs] = await Promise.all([
    db.allocation.findMany({ where: { status: "RESERVED", jobId: null }, include: { foodItem: { include: { lot: { include: { tenant: true } } } }, ticket: { include: { tenant: true } } }, orderBy: { holdExpiresAt: "asc" } }),
    db.deliveryJob.findMany({ where: isAdmin ? {} : { logisticsTenantId: c!.tenantId }, include: { stops: true, allocations: { include: { foodItem: true } }, funding: true }, orderBy: { updatedAt: "desc" }, take: 60 }),
  ]);
  const columns: [string, string[]][] = [["Planning & funding", ["PLANNING", "AWAITING_FUNDING"]], ["Assigned", ["ASSIGNED", "ACCEPTED"]], ["On the road", ["AT_PICKUP", "COLLECTED", "IN_TRANSIT", "DELIVERED"]], ["Closed", ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"]]];
  return (
    <div className="space-y-5">
      <PhotoBand src="/photos/collection-rider.jpg" position="center 64%">
        <div className="max-w-xl px-6 py-12 md:px-10 md:py-14">
          <h1 className="text-[2rem] leading-tight text-white md:text-[2.4rem]">Dispatch board</h1>
          <p className="mt-2 text-white/85">Plan collections by hand. Use the organisation&apos;s own vehicle first, then a shared scheduled run, then an on-demand rider you book yourself. No delivery company is connected to Khana Bridge.</p>
        </div>
      </PhotoBand>
      <Card title={`Reserved — transport pending (${pending.length})`}>
        {!pending.length ? <Empty title="Nothing waiting" /> : (
          <ActionForm action={createJobAction} className="space-y-3">
            <div className="overflow-x-auto"><table className="data">
              <thead><tr><th /><th>Food</th><th>From</th><th>To</th><th>Handling</th><th>Hold / pickup by</th></tr></thead>
              <tbody>{pending.map((a) => (
                <tr key={a.id}>
                  <td><input type="checkbox" name="allocationIds" value={a.id} aria-label={`Select ${a.foodItem.name}`} className="h-4 w-4" /></td>
                  <td>{a.quantity} {unitLabel[a.foodItem.unit]} {a.foodItem.name}</td>
                  <td>{a.foodItem.lot.tenant.name}</td>
                  <td><A href={`/org/tickets/${a.ticketId}`}>{a.ticket.tenant.name}</A></td>
                  <td>{a.foodItem.lot.storage.toLowerCase().replace("_", " ")}</td>
                  <td className="text-xs">{fmtDateTime(a.holdExpiresAt)}<br />{fmtDateTime(a.foodItem.lot.pickupDeadline)}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="flex flex-wrap items-end gap-3">
              <Select name="mode" label="Mode" options={[["PLATFORM_DISPATCH", "Scheduled shared collection"], ["ON_DEMAND_MANUAL", "On-demand provider (booked manually)"]]} />
              <Input name="quoteInr" label="Transport quote (₹)" type="number" min={0} step="0.01" defaultValue="0" />
              <Submit>Create job from selected</Submit>
            </div>
            <p className="text-xs text-muted-foreground">Hot-held and chilled food cannot share one job.</p>
          </ActionForm>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-4">
        {columns.map(([title, sts]) => {
          const list = jobs.filter((j) => sts.includes(j.status));
          return (
            <section key={title} aria-label={title} className="rounded-2xl border border-line bg-sand/60 p-3">
              <h2 className="mb-2 text-sm font-semibold">{title} <span className="text-muted-foreground">({list.length})</span></h2>
              <ul className="space-y-2">{list.map((j) => (
                <li key={j.id} className="rounded-xl border border-line bg-white p-3 text-sm">
                  <div className="flex items-center justify-between"><A href={`/logistics/jobs/${j.id}`}>Job {j.id.slice(-6)}</A><Status s={j.status} /></div>
                  <div className="text-xs text-muted-foreground">{j.stops.filter((s) => s.kind === "PICKUP").length} pickup(s) · {j.stops.filter((s) => s.kind === "DROPOFF").length} drop-off(s)</div>
                  <div className="text-xs">{j.allocations.map((a) => `${a.quantity} ${unitLabel[a.foodItem.unit]}`).join(", ")}</div>
                  {!j.receiverConfirmedAt && sts[0] === "PLANNING" && <div className="text-xs text-amber-ink">Receiver not confirmed</div>}
                  {sts[0] === "PLANNING" && j.funding.reduce((s, f) => s + f.amountMinor, 0) < j.quoteMinor && <div className="text-xs text-amber-ink">Funding pending</div>}
                  {j.status === "FAILED" && !j.resolution && <div className="text-xs text-danger">Needs resolution</div>}
                </li>
              ))}</ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
