import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { addMin, fmtDateTime, now, toLocalInput } from "@/lib/time";
import { parseJson, unitLabel } from "@/lib/domain";
import { lotLedger } from "@/services/surplus";
import { matchesForLot } from "@/services/matching";
import { A, Badge, Card, Empty, KV, Notice, PageHeader, Status } from "@/components/kit";
import { ActionButton, ActionForm, Input, Submit } from "@/components/form";
import { Countdown } from "@/components/countdown";
import { SurplusForm } from "@/components/surplus-form";
import { adjustItemAction, proposeOfferAction, withdrawLotAction, withdrawOfferAction } from "@/app/actions/donation";
import { Gallery } from "@/components/photo-client";
import { PhotoManager } from "@/components/photos";
import { imagesFor } from "@/services/files";

export default async function LotPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ confirmed?: string }> }) {
  const { id } = await params;
  const { confirmed } = await searchParams;
  const g = await gate(["RESTAURANT"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  const lot = await db.surplusLot.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { items: true, offers: { include: { ticket: { include: { tenant: true } }, lines: { include: { foodItem: true } } }, orderBy: { createdAt: "desc" } } } });
  if (!lot) notFound();
  const tz = ctx.timezone, at = now();
  const ledger = await lotLedger(lot.id);
  const canWrite = ctx.role !== "VIEWER";
  const matches = lot.stage === "READY" ? (await matchesForLot(lot.id)).slice(0, 10) : [];
  const flags = parseJson<string[]>(lot.flags, []);
  const photoIds = (await imagesFor("lot", [lot.id])).get(lot.id) ?? [];
  const movements = await db.inventoryMovement.findMany({ where: { foodItemId: { in: lot.items.map((i) => i.id) } }, orderBy: { createdAt: "desc" }, take: 30 });

  return (
    <div className="space-y-5">
      <PageHeader title={lot.title} subtitle={<span className="flex items-center gap-2"><Status s={lot.stage} /> {lot.dietCategory.toLowerCase()} · {lot.storage.toLowerCase().replace("_", " ")}</span>} />
      {confirmed && <Notice tone="green">Confirmed. The best-matching organisations have been alerted in-app; further waves follow automatically if nobody accepts.</Notice>}
      {flags.length > 0 && <Notice>Flagged for review: {flags.join(" · ")}</Notice>}
      {lot.stage === "EXPECTED" && <Notice tone="blue">Expected surplus is an estimate. Confirm actual stock below when it is ready — only then can it be offered.</Notice>}
      {lot.closeReason && <Notice tone="red">Closed: {lot.closeReason}</Notice>}
      {lot.stage === "READY" && (
        <div className="flex flex-wrap gap-2">
          <Countdown label="Pickup deadline" from={lot.readyAt?.toISOString()} to={lot.pickupDeadline?.toISOString() ?? null} serverNow={at.toISOString()} />
          <Countdown label="Consume by" from={lot.preparedAt?.toISOString()} to={lot.consumeBy?.toISOString() ?? null} serverNow={at.toISOString()} />
        </div>
      )}

      <Card title="Allocation ledger (per item, per unit)">
        <div className="overflow-x-auto"><table className="data">
          <thead><tr><th>Item</th><th>Confirmed</th><th>Available</th><th>Offered</th><th>Reserved</th><th>Collected</th><th>Accepted</th><th>Rejected</th><th>Released</th><th>Allergens</th>{canWrite && lot.stage === "READY" && <th>Correct qty</th>}</tr></thead>
          <tbody>{ledger.map((l) => (
            <tr key={l.id}>
              <td className="font-medium">{l.name}<div className="text-xs text-muted-foreground">{unitLabel[l.unit]}</div></td>
              <td>{l.quantity}</td><td className="font-semibold">{l.available}</td><td>{l.offered}</td><td>{l.reserved}</td><td>{l.collected}</td><td>{l.accepted}</td><td>{l.rejected}</td><td>{l.released}</td>
              <td>{l.allergensUnknown ? <Badge tone="amber">unknown</Badge> : l.allergens.join(", ") || "none declared"}</td>
              {canWrite && lot.stage === "READY" && <td><ActionForm action={adjustItemAction} className="flex items-end gap-1"><input type="hidden" name="itemId" value={l.id} /><Input name="quantity" label="Qty" type="number" defaultValue={String(l.quantity)} /><Input name="reason" label="Reason" /><Submit variant="ghost">Save</Submit></ActionForm></td>}
            </tr>
          ))}</tbody>
        </table></div>
      </Card>

      {lot.stage === "EXPECTED" && canWrite && (
        <Card title="Confirm actual surplus">
          <SurplusForm mode="READY" lotId={lot.id} initialItems={lot.items.map((i) => ({ name: i.name, kind: i.kind, unit: i.unit, quantity: i.quantity, servingDesc: i.servingDesc, ingredients: i.ingredients, allergens: parseJson(i.allergens, []), allergensUnknown: i.allergensUnknown }))}
            d={{ title: lot.title, dietCategory: lot.dietCategory, preparedAt: toLocalInput(addMin(at, -30), tz), readyAt: toLocalInput(at, tz), pickupDeadline: toLocalInput(addMin(at, 60), tz), consumeBy: toLocalInput(addMin(at, 240), tz) }} />
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Photos">
          {photoIds.length > 0 && <div className="mb-4"><Gallery ids={photoIds} alt={lot.title} /></div>}
          <PhotoManager ids={photoIds} target={{ lotId: lot.id }} canEdit={canWrite && ["EXPECTED", "READY"].includes(lot.stage)} />
          <p className="mt-2 text-xs text-muted-foreground">Visible to approved organisations on the network. Photos never establish food safety.</p>
        </Card>
        <Card title="Batch details">
          <KV items={[
            ["Prepared", fmtDateTime(lot.preparedAt, tz)], ["Ready", fmtDateTime(lot.readyAt, tz)], ["Pickup deadline", fmtDateTime(lot.pickupDeadline, tz)], ["Consume by", fmtDateTime(lot.consumeBy, tz)],
            ["Expected window", lot.expectedFrom ? `${fmtDateTime(lot.expectedFrom, tz)} – ${fmtDateTime(lot.expectedUntil, tz)}` : "—"], ["Packaging", lot.packaging || "—"], ["Handling declaration", lot.handlingDeclaration ? "signed" : "not yet"], ["Notes", lot.notes || "—"],
          ]} />
        </Card>
        <Card title="Offers">
          {!lot.offers.length ? <Empty title="No offers yet" /> : (
            <ul className="space-y-2 text-sm">{lot.offers.map((o) => (
              <li key={o.id} className="rounded-lg border border-line p-2">
                <div className="flex justify-between"><span>{o.ticket.tenant.name} · <A href={`/org/tickets/${o.ticketId}`}>{o.ticket.title}</A></span><Status s={o.status} /></div>
                <div className="text-xs text-muted-foreground">{o.lines.map((l) => `${l.quantity} ${unitLabel[l.foodItem.unit]} ${l.foodItem.name}`).join(", ")}{o.reason ? ` · ${o.reason}` : ""}</div>
                {o.status === "PROPOSED" && canWrite && <div className="mt-1"><ActionButton action={withdrawOfferAction} fields={{ offerId: o.id }} variant="ghost">Withdraw</ActionButton></div>}
              </li>
            ))}</ul>
          )}
        </Card>
      </div>

      {lot.stage === "READY" && (
        <Card title="Matching needs">
          {!matches.length ? <Empty title="No open tickets right now" /> : (
            <ul className="space-y-3">{matches.map(({ ticket, m }) => (
              <li key={ticket.id} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><span><strong>{ticket.title}</strong> · {ticket.tenant.name}</span>{m.eligible ? <Badge tone="green">eligible · score {m.score}</Badge> : <Badge>not eligible</Badge>}</div>
                <div className="text-xs text-muted-foreground">Serving {fmtDateTime(ticket.servingTime, tz)}{m.distanceKm != null ? ` · ${m.distanceKm.toFixed(1)} km straight-line` : " · distance unknown"}</div>
                {m.eligible ? (
                  <>
                    <p className="mt-1">Would offer: {m.lines.map((l) => `${l.quantity} ${unitLabel[l.unit]} (${l.name})`).join(", ")}</p>
                    <p className="text-xs text-muted-foreground">Why: {m.why.join(" · ")}</p>
                    {canWrite && <div className="mt-2"><ActionButton action={proposeOfferAction} fields={{ lotId: lot.id, ticketId: ticket.id, idem: randomUUID() }}>Send offer</ActionButton></div>}
                  </>
                ) : <details><summary className="cursor-pointer text-xs text-muted-foreground">Why not</summary><ul className="list-disc pl-5 text-xs">{m.reasons.map((r) => <li key={r}>{r}</li>)}</ul></details>}
              </li>
            ))}</ul>
          )}
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Quantity history">
          <ul className="space-y-1 text-xs">{movements.map((mv) => <li key={mv.id}>{fmtDateTime(mv.createdAt, tz)} · {mv.type.toLowerCase()} {mv.quantity}{mv.reason ? ` · ${mv.reason}` : ""}</li>)}</ul>
        </Card>
        {["EXPECTED", "READY"].includes(lot.stage) && canWrite && (
          <Card title="Withdraw from distribution">
            <ActionForm action={withdrawLotAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="lotId" value={lot.id} />
              <Input name="reason" label="Reason" required />
              <Submit variant="danger">Withdraw</Submit>
            </ActionForm>
            <p className="mt-2 text-xs text-muted-foreground">Uncollected reservations are released and the organisations notified. Food already collected is unaffected.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
