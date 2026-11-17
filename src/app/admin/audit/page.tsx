import { db } from "@/lib/db";
import { adminGate } from "@/lib/gate";
import { fmtDateTime } from "@/lib/time";
import { Card, PageHeader } from "@/components/kit";

export const metadata = { title: "Audit log" };

export default async function Audit({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const g = await adminGate();
  if ("deny" in g) return g.deny;
  const q = (await searchParams).q?.slice(0, 60) ?? "";
  const events = await db.auditEvent.findMany({ where: q ? { OR: [{ action: { contains: q } }, { entityId: { contains: q } }, { entityType: { contains: q } }] } : {}, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  const tenants = await db.tenant.findMany({ where: { id: { in: events.map((e) => e.tenantId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" subtitle="Who did what, on behalf of which organisation, and when (UTC stored, shown in IST)." />
      <form role="search" className="flex gap-2"><label htmlFor="q" className="sr-only">Filter</label><input id="q" name="q" defaultValue={q} className="input max-w-xs" placeholder="action, entity type or id" /><button className="btn btn-primary">Filter</button></form>
      <Card>
        <div className="overflow-x-auto"><table className="data">
          <thead><tr><th>When</th><th>Actor</th><th>On behalf of</th><th>Action</th><th>Entity</th><th>Data</th></tr></thead>
          <tbody>{events.map((e) => (
            <tr key={e.id}><td className="whitespace-nowrap">{fmtDateTime(e.createdAt)}</td><td>{e.actor?.name ?? "system"}</td><td>{tenants.find((t) => t.id === e.tenantId)?.name ?? "—"}</td><td>{e.action}</td><td className="text-xs">{e.entityType} {e.entityId.slice(-8)}</td><td className="max-w-xs truncate text-xs text-muted-foreground" title={e.data}>{e.data}</td></tr>
          ))}</tbody>
        </table></div>
      </Card>
    </div>
  );
}
