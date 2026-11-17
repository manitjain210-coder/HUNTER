import { getActor, demoMode } from "@/lib/session";
import { pageError } from "@/lib/gate";
import { getOrderFor } from "@/services/marketplace";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/time";
import { parseJson, unitLabel } from "@/lib/domain";
import { Card, KV, Notice, PageHeader, Status } from "@/components/kit";
import { ActionButton, ActionForm, Input, Select, Submit } from "@/components/form";
import { cancelOrderAction, collectOrderAction, confirmPaymentAction, recordPaymentAction } from "@/app/actions/ops";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { id } = await params;
  const { placed } = await searchParams;
  const a = await getActor();
  let o;
  try { o = await getOrderFor(a, id); } catch (e) { return pageError(e); }
  const isBuyer = o.buyerUserId === a!.userId;
  const isSeller = a!.ctx?.tenantId === o.sellerTenantId && a!.ctx.role !== "VIEWER";
  const isAdmin = a!.isAdmin && !a!.ctx;
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title={`Order ${o.id.slice(-6)}`} subtitle={<span className="flex gap-2"><Status s={o.status} /> <Status s={o.paymentStatus} /></span>} />
      {placed && <Notice tone="green">Reserved. Collect from {o.seller.name} before {fmtDateTime(o.reservationExpiresAt)}. No payment has been taken.</Notice>}
      {o.paymentStatus === "DEMO_SIMULATED" && <Notice>Payment status is a <strong>simulated demo payment</strong>. No money moved.</Notice>}
      {o.paymentStatus === "MANUAL_REPORTED" && <Notice tone="blue">Payment reported offline by the seller; awaiting admin confirmation.</Notice>}
      <Card title="Items (price snapshot at checkout)">
        <table className="data"><thead><tr><th>Item</th><th>Batch</th><th>Qty</th><th>Unit price</th><th>Breakdown</th></tr></thead>
          <tbody>{o.items.map((i) => { const snap = parseJson<Record<string, number | boolean>>(i.pricingSnapshot, {}); return (
            <tr key={i.id}><td>{i.batch.product.name}</td><td>{i.batch.batchCode}<div className="text-xs text-muted-foreground">exp {fmtDate(i.batch.expiryDate)}</div></td><td>{i.quantity} {unitLabel[i.batch.product.unit]}</td><td>{fmtMoney(i.unitPriceMinor)}<div className="text-xs text-muted-foreground line-through">{fmtMoney(i.originalPriceMinor)}</div></td>
              <td className="text-xs">{snap.timePct != null ? `time ${snap.timePct}% · volume ${snap.qtyPct}% → ${snap.combinedPct}%${snap.floorApplied ? " (floor)" : ""}${snap.ruleVersion ? ` · rule v${snap.ruleVersion}` : ""}` : "seeded example"}</td></tr>
          ); })}</tbody>
        </table>
        <p className="mt-3 text-right text-lg font-semibold">Total {fmtMoney(o.totalMinor)}</p>
      </Card>
      <Card title="Collection">
        <KV items={[["Store", o.seller.name], ["Address", o.seller.address], ["Hold until", fmtDateTime(o.reservationExpiresAt)], ["Collected", fmtDateTime(o.collectedAt)], ...(isSeller ? ([["Buyer", `${o.buyer.name} · ${o.buyer.phone}`]] as [string, string][]) : [])]} />
        {o.payments.length > 0 && <ul className="mt-3 text-xs">{o.payments.map((p) => <li key={p.id}>{p.method.toLowerCase().replace(/_/g, " ")} · {fmtMoney(p.amountMinor)} · {p.status.toLowerCase().replace(/_/g, " ")}{p.reference ? ` · ref ${p.reference}` : ""}</li>)}</ul>}
        <div className="mt-4 flex flex-wrap gap-3">
          {isSeller && o.status === "RESERVED" && <ActionButton action={collectOrderAction} fields={{ orderId: o.id }} variant="accent">Confirm collected</ActionButton>}
          {isSeller && o.paymentStatus === "PENDING" && (
            <ActionForm action={recordPaymentAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="orderId" value={o.id} />
              <Select name="method" label="Offline payment received" options={[["CASH_AT_PICKUP", "Cash at pickup"], ["UPI_MANUAL", "UPI (checked manually)"], ["BANK_MANUAL", "Bank transfer (checked manually)"]]} />
              <Input name="reference" label="Reference" /><Submit variant="ghost">Record</Submit>
            </ActionForm>
          )}
          {isBuyer && o.paymentStatus === "PENDING" && demoMode() && <ActionButton action={recordPaymentAction} fields={{ orderId: o.id, method: "DEMO_SIMULATED", reference: "demo" }} variant="ghost">Simulate payment (demo mode only)</ActionButton>}
          {isAdmin && o.paymentStatus === "MANUAL_REPORTED" && <ActionButton action={confirmPaymentAction} fields={{ orderId: o.id }}>Admin: confirm payment</ActionButton>}
          {(isBuyer || isSeller || isAdmin) && o.status === "RESERVED" && (
            <ActionForm action={cancelOrderAction} className="flex items-end gap-2"><input type="hidden" name="orderId" value={o.id} /><Input name="reason" label="Cancel reason" /><Submit variant="danger">Cancel order</Submit></ActionForm>
          )}
        </div>
      </Card>
    </div>
  );
}
