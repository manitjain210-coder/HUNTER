import { requireActor } from "@/lib/session";
import { pageError } from "@/lib/gate";
import { addMin, fmtMoney, now } from "@/lib/time";
import { unitLabel } from "@/lib/domain";
import { donationReport, groceryReport, scopeFor } from "@/services/reports";
import { Card, Notice, PageHeader, Stat } from "@/components/kit";

export const metadata = { title: "Reports" };

const Units = ({ b }: { b: Record<string, number> }) => {
  const e = Object.entries(b).filter(([, v]) => v);
  return e.length ? <span>{e.map(([u, v]) => `${v} ${unitLabel[u] ?? u.toLowerCase()}`).join(" · ")}</span> : <span className="text-muted-foreground">0</span>;
};

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const a = await requireActor();
  let scope;
  try { scope = scopeFor(a); } catch (e) { return pageError(e); }
  const sp = await searchParams;
  const to = sp.to ? new Date(`${sp.to}T23:59:59+05:30`) : now();
  const from = sp.from ? new Date(`${sp.from}T00:00:00+05:30`) : addMin(to, -30 * 1440);
  const [don, gro] = await Promise.all([donationReport(scope, from, to), groceryReport(scope, from, to)]);
  return (
    <div className="space-y-5">
      <PageHeader title="Reports" subtitle={a.ctx ? `Scope: ${a.ctx.tenantName}` : "Scope: whole platform"} />
      <form className="flex flex-wrap items-end gap-2">
        <div><label htmlFor="from" className="mb-1 block text-sm">From</label><input id="from" name="from" type="date" defaultValue={from.toISOString().slice(0, 10)} className="input" /></div>
        <div><label htmlFor="to" className="mb-1 block text-sm">To</label><input id="to" name="to" type="date" defaultValue={to.toISOString().slice(0, 10)} className="input" /></div>
        <button className="btn btn-primary">Apply</button>
      </form>
      <Notice tone="blue">Computed only from recorded quantities. Units are never mixed. Listings, reservations and grocery sales are not counted as donated meals. No CO₂, people-fed or money-saved estimates are produced.</Notice>
      {don && (
        <Card title="Donations" action={<a href="/api/export?kind=allocations" className="text-sm text-forest underline">Export CSV</a>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Confirmed surplus" value={<Units b={don.confirmed} />} />
            <Stat label="Collected" value={<Units b={don.collected} />} />
            <Stat label="Accepted by receivers" value={<Units b={don.accepted} />} />
            <Stat label="Rejected at receipt" value={<Units b={don.rejected} />} />
            <Stat label="Expired / withdrawn unallocated" value={<Units b={don.expired} />} />
            <Stat label="Unfulfilled demand" value={<Units b={don.unfulfilled} />} />
            <Stat label="Completed deliveries" value={don.completedDeliveries} hint={`${don.failedDeliveries} failed`} />
            <Stat label="Avg. ready → receipt" value={don.avgMinutesReadyToReceipt != null ? `${don.avgMinutesReadyToReceipt} min` : "—"} />
            <Stat label="Transport cost / accepted plate" value={don.transportCostPerAcceptedPlateMinor != null ? fmtMoney(don.transportCostPerAcceptedPlateMinor) : "—"} hint={`Total committed ${fmtMoney(don.transportCostMinor)} (commitments, not verified payments)`} />
          </div>
        </Card>
      )}
      {gro && (
        <Card title="Grocery marketplace" action={a.ctx?.tenantKind === "SUPERMARKET" || !a.ctx ? <a href="/api/export?kind=orders" className="text-sm text-forest underline">Export CSV</a> : undefined}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Orders" value={gro.orders} hint={`${gro.collectedOrders} collected · ${gro.cancelledOrExpired} cancelled/expired`} />
            <Stat label="Sold (collected)" value={<Units b={gro.sold} />} />
            <Stat label="Value of collected orders" value={fmtMoney(gro.revenueCollectedMinor)} />
            {a.ctx?.tenantKind !== "RESTAURANT" && <Stat label="Expired unsold stock" value={<Units b={gro.expiredStock} />} />}
          </div>
        </Card>
      )}
      {!don && !gro && <p className="text-sm text-muted-foreground">No reports for this context.</p>}
    </div>
  );
}
