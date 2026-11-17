import Link from "next/link";
import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { addMin, fmtDate, now } from "@/lib/time";
import { A, Card, Empty, Notice, Stat, Status } from "@/components/kit";
import { Feed } from "@/components/feed";
import { PhotoBand } from "@/components/photo-band";

export const metadata = { title: "Supermarket overview" };

export default async function SupermarketHome() {
  const g = await gate(["SUPERMARKET"]);
  if ("deny" in g) return g.deny;
  const { ctx, actor } = g;
  const at = now();
  const [active, toCollect, lowShelf, expiredWithStock] = await Promise.all([
    db.productBatch.count({ where: { tenantId: ctx.tenantId, status: "ACTIVE", expiryDate: { gt: at } } }),
    db.groceryOrder.count({ where: { sellerTenantId: ctx.tenantId, status: "RESERVED" } }),
    db.productBatch.findMany({ where: { tenantId: ctx.tenantId, status: "ACTIVE", expiryDate: { gt: at, lt: addMin(at, 3 * 1440) } }, include: { product: true }, orderBy: { expiryDate: "asc" } }),
    db.productBatch.findMany({ where: { tenantId: ctx.tenantId, expiryDate: { lte: at } }, include: { product: true } }),
  ]);
  const unsold = expiredWithStock.filter((b) => b.quantity - b.soldQty - b.reservedQty > 0);
  return (
    <div className="space-y-5">
      <PhotoBand src="/photos/supermarket-night.jpg" position="center 62%" className="mb-7">
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 py-10 md:px-10 md:py-12">
          <div>
            <h1 className="text-[1.9rem] leading-tight text-white md:text-[2.3rem]">{ctx.tenantName}</h1>
            <div className="mt-2 text-white/80">Verification: <Status s={ctx.verificationStatus} /></div>
          </div>
          <Link href="/supermarket/products" className="btn !bg-turmeric !text-turmeric-ink hover:!bg-[#ffc81f]">Add stock</Link>
        </div>
      </PhotoBand>
      {ctx.verificationStatus !== "APPROVED" && <Notice>Approval is required before your stock appears in the marketplace.</Notice>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Batches on sale" value={active} />
        <Stat label="Orders to hand over" value={toCollect} />
        <Stat label="Expiring within 3 days" value={lowShelf.length} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Low shelf-life alerts">
          {!lowShelf.length ? <Empty title="Nothing expiring soon" /> : (
            <ul className="divide-y divide-line text-sm">{lowShelf.map((b) => <li key={b.id} className="flex justify-between py-2"><A href={`/market/${b.id}`}>{b.product.name} · {b.batchCode}</A><span>{b.quantity - b.reservedQty - b.soldQty} left · expires {fmtDate(b.expiryDate)}</span></li>)}</ul>
          )}
          {unsold.length > 0 && <p className="mt-3 text-sm text-danger">{unsold.length} expired batch(es) still have unsold stock. They are no longer sellable and are not extended.</p>}
        </Card>
        <Card title="Activity"><Feed tenantId={ctx.tenantId} userId={actor.userId} /></Card>
      </div>
    </div>
  );
}
