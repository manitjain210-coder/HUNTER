import Link from "next/link";
import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { now } from "@/lib/time";
import { A, Card, Notice, PageHeader, Stat, Status } from "@/components/kit";
import { Feed } from "@/components/feed";

export const metadata = { title: "Restaurant overview" };

export default async function RestaurantHome() {
  const g = await gate(["RESTAURANT"]);
  if ("deny" in g) return g.deny;
  const { ctx, actor } = g;
  const at = now();
  const [ready, expected, pendingOffers, transportPending, openNeeds, orders] = await Promise.all([
    db.surplusLot.count({ where: { tenantId: ctx.tenantId, stage: "READY" } }),
    db.surplusLot.count({ where: { tenantId: ctx.tenantId, stage: "EXPECTED" } }),
    db.offer.count({ where: { lot: { tenantId: ctx.tenantId }, status: "PROPOSED", expiresAt: { gt: at } } }),
    db.allocation.count({ where: { foodItem: { lot: { tenantId: ctx.tenantId } }, status: "RESERVED", jobId: null } }),
    db.needTicket.count({ where: { status: "OPEN", latestDelivery: { gt: at } } }),
    db.groceryOrder.count({ where: { buyerTenantId: ctx.tenantId, status: "RESERVED" } }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title={ctx.tenantName} subtitle={<>Verification: <Status s={ctx.verificationStatus} /></>} action={<Link href="/restaurant/surplus/new" className="btn btn-accent">List surplus</Link>} />
      {ctx.verificationStatus !== "APPROVED" && <Notice>Approval is required before listing surplus. <A href="/org/profile">Complete verification</A></Notice>}
      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Donate surplus">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Ready batches" value={ready} /><Stat label="Expected" value={expected} />
            <Stat label="Offers awaiting reply" value={pendingOffers} /><Stat label="Reserved, transport pending" value={transportPending} />
          </div>
          <p className="mt-3 text-sm"><A href="/restaurant/needs">{openNeeds} open needs on the network →</A></p>
        </Card>
        <Card title="Buy ingredients">
          <p className="text-sm text-muted-foreground">Near-expiry supermarket stock at seller-approved discounts — same price rules as public buyers.</p>
          <div className="mt-3 grid grid-cols-2 gap-3"><Stat label="Open grocery orders" value={orders} /></div>
          <div className="mt-3 flex gap-2"><Link href="/market" className="btn btn-primary">Browse marketplace</Link><Link href="/restaurant/watchlists" className="btn btn-ghost">Watchlists</Link></div>
        </Card>
      </div>
      <Card title="Activity"><Feed tenantId={ctx.tenantId} userId={actor.userId} /></Card>
    </div>
  );
}
