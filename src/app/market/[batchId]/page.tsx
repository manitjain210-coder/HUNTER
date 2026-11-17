import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getActor } from "@/lib/session";
import { getPolicy } from "@/lib/policy";
import { quote, ruleFor, sellable } from "@/services/marketplace";
import { fmtDate, fmtMoney, now } from "@/lib/time";
import { parseJson, unitLabel } from "@/lib/domain";
import { A, Card, KV, Notice, PageHeader, Sticker } from "@/components/kit";
import { ActionForm, Input, Submit } from "@/components/form";
import { addToCartAction } from "@/app/actions/ops";
import { Gallery } from "@/components/photo-client";
import { Cover } from "@/components/photos";
import { imagesFor } from "@/services/files";

export default async function BatchPage({ params, searchParams }: { params: Promise<{ batchId: string }>; searchParams: Promise<{ qty?: string }> }) {
  const { batchId } = await params;
  const qty = Math.max(1, Math.round(Number((await searchParams).qty ?? 0)) || 0);
  const b = await db.productBatch.findFirst({ where: { id: batchId, tenant: { verificationStatus: "APPROVED" } }, include: { product: true, tenant: true } });
  if (!b) notFound();
  const at = now();
  const policy = await getPolicy();
  const rule = await ruleFor(db, b);
  const preview = [b.minOrder, ...parseJson<{ minQty: number }[]>(rule?.qtyTiers, []).map((t) => t.minQty), ...(qty ? [qty] : [])].filter((v, i, a) => v >= b.minOrder && a.indexOf(v) === i).sort((x, y) => x - y);
  const available = b.quantity - b.reservedQty - b.soldQty;
  const problem = sellable(b, at);
  const actor = await getActor();
  const canBuy = actor && (!actor.ctx || (actor.ctx.tenantKind === "RESTAURANT" && actor.ctx.role !== "VIEWER"));
  const q0 = quote(b, rule, b.minOrder, at, policy.maxDiscountPct);
  const photoIds = (await imagesFor("product", [b.productId])).get(b.productId) ?? [];
  return (
    <div className="space-y-5">
      <PageHeader title={b.product.name} subtitle={`${b.tenant.name} · batch ${b.batchCode}`} />
      {problem && <Notice tone="red">{problem}. This batch cannot be ordered.</Notice>}
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
        {photoIds.length ? <Gallery ids={photoIds} alt={b.product.name} /> : <Cover alt={b.product.name} className="aspect-[4/3] w-full rounded-2xl ring-1 ring-line" />}
        <Card title="Batch">
          <KV items={[
            ["Expiry date", `${fmtDate(b.expiryDate)} (${q0.daysLeft} days left)`], ["Best before", b.bestBefore ? fmtDate(b.bestBefore) : "not provided"], ["Storage", b.storage.toLowerCase()],
            ["Available", `${available} ${unitLabel[b.product.unit]}`], ["Minimum order", b.minOrder], ["Pickup location", b.pickupLocation || b.tenant.address], ["Category", b.product.category], ["Original price", fmtMoney(b.originalPriceMinor)],
          ]} />
          {b.product.description && <p className="mt-3 text-sm">{b.product.description}</p>}
        </Card>
        </div>
        <Card title="Price breakdown" className="self-start lg:sticky lg:top-24">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-3xl font-semibold tabular-nums">{fmtMoney(q0.unitMinor)}</div>
              <div className="text-sm text-muted-foreground">{q0.combinedPct > 0 ? <>was <span className="line-through">{fmtMoney(q0.originalMinor)}</span> · </> : null}per {unitLabel[b.product.unit]?.replace(/s$/, "")} · {q0.daysLeft} day{q0.daysLeft === 1 ? "" : "s"} left</div>
            </div>
            <Sticker pct={q0.combinedPct} size="lg" />
          </div>
          <table className="data"><thead><tr><th>Qty</th><th>Time</th><th>Volume</th><th>Total off</th><th>Unit price</th></tr></thead>
            <tbody>{preview.map((n) => { const q = quote(b, rule, n, at, policy.maxDiscountPct); return (
              <tr key={n}><td>{n}+</td><td>{q.timePct}%</td><td>{q.qtyPct}%</td><td>{q.combinedPct}%{q.floorApplied ? " (floor)" : ""}</td><td className="font-semibold">{fmtMoney(q.unitMinor)}</td></tr>
            ); })}</tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">Formula: 1 − (1 − time%)(1 − volume%), capped at {q0.capPct}% and never below the seller&apos;s floor{q0.floorMinor ? ` of ${fmtMoney(q0.floorMinor)}` : ""}. Buying more never raises the unit price.{q0.illustrative && " The seeded rule is illustrative, not a food policy."}</p>
          {!problem && (canBuy ? (
            <ActionForm action={addToCartAction} className="mt-4 flex items-end gap-2">
              <input type="hidden" name="batchId" value={b.id} />
              <Input name="quantity" label="Quantity" type="number" min={b.minOrder} max={available} defaultValue={String(qty || b.minOrder)} />
              <Submit>Add to cart</Submit>
            </ActionForm>
          ) : <p className="mt-4 text-sm">{actor ? "Switch to your personal buyer context or a restaurant to buy." : <><A href={`/login?next=/market/${b.id}`}>Sign in</A> to buy.</>}</p>)}
        </Card>
      </div>
    </div>
  );
}
