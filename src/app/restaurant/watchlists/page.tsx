import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { fmtDate, now } from "@/lib/time";
import { distanceKm } from "@/lib/geo";
import { searchCatalogue } from "@/services/marketplace";
import { ActionButton, ActionForm, Input, Select, Submit } from "@/components/form";
import { A, Card, Empty, PageHeader } from "@/components/kit";
import { watchlistAction } from "@/app/actions/ops";

export const metadata = { title: "Ingredient watchlists" };

export default async function Watchlists() {
  const g = await gate(["RESTAURANT"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  const [lists, me] = await Promise.all([db.ingredientWatchlist.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" } }), db.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } })]);
  const at = now();
  const results = await Promise.all(lists.map(async (w) => {
    const hits = (await searchCatalogue({ q: w.query, category: w.category ?? undefined })).filter((r) => {
      const daysLeft = (r.batch.expiryDate.getTime() - at.getTime()) / 86400000;
      const d = distanceKm(me, r.batch.tenant);
      return daysLeft >= w.minShelfDays && (!w.requiredBy || r.batch.expiryDate >= w.requiredBy) && (w.radiusKm == null || d == null || d <= w.radiusKm);
    });
    return { w, hits };
  }));
  return (
    <div className="space-y-5">
      <PageHeader title="Ingredient watchlists" subtitle="Saved supermarket searches with your shelf-life and distance needs. Matches are computed when you open this page (no push alerts)." />
      {ctx.role !== "VIEWER" && (
        <Card title="Add a watch">
          <ActionForm action={watchlistAction} className="grid gap-3 sm:grid-cols-4 sm:items-end" resetOnSuccess>
            <Input name="query" label="Item" placeholder="tomato" required />
            <Input name="category" label="Category (optional)" />
            <Input name="quantity" label="Quantity" type="number" />
            <Select name="unit" label="Unit" options={[["", "—"], ["KG", "kg"], ["LITRE", "litres"], ["ITEM", "items"], ["PACK", "packs"]]} />
            <Input name="requiredBy" label="Required by" type="date" />
            <Input name="minShelfDays" label="Min shelf life (days)" type="number" defaultValue="1" />
            <Input name="radiusKm" label="Collection radius (km)" type="number" />
            <Submit>Save watch</Submit>
          </ActionForm>
        </Card>
      )}
      {!results.length ? <Empty title="No watchlists yet" /> : results.map(({ w, hits }) => (
        <Card key={w.id} title={`“${w.query}”${w.quantity ? ` · ${w.quantity} ${w.unit?.toLowerCase() ?? ""}` : ""}`} action={ctx.role !== "VIEWER" ? <ActionButton action={watchlistAction} fields={{ op: "delete", id: w.id }} variant="ghost">Remove</ActionButton> : undefined}>
          {!hits.length ? <p className="text-sm text-muted-foreground">No matching batches right now.</p> : (
            <ul className="divide-y divide-line text-sm">{hits.map((h) => (
              <li key={h.batch.id} className="flex flex-wrap justify-between gap-2 py-2"><A href={`/market/${h.batch.id}`}>{h.batch.product.name} · {h.batch.tenant.name}</A><span>{h.available} available · expires {fmtDate(h.batch.expiryDate)} · ₹{(h.quote.unitMinor / 100).toFixed(2)}</span></li>
            ))}</ul>
          )}
        </Card>
      ))}
    </div>
  );
}
