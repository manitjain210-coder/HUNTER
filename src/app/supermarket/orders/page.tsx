import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { fmtDateTime, fmtMoney } from "@/lib/time";
import { A, Card, Empty, PageHeader, Status } from "@/components/kit";

export const metadata = { title: "Orders & collection" };

export default async function SellerOrders() {
  const g = await gate(["SUPERMARKET"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  const orders = await db.groceryOrder.findMany({ where: { sellerTenantId: ctx.tenantId }, include: { buyer: { select: { name: true } }, buyerTenant: { select: { name: true } }, items: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div>
      <PageHeader title="Orders & collection" subtitle={<>CSV export: <a className="text-forest underline" href="/api/export?kind=orders">download</a></>} />
      <Card>
        {!orders.length ? <Empty title="No orders yet" /> : (
          <div className="overflow-x-auto"><table className="data">
            <thead><tr><th>Order</th><th>Buyer</th><th>Total</th><th>Status</th><th>Payment</th><th>Hold until</th></tr></thead>
            <tbody>{orders.map((o) => (
              <tr key={o.id}><td><A href={`/orders/${o.id}`}>{o.id.slice(-6)}</A></td><td>{o.buyerTenant?.name ?? o.buyer.name}</td><td>{fmtMoney(o.totalMinor)}</td><td><Status s={o.status} /></td><td><Status s={o.paymentStatus} /></td><td>{fmtDateTime(o.reservationExpiresAt, ctx.timezone)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
