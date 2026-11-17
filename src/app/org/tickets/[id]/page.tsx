import Link from "next/link";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getActor } from "@/lib/session";
import { pageError } from "@/lib/gate";
import { fmtDateTime, now } from "@/lib/time";
import { PURPOSES, parseJson, unitLabel } from "@/lib/domain";
import { getTicketFor, ticketQuantities } from "@/services/tickets";
import { matchesForTicket, evaluate } from "@/services/matching";
import { getPolicy } from "@/lib/policy";
import { A, Badge, Card, Empty, KV, Notice, PageHeader, Qty, Status } from "@/components/kit";
import { ActionButton, ActionForm, Check, Input, Submit } from "@/components/form";
import { Countdown } from "@/components/countdown";
import { Cover } from "@/components/photos";
import { imagesFor } from "@/services/files";
import { acceptOfferAction, cancelAllocationAction, cancelTicketAction, declineOfferAction, proposeOfferAction, reserveLotAction, urgencyAction } from "@/app/actions/donation";

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reserved?: string }> }) {
  const { id } = await params;
  const { reserved } = await searchParams;
  const actor = await getActor();
  let res;
  try { res = await getTicketFor(actor, id); } catch (e) { return pageError(e); }
  const { ticket: t, view } = res;
  const tz = t.tenant.timezone;
  const q = await ticketQuantities(t.id);
  const at = now();
  const isOwner = view === "owner";
  const canAct = isOwner && ["OWNER", "COORDINATOR"].includes(actor!.ctx!.role) && actor!.ctx!.verificationStatus === "APPROVED";
  const flags = parseJson<string[]>(t.flags, []);
  const exclusions = parseJson<string[]>(t.exclusions, []);
  const components = q.filter((r) => r.kind === "COMPONENT");
  const incompleteBundle = components.length > 1 && components.some((r) => r.committed > 0) && components.some((r) => r.committed < r.requested);

  const [offers, allocations] = view === "supplier" ? [[], []] : await Promise.all([
    db.offer.findMany({ where: { ticketId: t.id }, include: { lot: { include: { tenant: true } }, lines: { include: { foodItem: true } } }, orderBy: { createdAt: "desc" } }),
    db.allocation.findMany({ where: { ticketId: t.id }, include: { foodItem: { include: { lot: { include: { tenant: true } } } }, job: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const matches = isOwner && t.status === "OPEN" ? (await matchesForTicket(t.id)).slice(0, 12) : [];
  const lotPhotos = await imagesFor("lot", matches.map((x) => x.lot.id));

  // Supplier view: their own ready lots evaluated against this ticket.
  let supplierLots: { lot: { id: string; title: string }; m: ReturnType<typeof evaluate> }[] = [];
  if (view === "supplier") {
    const policy = await getPolicy();
    const lots = await db.surplusLot.findMany({ where: { tenantId: actor!.ctx!.tenantId, stage: "READY", pickupDeadline: { gt: at } }, include: { tenant: true, items: true } });
    supplierLots = lots.map((lot) => ({ lot, m: evaluate(t, lot, policy, at) }));
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Status s={t.status} />{t.urgency !== "NORMAL" && <Status s={t.urgency} />}<span>{t.tenant.name}</span><span>· {t.mealSlot.toLowerCase()} · {PURPOSES[t.purpose]}</span>{t.scheduleId && <Badge tone="blue">recurring occurrence</Badge>}</span>}
        action={isOwner && ["DRAFT", "OPEN"].includes(t.status) && canAct ? <Link href={`/org/tickets/${t.id}/edit`} className="btn btn-ghost">Edit</Link> : undefined}
      />
      {reserved && <Notice tone="green">Reserved — transport pending. Delivery is not guaranteed until a collector, vehicle and funding are confirmed.</Notice>}
      {t.status === "DRAFT" && <Notice>Draft — not visible to restaurants until published.</Notice>}
      {flags.length > 0 && (isOwner || view === "admin") && <Notice>Review flags: {flags.join(" · ")}</Notice>}
      <Notice tone="blue">Publishing a need does not guarantee supply. Pending offers are not fulfilment; only received and accepted food counts.</Notice>

      <div className="flex flex-wrap gap-2">
        <Countdown label="Latest delivery" to={t.latestDelivery.toISOString()} serverNow={at.toISOString()} />
        <Countdown label="Serving" to={t.servingTime.toISOString()} serverNow={at.toISOString()} />
      </div>

      <Card title="Quantities (kept separate by unit)">
        <div className="overflow-x-auto">
          <table className="data">
            <thead><tr><th>Line</th><th>Requested</th><th>Offered (pending)</th><th>Reserved</th><th>Collected</th><th>Accepted</th><th>Rejected</th><th>Remaining need</th></tr></thead>
            <tbody>{q.map((r) => (
              <tr key={r.id}><td className="font-medium">{r.name}<div className="text-xs text-muted-foreground">{unitLabel[r.unit]}</div></td>
                <td>{r.requested}</td><td>{r.offered}</td><td>{r.reserved}</td><td>{r.collected}</td><td className="font-semibold text-forest">{r.accepted}</td><td>{r.rejected}</td><td className="font-semibold">{r.remaining}</td></tr>
            ))}</tbody>
          </table>
        </div>
        {incompleteBundle && <p className="mt-2 text-sm text-amber-ink">Incomplete meal bundle: some components are covered and others are not. Components are never counted as complete plates.</p>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Details">
          <KV items={[
            ["People", t.peopleCount], ["Diet", t.dietPref.toLowerCase()], ["Strict exclusions", exclusions.join(", ") || "none"], ["Other dietary", t.otherDietary || "—"],
            ["Receiving window", `${fmtDateTime(t.receiveFrom, tz)} → ${fmtDateTime(t.latestDelivery, tz)}`], ["Serving", fmtDateTime(t.servingTime, tz)],
            ["Partial OK", t.partialOk ? `yes (min ${t.minUseful})` : "no"], ["Fulfilment", t.fulfilment === "DELIVERY" ? "Delivery requested" : "Organisation collects"],
            ["Area", t.tenant.serviceArea || "—"], ["Distance limit", t.maxDistanceKm ? `${t.maxDistanceKm} km` : "—"],
            ...(view !== "supplier" || res.hasAlloc ? ([["Delivery address", t.deliveryAddress || "—"], ["Receiving contact", t.receivingContact || "—"], ["Unloading", t.unloading || "—"]] as [string, string][]) : []),
            ["Transport funding", t.transportFunding.toLowerCase()], ...(t.urgencyReason ? ([["Urgency reason", t.urgencyReason]] as [string, string][]) : []),
          ]} />
          {view === "supplier" && !res.hasAlloc && <p className="mt-3 text-xs text-muted-foreground">Address and contact are shared once a reservation is confirmed.</p>}
        </Card>

        {view === "admin" && t.urgency === "URGENT_PENDING" && (
          <Card title="Urgency review">
            <ActionForm action={urgencyAction} className="space-y-3">
              <input type="hidden" name="ticketId" value={t.id} />
              <Input name="reason" label="Note" />
              <div className="flex gap-2"><button name="decision" value="approve" className="btn btn-primary">Approve urgency</button><button name="decision" value="deny" className="btn btn-ghost">Keep normal</button></div>
            </ActionForm>
          </Card>
        )}

        {view === "supplier" && (
          <Card title="Offer your confirmed surplus">
            {!supplierLots.length ? <Empty title="No confirmed surplus ready">Confirm a batch first. Expected estimates cannot be offered.</Empty> : (
              <ul className="space-y-3">{supplierLots.map(({ lot, m }) => (
                <li key={lot.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between"><strong>{lot.title}</strong>{m.eligible ? <Badge tone="green">eligible · score {m.score}</Badge> : <Badge tone="red">not eligible</Badge>}</div>
                  {m.eligible ? (
                    <>
                      <p className="mt-1 text-sm">Would offer: {m.lines.map((l) => `${l.quantity} ${unitLabel[l.unit]} (${l.name})`).join(", ")}</p>
                      <p className="text-xs text-muted-foreground">Why: {m.why.join(" · ")}</p>
                      <div className="mt-2"><ActionButton action={proposeOfferAction} fields={{ lotId: lot.id, ticketId: t.id, idem: randomUUID() }}>Send offer</ActionButton></div>
                    </>
                  ) : <ul className="mt-1 list-disc pl-5 text-xs text-danger">{m.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                </li>
              ))}</ul>
            )}
          </Card>
        )}

        {view !== "supplier" && (
          <Card title="Offers">
            {!offers.length ? <Empty title="No offers yet" /> : (
              <ul className="space-y-3">{offers.map((o) => (
                <li key={o.id} className="rounded-xl border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><strong>{o.lot.tenant.name}</strong><Status s={o.status} /></div>
                  <div>{o.lines.map((l) => `${l.quantity} ${unitLabel[l.foodItem.unit]} ${l.foodItem.name}`).join(", ")} · {o.direction === "RECIPIENT_REQUEST" ? "reserved by you" : "offered by restaurant"}</div>
                  {o.status === "PROPOSED" && <div className="text-xs text-muted-foreground">Expires {fmtDateTime(o.expiresAt, tz)}</div>}
                  {o.reason && <div className="text-xs text-muted-foreground">Reason: {o.reason}</div>}
                  {o.status === "PROPOSED" && canAct && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ActionButton action={acceptOfferAction} fields={{ offerId: o.id }} variant="accent">Accept & reserve</ActionButton>
                      <ActionForm action={declineOfferAction} className="flex items-end gap-2"><input type="hidden" name="offerId" value={o.id} /><Input name="reason" label="Decline reason" /><Submit variant="ghost">Decline</Submit></ActionForm>
                    </div>
                  )}
                </li>
              ))}</ul>
            )}
          </Card>
        )}
      </div>

      {view !== "supplier" && (
        <Card title="Allocation ledger">
          {!allocations.length ? <Empty title="Nothing allocated yet" /> : (
            <div className="overflow-x-auto"><table className="data">
              <thead><tr><th>Source</th><th>Item</th><th>Reserved</th><th>Collected</th><th>Accepted / rejected</th><th>Status</th><th>Transport</th><th /></tr></thead>
              <tbody>{allocations.map((a) => (
                <tr key={a.id}>
                  <td>{a.foodItem.lot.tenant.name}</td><td><Qty n={a.quantity} unit={a.foodItem.unit} /> {a.foodItem.name}</td><td>{a.quantity}</td><td>{a.collectedQty}</td><td>{a.acceptedQty} / {a.rejectedQty}</td><td><Status s={a.status} /></td>
                  <td>{a.status === "RESERVED" && !a.job ? <span className="text-amber-ink">Reserved — transport pending · hold until {fmtDateTime(a.holdExpiresAt, tz)}</span> : a.job ? <A href={`/logistics/jobs/${a.job.id}`}>Job: {a.job.status.toLowerCase().replace(/_/g, " ")}</A> : "—"}</td>
                  <td>{a.status === "RESERVED" && canAct && !a.job && (
                    <ActionForm action={cancelAllocationAction} className="flex items-end gap-2"><input type="hidden" name="allocationId" value={a.id} /><Input name="reason" label="Reason" /><Submit variant="danger">Release</Submit></ActionForm>
                  )}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          {isOwner && allocations.some((a) => a.status === "RESERVED" && !a.job) && <p className="mt-3 text-sm"><A href="/org/deliveries">Arrange transport for reserved food →</A></p>}
        </Card>
      )}

      {isOwner && t.status === "OPEN" && (
        <Card title="Matching confirmed surplus">
          {!matches.length ? <Empty title="No confirmed surplus right now">You will be notified when suitable food is confirmed.</Empty> : (
            <ul className="space-y-3">{matches.map(({ lot, m }) => (
              <li key={lot.id} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-3"><Cover id={lotPhotos.get(lot.id)?.[0]} alt={lot.title} className="size-14 shrink-0 rounded-xl ring-1 ring-line" /><span><strong>{lot.title}</strong> · {lot.tenant.name}</span></span>{m.eligible ? <Badge tone="green">eligible · score {m.score}</Badge> : <Badge tone="gray">not eligible</Badge>}</div>
                <div className="text-xs text-muted-foreground">Pickup by {fmtDateTime(lot.pickupDeadline, tz)} · consume by {fmtDateTime(lot.consumeBy, tz)}{m.distanceKm != null ? ` · ${m.distanceKm.toFixed(1)} km straight-line (est. ${m.etaMin} min)` : " · distance unknown"}</div>
                {m.eligible ? (
                  <>
                    <p className="mt-1">Would reserve: {m.lines.map((l) => `${l.quantity} ${unitLabel[l.unit]} (${l.name})`).join(", ")}</p>
                    <p className="text-xs text-muted-foreground">Why this matches: {m.why.join(" · ")}</p>
                    {canAct && (
                      <ActionForm action={reserveLotAction} className="mt-2 flex flex-wrap items-end gap-3">
                        <input type="hidden" name="lotId" value={lot.id} /><input type="hidden" name="ticketId" value={t.id} /><input type="hidden" name="idem" value={randomUUID()} />
                        <Check name="confirm" label="I confirm we can receive and serve this food within its deadlines." />
                        <Submit variant="accent">Reserve</Submit>
                      </ActionForm>
                    )}
                  </>
                ) : <details className="mt-1"><summary className="cursor-pointer text-xs text-muted-foreground">Why not</summary><ul className="list-disc pl-5 text-xs">{m.reasons.map((r) => <li key={r}>{r}</li>)}</ul></details>}
              </li>
            ))}</ul>
          )}
        </Card>
      )}

      {isOwner && canAct && ["DRAFT", "OPEN", "FILLED"].includes(t.status) && (
        <Card title="Cancel ticket">
          <ActionForm action={cancelTicketAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="ticketId" value={t.id} />
            <Input name="reason" label="Reason" required />
            <Submit variant="danger">Cancel ticket</Submit>
          </ActionForm>
          <p className="mt-2 text-xs text-muted-foreground">Uncollected reservations are released with this reason. Food already collected must be received or resolved first.</p>
        </Card>
      )}
    </div>
  );
}
