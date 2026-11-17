import { db } from "@/lib/db";
import { getActor } from "@/lib/session";
import { pageError } from "@/lib/gate";
import { fmtDateTime, fmtMoney, now } from "@/lib/time";
import { unitLabel } from "@/lib/domain";
import { getJobFor, suggestRoute } from "@/services/logistics";
import { A, Card, Empty, KV, Notice, PageHeader, Status, Timeline } from "@/components/kit";
import { ActionButton, ActionForm, Input, Select, Submit, TextArea } from "@/components/form";
import { Countdown } from "@/components/countdown";
import { JobSteps } from "@/components/job-steps";
import {
  addFundingAction, arriveAction, assignAction, cancelJobAction, collectorAcceptAction, confirmReceiverAction, deliveredAction, failJobAction, pickupAction, receiptAction, resolveJobAction, saveRouteAction, transitAction,
} from "@/app/actions/ops";

export const metadata = { title: "Delivery job" };
const ACTIVE = ["PLANNING", "AWAITING_FUNDING", "ASSIGNED", "ACCEPTED", "AT_PICKUP", "COLLECTED", "IN_TRANSIT", "DELIVERED"];

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  let r;
  try { r = await getJobFor(actor, id); } catch (e) { return pageError(e); }
  const { job, role } = r;
  const c = actor!.ctx;
  const at = now();
  const funded = job.funding.reduce((s, f) => s + f.amountMinor, 0);
  const isDispatcher = role === "admin" || role === "dispatcher" || (role === "party" && job.mode === "ORG_VEHICLE" && c?.tenantKind === "RECIPIENT" && ["OWNER", "COORDINATOR"].includes(c.role));
  const isReceiver = role === "party" && c?.tenantKind === "RECIPIENT" && r.receiverTenantIds.includes(c.tenantId) && ["OWNER", "COORDINATOR"].includes(c.role);
  const isPickupParty = role === "party" && c?.tenantKind === "RESTAURANT" && ["OWNER", "MANAGER"].includes(c.role);
  const isCollector = role === "collector";

  // Candidate collectors: dispatching logistics tenant staff, or the receiving org's staff for ORG_VEHICLE jobs.
  const scopeTenant = job.mode === "ORG_VEHICLE" ? r.receiverTenantIds[0] : job.logisticsTenantId;
  const [collectors, vehicles] = isDispatcher && ACTIVE.slice(0, 2).includes(job.status)
    ? await Promise.all([
      db.membership.findMany({ where: { active: true, role: { in: ["DRIVER", "COORDINATOR", "OWNER"] }, ...(scopeTenant ? { tenantId: scopeTenant } : { tenant: { kind: "LOGISTICS" } }) }, include: { user: true, tenant: true } }),
      db.vehicle.findMany({ where: { active: true, ...(scopeTenant ? { tenantId: scopeTenant } : { tenant: { kind: "LOGISTICS" } }) } }),
    ])
    : [[], []];
  const sug = isDispatcher && ACTIVE.includes(job.status) ? await suggestRoute(job.id, vehicles.find((v) => v.id === job.vehicleId)?.capacityKg) : null;
  const tightest = job.allocations.map((a) => a.foodItem.lot.consumeBy).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0];
  const pickupBy = job.allocations.map((a) => a.foodItem.lot.pickupDeadline).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0];
  const deliverBy = job.allocations.map((a) => a.ticket.latestDelivery).sort((a, b) => a.getTime() - b.getTime())[0];
  const collectorUser = job.collectorId ? await db.user.findUnique({ where: { id: job.collectorId }, select: { name: true, phone: true } }) : null;

  return (
    <div className="space-y-5">
      <PageHeader title={`Delivery job ${job.id.slice(-6)}`} subtitle={<span className="flex flex-wrap items-center gap-2"><Status s={job.status} /> {job.mode.toLowerCase().replace(/_/g, " ")} · handling {job.handling.toLowerCase().replace("_", " ")}</span>} />
      <JobSteps status={job.status} lastActive={job.handovers.some((h) => h.type === "PICKED_UP") ? "COLLECTED" : job.collectorId ? "ASSIGNED" : job.funding.length ? "AWAITING_FUNDING" : "PLANNING"} />
      {job.status === "FAILED" && <Notice tone="red">Failed: {job.failureReason}. {job.resolution ? `Resolution: ${job.resolution}` : "Awaiting an operations resolution. Collected food is not returned to stock or re-offered."}</Notice>}
      {job.status === "PARTIALLY_COMPLETED" && !job.resolution && <Notice>Partially completed — rejected or uncollected quantities are recorded below and await operations review.</Notice>}
      <div className="flex flex-wrap gap-2">
        <Countdown label="Pickup deadline" to={pickupBy?.toISOString() ?? null} serverNow={at.toISOString()} />
        <Countdown label="Delivery deadline" to={deliverBy?.toISOString() ?? null} serverNow={at.toISOString()} />
        <Countdown label="Consume by (earliest)" to={tightest?.toISOString() ?? null} serverNow={at.toISOString()} />
      </div>
      <p className="text-xs text-muted-foreground">Countdowns use server time. They are not live tracking — this build has no GPS or driver location.</p>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Readiness checklist">
          <ul className="space-y-1.5 text-sm">
            <li>{job.receiverConfirmedAt ? "✅" : "⬜"} Receiver confirmed {job.receiverConfirmedAt && `(${fmtDateTime(job.receiverConfirmedAt)})`}</li>
            <li>{job.funding.length && funded >= job.quoteMinor ? "✅" : "⬜"} Transport funding: {fmtMoney(funded)} committed of {fmtMoney(job.quoteMinor)} quote</li>
            <li>{job.collectorId ? "✅" : "⬜"} Collector {collectorUser ? `${collectorUser.name}` : "not assigned"}</li>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Donated food is free. Transport funding is a separate record; a commitment is not proof of payment.</p>
          {job.funding.length > 0 && <ul className="mt-2 text-xs">{job.funding.map((f) => <li key={f.id}>{f.payerType.toLowerCase()}{f.sponsorName ? ` (${f.sponsorName})` : ""}: {fmtMoney(f.amountMinor)} · {f.status.toLowerCase().replace("_", " ")}</li>)}</ul>}
          {isReceiver && !job.receiverConfirmedAt && ACTIVE.includes(job.status) && <div className="mt-3"><ActionButton action={confirmReceiverAction} fields={{ jobId: job.id }}>Confirm we can receive</ActionButton></div>}
          {(isReceiver || isPickupParty || isDispatcher) && ["PLANNING", "AWAITING_FUNDING", "ASSIGNED"].includes(job.status) && (
            <ActionForm action={addFundingAction} className="mt-3 grid gap-2 sm:grid-cols-3 sm:items-end" resetOnSuccess>
              <input type="hidden" name="jobId" value={job.id} />
              <Select name="payerType" label="Payer" options={[...(isReceiver ? [["ORG", "Our organisation"]] : []), ...(isPickupParty ? [["RESTAURANT", "Our restaurant"]] : []), ...(isDispatcher ? [["SPONSOR", "Sponsor (record)"]] : []), ...(role === "admin" ? [["PLATFORM", "Platform budget"]] : [])] as [string, string][]} />
              <Input name="amountInr" label="Amount (₹)" type="number" min={0} step="0.01" required />
              <Input name="sponsorName" label="Sponsor name (if sponsor)" />
              <Submit variant="ghost">Record funding</Submit>
            </ActionForm>
          )}
        </Card>

        <Card title="Food on this job">
          <ul className="space-y-2 text-sm">{job.allocations.map((a) => (
            <li key={a.id} className="rounded-lg border border-line p-2">
              <strong>{a.quantity} {unitLabel[a.foodItem.unit]}</strong> {a.foodItem.name} · {a.foodItem.lot.title}
              <div className="text-xs text-muted-foreground">to {a.ticket.tenant.name} · {a.ticket.title} · collected {a.collectedQty} · accepted {a.acceptedQty} · rejected {a.rejectedQty} · <Status s={a.status} /></div>
            </li>
          ))}</ul>
        </Card>
      </div>

      <Card title="Stops">
        <ol className="space-y-3">{job.stops.map((s) => {
          const here = job.allocations.filter((a) => (s.kind === "PICKUP" ? a.foodItem.lotId === s.lotId : a.ticketId === s.ticketId));
          return (
            <li key={s.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{s.seq + 1}. {s.kind === "PICKUP" ? "Pick up" : "Drop off"} · {s.address || "address on file"}</strong>
                <span className="text-xs text-muted-foreground">{s.doneAt ? `done ${fmtDateTime(s.doneAt)}` : s.arrivedAt ? `arrived ${fmtDateTime(s.arrivedAt)}` : `window ${fmtDateTime(s.windowStart)} – ${fmtDateTime(s.windowEnd)}`}</span>
              </div>
              <div className="text-xs text-muted-foreground">Planned {s.plannedQty}{s.actualQty != null ? ` · actual ${s.actualQty}` : ""}</div>
              {(isCollector || isDispatcher) && s.kind === "DROPOFF" && <div className="text-xs">Receiving contact: {here[0]?.ticket.receivingContact || "—"}{here[0]?.ticket.unloading ? ` · ${here[0].ticket.unloading}` : ""}</div>}

              {isCollector && s.kind === "PICKUP" && !s.doneAt && ["ACCEPTED", "AT_PICKUP", "COLLECTED"].includes(job.status) && (
                <div className="mt-2 space-y-2">
                  {!s.arrivedAt && <ActionButton action={arriveAction} fields={{ jobId: job.id, stopId: s.id }} variant="ghost">Arrived at pickup</ActionButton>}
                  <ActionForm action={pickupAction} className="space-y-2">
                    <input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="stopId" value={s.id} />
                    {here.filter((a) => a.status === "RESERVED").map((a) => <Input key={a.id} name={`qty_${a.id}`} label={`Actually collected: ${a.foodItem.name} (${unitLabel[a.foodItem.unit]}, reserved ${a.quantity})`} type="number" min={0} max={a.quantity} defaultValue={String(a.quantity)} />)}
                    <Input name="notes" label="Handover notes" />
                    <Input name="evidence" label="Optional photo (does not establish food safety)" type="file" accept="image/png,image/jpeg,image/webp" />
                    <Submit variant="accent">Confirm pickup</Submit>
                  </ActionForm>
                </div>
              )}
              {isCollector && s.kind === "DROPOFF" && !s.arrivedAt && job.status === "IN_TRANSIT" && (
                <ActionForm action={deliveredAction} className="mt-2 space-y-2">
                  <input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="stopId" value={s.id} />
                  <Input name="notes" label="Notes" />
                  <Input name="evidence" label="Optional photo" type="file" accept="image/png,image/jpeg,image/webp" />
                  <Submit variant="accent">Arrived — hand over</Submit>
                </ActionForm>
              )}
              {isReceiver && s.kind === "DROPOFF" && s.tenantId === c!.tenantId && !s.doneAt && ["IN_TRANSIT", "DELIVERED"].includes(job.status) && (
                <ActionForm action={receiptAction} className="mt-3 space-y-3">
                  <input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="stopId" value={s.id} />
                  {here.filter((a) => a.status === "COLLECTED").map((a) => (
                    <fieldset key={a.id} className="grid gap-2 rounded-lg bg-cream p-2 sm:grid-cols-3">
                      <legend className="text-sm font-medium">{a.foodItem.name}: {a.collectedQty} {unitLabel[a.foodItem.unit]} collected</legend>
                      <input type="hidden" name="allocationIds" value={a.id} />
                      <Input name={`acc_${a.id}`} label="Accepted" type="number" min={0} defaultValue={String(a.collectedQty)} />
                      <Input name={`rej_${a.id}`} label="Rejected" type="number" min={0} defaultValue="0" />
                      <Input name={`why_${a.id}`} label="Reason for rejection" />
                    </fieldset>
                  ))}
                  <TextArea name="condition" label="Condition on arrival (temperature, packaging, timing)" required />
                  <Submit variant="accent">Record receipt</Submit>
                </ActionForm>
              )}
            </li>
          );
        })}</ol>
      </Card>

      {isCollector && (
        <Card title="Collector actions">
          <div className="flex flex-wrap gap-2">
            {job.status === "ASSIGNED" && <ActionButton action={collectorAcceptAction} fields={{ jobId: job.id }} variant="accent">Accept job</ActionButton>}
            {job.status === "COLLECTED" && <ActionButton action={transitAction} fields={{ jobId: job.id }} variant="accent">Start transit</ActionButton>}
          </div>
        </Card>
      )}

      {isDispatcher && ["PLANNING", "AWAITING_FUNDING"].includes(job.status) && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Suggested route (approve or edit)">
            {sug && (
              <>
                <p className={`text-sm font-medium ${sug.feasible ? "text-forest" : "text-danger"}`}>{sug.feasible ? "Feasible with current estimates" : "Not feasible"} · estimated load {sug.estimatedLoadKg} kg (estimate)</p>
                {sug.failures.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm text-danger">{sug.failures.map((f) => <li key={f}>{f}</li>)}</ul>}
                <ol className="mt-2 list-decimal pl-5 text-xs text-muted-foreground">{sug.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                <p className="mt-2 text-xs text-muted-foreground">Suggested order only. Straight-line distance with buffers; no road routing or live traffic.</p>
              </>
            )}
            <ActionForm action={saveRouteAction} className="mt-3 space-y-2">
              <input type="hidden" name="jobId" value={job.id} />
              <Input name="order" label="Edited stop order (stop ids, comma-separated; blank = suggested)" />
              <Input name="capacityKg" label="Vehicle capacity to check (kg)" type="number" />
              <Submit variant="ghost">{job.routeApproved ? "Re-approve route" : "Approve route"}</Submit>
            </ActionForm>
            <p className="mt-2 text-xs text-muted-foreground">Stop ids: {job.stops.map((s) => `${s.seq + 1}=${s.id}`).join(" · ")}</p>
          </Card>
          <Card title="Assign collector">
            {!collectors.length ? <Empty title="No eligible drivers">Add drivers to the team first.</Empty> : (
              <ActionForm action={assignAction} className="space-y-3">
                <input type="hidden" name="jobId" value={job.id} />
                <Select name="collectorId" label="Collector" options={collectors.map((m) => [m.userId, `${m.user.name} · ${m.tenant.name}`])} />
                <Select name="vehicleId" label="Vehicle" options={[["", "No vehicle recorded"], ...vehicles.map((v) => [v.id, `${v.label} (${v.capacityKg} kg${v.refrigerated ? ", refrigerated" : ""})`] as [string, string])]} />
                <Submit>Assign & dispatch</Submit>
                <p className="text-xs text-muted-foreground">Blocked until the receiver confirms and funding covers the quote.</p>
              </ActionForm>
            )}
          </Card>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Handover timeline">
          <Timeline events={job.handovers.map((h) => ({ at: fmtDateTime(h.createdAt), label: h.type.replace(/_/g, " ").toLowerCase(), detail: <>{h.notes}{h.evidenceId && <> · <a className="underline" href={`/api/files/${h.evidenceId}`}>photo</a></>}</> }))} />
        </Card>
        <Card title="Exceptions">
          {ACTIVE.includes(job.status) && (isDispatcher || isCollector) && (
            <ActionForm action={failJobAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="jobId" value={job.id} /><Input name="reason" label="Failure reason" required /><Submit variant="danger">Mark failed</Submit>
            </ActionForm>
          )}
          {isDispatcher && ["PLANNING", "AWAITING_FUNDING", "ASSIGNED", "ACCEPTED"].includes(job.status) && (
            <ActionForm action={cancelJobAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="jobId" value={job.id} /><Input name="reason" label="Cancel reason" required /><Submit variant="ghost">Cancel job</Submit>
            </ActionForm>
          )}
          {role === "admin" && ["FAILED", "PARTIALLY_COMPLETED"].includes(job.status) && (
            <ActionForm action={resolveJobAction} className="mt-3 space-y-2">
              <input type="hidden" name="jobId" value={job.id} />
              <TextArea name="resolution" label="Operations resolution (e.g. food safely discarded, redirected to animal feed partner, re-delivered within deadline)" defaultValue={job.resolution ?? ""} required />
              <Submit>Record resolution</Submit>
            </ActionForm>
          )}
          {!ACTIVE.includes(job.status) && role !== "admin" && <p className="text-sm text-muted-foreground">No actions available.</p>}
        </Card>
      </div>
      <KV items={[["Created", fmtDateTime(job.createdAt)], ["Route approved", job.routeApproved ? "yes" : "no"], ["Collector phone", isReceiver || isDispatcher || isPickupParty ? collectorUser?.phone ?? "—" : "hidden"]]} />
      <p className="text-sm"><A href="/dashboard">Back to workspace</A></p>
    </div>
  );
}
