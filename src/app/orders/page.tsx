import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { fmtDateTime, fmtMoney } from "@/lib/time";
import { A, Card, Empty, PageHeader, Status } from "@/components/kit";

export const metadata = { title: "My orders" };

export default async function Orders() {
  const a = await requireActor();
  const buyerTenantId = a.ctx?.tenantKind === "RESTAURANT" ? a.ctx.tenantId : null;
  const orders = await db.groceryOrder.findMany({ where: buyerTenantId ? { buyerTenantId } : { buyerUserId: a.userId, buyerTenantId: null }, include: { seller: true, items: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div>
      <PageHeader title={buyerTenantId ? `Grocery orders · ${a.ctx!.tenantName}` : "My orders"} />
      <Card>
        {!orders.length ? <Empty title="No orders yet"><A href="/market">Browse the marketplace</A></Empty> : (
          <div className="overflow-x-auto"><table className="data">
            <thead><tr><th>Order</th><th>Store</th><th>Total</th><th>Status</th><th>Payment</th><th>Placed</th></tr></thead>
            <tbody>{orders.map((o) => (
              <tr key={o.id}><td><A href={`/orders/${o.id}`}>{o.id.slice(-6)}</A></td><td>{o.seller.name}</td><td>{fmtMoney(o.totalMinor)}</td><td><Status s={o.status} /></td><td><Status s={o.paymentStatus} /></td><td>{fmtDateTime(o.createdAt)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
