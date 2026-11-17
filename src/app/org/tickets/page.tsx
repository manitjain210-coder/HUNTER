import Link from "next/link";
import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { fmtDateTime } from "@/lib/time";
import { A, Card, Empty, PageHeader, Status } from "@/components/kit";

export const metadata = { title: "Tickets" };

export default async function Tickets({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const g = await gate(["RECIPIENT"], ["OWNER", "COORDINATOR", "VIEWER"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  const { status } = await searchParams;
  const tickets = await db.needTicket.findMany({ where: { tenantId: ctx.tenantId, ...(status ? { status } : {}) }, include: { requirements: true }, orderBy: { needDate: "desc" }, take: 100 });
  const filters = ["", "OPEN", "FILLED", "DRAFT", "EXPIRED", "CANCELLED"];
  return (
    <div>
      <PageHeader title="Food-need tickets" action={ctx.role !== "VIEWER" ? <Link href="/org/tickets/new" className="btn btn-accent">Raise a ticket</Link> : undefined} />
      <nav aria-label="Filter" className="mb-4 flex flex-wrap gap-2 text-sm">
        {filters.map((f) => <Link key={f} href={f ? `?status=${f}` : "?"} className={`rounded-full border px-3 py-1 ${status === f || (!status && !f) ? "border-forest bg-forest-50 text-forest" : "border-line bg-white"}`}>{f ? f.toLowerCase() : "all"}</Link>)}
      </nav>
      <Card>
        {!tickets.length ? <Empty title="No tickets here">Raise a ticket in advance so restaurants can plan.</Empty> : (
          <div className="overflow-x-auto"><table className="data">
            <thead><tr><th>Ticket</th><th>Serving</th><th>Need</th><th>Committed</th><th>Status</th></tr></thead>
            <tbody>{tickets.map((t) => (
              <tr key={t.id}>
                <td><A href={`/org/tickets/${t.id}`}>{t.title}</A><div className="text-xs text-muted-foreground">{t.mealSlot.toLowerCase()}{t.scheduleId ? " · recurring" : ""}</div></td>
                <td>{fmtDateTime(t.servingTime, ctx.timezone)}</td>
                <td>{t.requirements.map((r) => `${r.quantity} ${r.unit.toLowerCase()} ${r.kind === "COMPONENT" ? r.name : ""}`).join(", ")}</td>
                <td>{t.requirements.map((r) => `${r.reservedQty}/${r.quantity}`).join(", ")}</td>
                <td><Status s={t.status} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
