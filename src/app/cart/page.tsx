import { randomUUID } from "node:crypto";
import { requireActor } from "@/lib/session";
import { cartFor } from "@/services/marketplace";
import { fmtDate, fmtMoney } from "@/lib/time";
import { AppError } from "@/lib/domain";
import { A, Card, Empty, Forbidden, Notice, PageHeader } from "@/components/kit";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { checkoutAction, removeCartAction } from "@/app/actions/ops";
import { POLICY_DEFAULTS } from "@/lib/policy";
import { Cover } from "@/components/photos";
import { imagesFor } from "@/services/files";

export const metadata = { title: "Cart" };

export default async function Cart() {
  const a = await requireActor();
  let items;
  try { items = await cartFor(a); } catch (e) { if (e instanceof AppError) return <Forbidden message={e.message} />; throw e; }
  const photos = await imagesFor("product", items.map((i) => i.batch.productId));
  const total = items.filter((i) => !i.problem).reduce((s, i) => s + i.quote.unitMinor * i.quantity, 0);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Cart" subtitle={a.ctx ? `Buying as ${a.ctx.tenantName}` : "Buying as a personal buyer"} />
      {!items.length ? <Empty title="Your cart is empty"><A href="/market">Browse the marketplace</A></Empty> : (
        <Card>
          <ul className="divide-y divide-line">{items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="flex gap-3"><Cover id={photos.get(i.batch.productId)?.[0]} alt={i.batch.product.name} className="size-16 shrink-0 rounded-xl ring-1 ring-line" /><div>
                <A href={`/market/${i.batchId}`}>{i.batch.product.name}</A> <span className="text-xs text-muted-foreground">· {i.batch.tenant.name} · batch {i.batch.batchCode} · expires {fmtDate(i.batch.expiryDate)}</span>
                <div className="text-sm">{i.quantity} × {fmtMoney(i.quote.unitMinor)} <span className="text-xs text-muted-foreground">({i.quote.combinedPct}% off {fmtMoney(i.quote.originalMinor)})</span></div>
                {i.repriced && <div className="text-xs font-medium text-amber-ink">Price changed since you added this (was {fmtMoney(i.seenPriceMinor)}). Checking out will ask you to confirm.</div>}
                {i.problem && <div className="text-xs font-medium text-danger">{i.problem} — remove this line to continue.</div>}
              </div></div>
              <ActionButton action={removeCartAction} fields={{ itemId: i.id }} variant="ghost">Remove</ActionButton>
            </li>
          ))}</ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div className="text-lg font-semibold">Total {fmtMoney(total)}</div>
            <ActionForm action={checkoutAction}>
              <input type="hidden" name="idem" value={randomUUID()} />
              <Submit variant="accent">Reserve for collection</Submit>
            </ActionForm>
          </div>
          <Notice tone="blue">No payment is taken online. Your stock is held for {POLICY_DEFAULTS.groceryHoldMinutes / 60} hours for collection; pay the store at pickup (recorded offline by the seller). One order is created per store.</Notice>
        </Card>
      )}
    </div>
  );
}
