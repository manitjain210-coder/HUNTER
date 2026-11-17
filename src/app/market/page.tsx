import Link from "next/link";
import { db } from "@/lib/db";
import { searchCatalogue } from "@/services/marketplace";
import { imagesFor } from "@/services/files";
import { fmtDate, fmtMoney } from "@/lib/time";
import { unitLabel } from "@/lib/domain";
import { Empty, Sticker } from "@/components/kit";
import { Cover } from "@/components/photos";
import { PhotoBand } from "@/components/photo-band";

export const metadata = { title: "Marketplace" };

export default async function Market({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; all?: string }> }) {
  const sp = await searchParams;
  const [rows, cats] = await Promise.all([
    searchCatalogue({ q: sp.q?.slice(0, 60), category: sp.category, includeUnavailable: sp.all === "1" }),
    db.product.findMany({ where: { active: true }, distinct: ["category"], select: { category: true } }),
  ]);
  const photos = await imagesFor("product", [...new Set(rows.map((r) => r.batch.productId))]);
  return (
    <div>
      <PhotoBand src="/photos/sale-window.jpg" position="center 45%" scrim="bottom" className="mb-6 flex min-h-[260px] items-end md:min-h-[300px]">
        <div className="max-w-2xl px-6 pb-7 pt-24 md:px-10">
          <h1 className="text-[2rem] leading-tight text-white md:text-[2.5rem]">Discounted groceries</h1>
          <p className="mt-2 text-white/85">Near-expiry stock from verified supermarkets. Each store publishes its discount rule, and the same batch and quantity costs the same for everyone.</p>
        </div>
      </PhotoBand>
      <form className="mb-6 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-white p-3" role="search">
        <div className="min-w-48 flex-1"><label htmlFor="q" className="mb-1 block text-sm font-medium">Search</label><input id="q" name="q" defaultValue={sp.q} className="input" placeholder="Milk, rice, bread…" /></div>
        <div><label htmlFor="category" className="mb-1 block text-sm font-medium">Category</label>
          <select id="category" name="category" defaultValue={sp.category ?? ""} className="input"><option value="">All categories</option>{cats.map((c) => <option key={c.category}>{c.category}</option>)}</select></div>
        <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" name="all" value="1" defaultChecked={sp.all === "1"} /> Show sold out and expired</label>
        <button className="btn btn-primary">Search</button>
      </form>
      {!rows.length ? <Empty title="No batches match">Try another search or category.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ batch: b, quote: q, available, problem }) => (
            <Link key={b.id} href={`/market/${b.id}`} className="spot group flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
              <div className="relative">
                <Cover id={photos.get(b.productId)?.[0]} alt={b.product.name} className="aspect-[4/3] w-full" />
                <Sticker pct={q.combinedPct} className="absolute right-3 top-3" />
                <span className="absolute bottom-3 left-3 rounded-lg bg-white/95 px-2 py-1 text-xs font-medium text-ink">{q.daysLeft <= 1 ? "Expires today or tomorrow" : `${q.daysLeft} days left`}</span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="font-display text-lg font-semibold leading-snug">{b.product.name}</div>
                <div className="text-sm text-muted-foreground">{b.tenant.name}</div>
                <div className="mt-3 flex items-baseline gap-2"><span className="font-display text-xl font-semibold">{fmtMoney(q.unitMinor)}</span>{q.combinedPct > 0 && <span className="text-sm text-muted-foreground line-through">{fmtMoney(q.originalMinor)}</span>}<span className="text-xs text-muted-foreground">per {unitLabel[b.product.unit]?.replace(/s$/, "")}</span></div>
                <div className="mt-1 text-xs text-muted-foreground">Use by {fmtDate(b.expiryDate)} · {available} available{b.minOrder > 1 ? ` · min ${b.minOrder}` : ""}</div>
                {problem && <div className="mt-1 text-xs font-medium text-danger">{problem}</div>}
                {q.illustrative && <div className="mt-auto pt-2 text-[11px] text-muted-foreground">Demo discount rule</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
