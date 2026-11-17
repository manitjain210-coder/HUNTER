import { db } from "@/lib/db";
import { adminGate } from "@/lib/gate";
import { fmtDate, fmtDateTime, fmtMoney, now } from "@/lib/time";
import { A, Card, Empty, PageHeader, Status } from "@/components/kit";

export const metadata = { title: "Grocery orders" };

export default async function AdminOrders() {
  const g = await adminGate();
  if ("deny" in g) return g.deny;
  const [orders, expired] = await Promise.all([
    db.groceryOrder.findMany({ include: { seller: true, buyer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.productBatch.findMany({ where: { expiryDate: { lte: now() }, status: "ACTIVE" }, include: { product: true, tenant: true } }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="Grocery orders" subtitle={<>CSV: <a className="text-forest underline" href="/api/export?kind=orders">export all</a></>} />
      <Card title="Orders">
        {!orders.length ? <Empty title="No orders" /> : (
          <div className="overflow-x-auto"><table className="data"><thead><tr><th>Order</th><th>Seller</th><th>Buyer</th><th>Total</th><th>Status</th><th>Payment</th><th>Placed</th></tr></thead>
            <tbody>{orders.map((o) => <tr key={o.id}><td><A href={`/orders/${o.id}`}>{o.id.slice(-6)}</A></td><td>{o.seller.name}</td><td>{o.buyer.name}</td><td>{fmtMoney(o.totalMinor)}</td><td><Status s={o.status} /></td><td><Status s={o.paymentStatus} /></td><td>{fmtDateTime(o.createdAt)}</td></tr>)}</tbody></table></div>
        )}
      </Card>
      <Card title="Expired batches (not sellable; shown for stock follow-up)">
        {!expired.length ? <Empty title="None" /> : <ul className="text-sm">{expired.map((b) => <li key={b.id}>{b.product.name} · {b.batchCode} · {b.tenant.name} · expired {fmtDate(b.expiryDate)} · {b.quantity - b.soldQty - b.reservedQty} unsold</li>)}</ul>}
      </Card>
    </div>
  );
}
