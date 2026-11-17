import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { fmtDateTime, now } from "@/lib/time";
import { unitLabel } from "@/lib/domain";
import { matchesForTicket } from "@/services/matching";
import { A, Badge, Card, Empty, Notice, PageHeader } from "@/components/kit";
import { Cover } from "@/components/photos";
import { imagesFor } from "@/services/files";

export const metadata = { title: "Available surplus" };

/** Eligible confirmed surplus for this organisation's open tickets. Restricted to verified orgs. */
export default async function AvailableSurplus() {
  const g = await gate(["RECIPIENT"], ["OWNER", "COORDINATOR", "VIEWER"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  if (ctx.verificationStatus !== "APPROVED") return <Notice>Only approved organisations can view donation inventory.</Notice>;
  const tickets = await db.needTicket.findMany({ where: { tenantId: ctx.tenantId, status: "OPEN", latestDelivery: { gt: now() } }, orderBy: { servingTime: "asc" } });
  const rows = [];
  for (const t of tickets) for (const r of (await matchesForTicket(t.id)).filter((x) => x.m.eligible)) rows.push({ t, ...r });
  const lotPhotos = await imagesFor("lot", rows.map((r) => r.lot.id));
  return (
    <div>
      <PageHeader title="Available eligible surplus" subtitle="Confirmed food that passes every hard filter for at least one of your open tickets. Expected estimates are never shown here." />
      <Card>
        {!rows.length ? <Empty title="Nothing eligible right now">{tickets.length ? "You will get an in-app alert when suitable food is confirmed." : "Raise a ticket first."}</Empty> : (
          <div className="overflow-x-auto"><table className="data">
            <thead><tr><th>Food</th><th>Restaurant</th><th>For ticket</th><th>Pickup by</th><th>Score</th><th /></tr></thead>
            <tbody>{rows.map(({ t, lot, m }) => (
              <tr key={t.id + lot.id}>
                <td><div className="flex items-center gap-3"><Cover id={lotPhotos.get(lot.id)?.[0]} alt={lot.title} className="size-12 shrink-0 rounded-lg ring-1 ring-line" /><div className="font-medium">{lot.title}<div className="text-xs font-normal text-muted-foreground">{m.lines.map((l) => `${l.quantity} ${unitLabel[l.unit]}`).join(", ")}</div></div></div></td>
                <td>{lot.tenant.name}<div className="text-xs text-muted-foreground">{m.distanceKm != null ? `${m.distanceKm.toFixed(1)} km straight-line` : "distance unknown"}</div></td>
                <td>{t.title}</td>
                <td>{fmtDateTime(lot.pickupDeadline, ctx.timezone)}</td>
                <td><Badge tone="green">{m.score}</Badge></td>
                <td><A href={`/org/tickets/${t.id}`}>Review & reserve</A></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
