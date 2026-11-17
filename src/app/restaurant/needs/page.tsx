import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { fmtDateTime, now } from "@/lib/time";
import { distanceKm } from "@/lib/geo";
import { A, Card, Empty, Notice, PageHeader, Status } from "@/components/kit";

export const metadata = { title: "Nearby needs" };

/** Public-safe view of open tickets: organisation name, area, needs and timing. No addresses or contacts. */
export default async function Needs() {
  const g = await gate(["RESTAURANT"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  if (ctx.verificationStatus !== "APPROVED") return <Notice>Only approved restaurants can see the needs network.</Notice>;
  const me = await db.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
  const tickets = await db.needTicket.findMany({ where: { status: "OPEN", latestDelivery: { gt: now() } }, include: { tenant: true, requirements: true }, orderBy: { servingTime: "asc" }, take: 100 });
  const rows = tickets.map((t) => ({ t, d: distanceKm(me, t) })).sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
  return (
    <div>
      <PageHeader title="Open needs near you" subtitle="Sorted by straight-line distance where coordinates exist. Open a ticket to check eligibility against your confirmed batches." />
      <Card>
        {!rows.length ? <Empty title="No open needs right now" /> : (
          <div className="overflow-x-auto"><table className="data">
            <thead><tr><th>Need</th><th>Organisation</th><th>Remaining</th><th>Serving</th><th>Distance</th></tr></thead>
            <tbody>{rows.map(({ t, d }) => (
              <tr key={t.id}>
                <td><A href={`/org/tickets/${t.id}`}>{t.title}</A>{t.urgency === "URGENT" && <> <Status s="URGENT" /></>}<div className="text-xs text-muted-foreground">{t.dietPref.toLowerCase()} · {t.mealSlot.toLowerCase()}</div></td>
                <td>{t.tenant.name}<div className="text-xs text-muted-foreground">{t.tenant.serviceArea}</div></td>
                <td>{t.requirements.map((r) => `${r.quantity - r.reservedQty} ${r.unit.toLowerCase()}${r.kind === "COMPONENT" ? ` ${r.name}` : ""}`).join(", ")}</td>
                <td>{fmtDateTime(t.servingTime, ctx.timezone)}</td>
                <td>{d != null ? `${d.toFixed(1)} km` : "unknown"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
