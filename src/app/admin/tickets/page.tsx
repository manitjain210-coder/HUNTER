import { db } from "@/lib/db";
import { adminGate } from "@/lib/gate";
import { fmtDateTime } from "@/lib/time";
import { parseJson, unitLabel } from "@/lib/domain";
import { A, Card, Empty, PageHeader, Status } from "@/components/kit";

export const metadata = { title: "Tickets & allocations" };

export default async function AdminTickets({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const g = await adminGate();
  if ("deny" in g) return g.deny;
  const status = (await searchParams).status;
  const [tickets, lots, allocations] = await Promise.all([
    db.needTicket.findMany({ where: status ? { status } : {}, include: { tenant: true, requirements: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.surplusLot.findMany({ where: { stage: { in: ["READY", "EXPECTED"] } }, include: { tenant: true, items: true }, orderBy: { createdAt: "desc" } }),
    db.allocation.findMany({ include: { foodItem: { include: { lot: { include: { tenant: true } } } }, ticket: { include: { tenant: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const needsReview = tickets.filter((t) => t.urgency === "URGENT_PENDING" || parseJson<string[]>(t.flags, []).length);
  return (
    <div className="space-y-5">
      <PageHeader title="Tickets, food lots & allocations" />
      <Card title="Needs review (urgency or flags)">
        {!needsReview.length ? <Empty title="Nothing to review" /> : (
          <ul className="space-y-2 text-sm">{needsReview.map((t) => <li key={t.id}><A href={`/org/tickets/${t.id}`}>{t.title}</A> · {t.tenant.name} {t.urgency === "URGENT_PENDING" && <Status s="URGENT_PENDING" />}<div className="text-xs text-amber-ink">{parseJson<string[]>(t.flags, []).join(" · ")}</div></li>)}</ul>
        )}
      </Card>
      <Card title="Tickets">
        <div className="overflow-x-auto"><table className="data"><thead><tr><th>Ticket</th><th>Organisation</th><th>Serving</th><th>Committed</th><th>Status</th></tr></thead>
          <tbody>{tickets.map((t) => <tr key={t.id}><td><A href={`/org/tickets/${t.id}`}>{t.title}</A></td><td>{t.tenant.name}</td><td>{fmtDateTime(t.servingTime)}</td><td>{t.requirements.map((r) => `${r.reservedQty}/${r.quantity} ${r.unit.toLowerCase()}`).join(", ")}</td><td><Status s={t.status} /></td></tr>)}</tbody></table></div>
      </Card>
      <Card title="Open food lots">
        <div className="overflow-x-auto"><table className="data"><thead><tr><th>Lot</th><th>Restaurant</th><th>Items</th><th>Pickup by</th><th>Flags</th><th>Stage</th></tr></thead>
          <tbody>{lots.map((l) => <tr key={l.id}><td>{l.title}</td><td>{l.tenant.name}</td><td>{l.items.map((i) => `${i.quantity - i.allocatedQty}/${i.quantity} ${unitLabel[i.unit]}`).join(", ")}</td><td>{fmtDateTime(l.pickupDeadline)}</td><td className="text-xs text-amber-ink">{parseJson<string[]>(l.flags, []).join("; ")}</td><td><Status s={l.stage} /></td></tr>)}</tbody></table></div>
      </Card>
      <Card title="Recent allocations">
        <div className="overflow-x-auto"><table className="data"><thead><tr><th>Food</th><th>From → to</th><th>Reserved / collected / accepted / rejected</th><th>Status</th></tr></thead>
          <tbody>{allocations.map((a) => <tr key={a.id}><td>{a.foodItem.name} ({unitLabel[a.foodItem.unit]})</td><td>{a.foodItem.lot.tenant.name} → {a.ticket.tenant.name}</td><td>{a.quantity} / {a.collectedQty} / {a.acceptedQty} / {a.rejectedQty}</td><td><Status s={a.status} /></td></tr>)}</tbody></table></div>
      </Card>
    </div>
  );
}
