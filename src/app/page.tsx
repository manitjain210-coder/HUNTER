import Link from "next/link";
import { ArrowUpRight, Building2, HandHeart, Store, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { demoMode, getActor } from "@/lib/session";
import { fmtMoney, now } from "@/lib/time";
import { unitLabel } from "@/lib/domain";
import { searchCatalogue } from "@/services/marketplace";
import { imagesFor } from "@/services/files";
import { Cover } from "@/components/photos";
import { Sticker } from "@/components/kit";
import { CardPhoto, PhotoBand } from "@/components/photo-band";

const WINDOW_DAYS = 7;

export default async function Home() {
  const actor = await getActor();
  const at = now();
  const [rail, lots, tickets] = await Promise.all([
    searchCatalogue({}),
    db.surplusLot.count({ where: { stage: "READY", pickupDeadline: { gt: at } } }),
    db.needTicket.count({ where: { status: "OPEN" } }),
  ]);
  const soonest = rail.slice(0, 4);
  const photos = await imagesFor("product", soonest.map((r) => r.batch.productId));

  return (
    <div className="space-y-16">
      {/* Hero sits directly on the page-wide market photo (see <Backdrop/>) */}
      <section className="relative text-white">

        <div className="relative grid grid-cols-1 items-center gap-10 py-6 md:py-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <h1 className="max-w-xl text-[2.7rem] leading-[1.02] tracking-[-0.03em] text-white md:text-[3.8rem]">Good food has a deadline. We work to it.</h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/80">
              Supermarkets mark down stock before it expires. Restaurants hand safe surplus to verified kitchens and shelters, collected while it is still good to serve.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/market" className="btn !bg-turmeric !px-5 !text-turmeric-ink hover:!bg-[#ffc81f]">Shop marked-down groceries</Link>
              {actor
                ? <Link href="/dashboard" className="btn !border-white/30 !bg-white/10 !px-5 !text-white hover:!bg-white/20">Open your workspace</Link>
                : <Link href="/apply" className="btn !border-white/30 !bg-white/10 !px-5 !text-white hover:!bg-white/20">Register an organisation</Link>}
              {!actor && demoMode() && <Link href="/demo" className="btn !border-white/30 !bg-transparent !px-5 !text-white hover:!bg-white/10">Try the demo</Link>}
            </div>
            <p className="mt-8 max-w-lg text-sm leading-relaxed text-white/70">
              Right now: <strong className="text-white">{rail.length}</strong> grocery batches on sale, <strong className="text-white">{lots}</strong> surplus batches waiting for collection, <strong className="text-white">{tickets}</strong> open food requests{demoMode() ? " (demo data)" : ""}.
            </p>
          </div>

          {/* Expiring soonest: real batches, real photos, live prices */}
          <div className="rounded-[1.5rem] bg-cream p-3 text-ink shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]">
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <h2 className="text-base">Expiring soonest</h2>
              <Link href="/market" className="inline-flex items-center gap-1 text-sm font-medium text-forest hover:underline">See all<ArrowUpRight aria-hidden className="size-4" /></Link>
            </div>
            {!soonest.length ? <p className="px-2 pb-3 text-sm text-muted-foreground">Nothing is on sale right now.</p> : (
              <ul className="flex flex-col gap-2">
                {soonest.map(({ batch: b, quote: q, available }) => {
                  const hoursLeft = (b.expiryDate.getTime() - at.getTime()) / 3600000;
                  const frac = Math.max(0.03, Math.min(1, hoursLeft / (WINDOW_DAYS * 24)));
                  const tone = hoursLeft < 24 ? "bg-coral" : hoursLeft < 72 ? "bg-turmeric" : "bg-forest";
                  const left = hoursLeft < 24 ? `${Math.max(1, Math.round(hoursLeft))} h left` : `${Math.round(hoursLeft / 24)} days left`;
                  return (
                    <li key={b.id}>
                      <Link href={`/market/${b.id}`} className="spot relative flex gap-3 rounded-2xl border border-line bg-white p-2.5 pr-4">
                        <Cover id={photos.get(b.productId)?.[0]} alt={b.product.name} className="size-[4.5rem] shrink-0 rounded-xl" />
                        <div className="min-w-0 flex-1 self-center">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate font-medium">{b.product.name}</span>
                            <span className="shrink-0 font-display font-semibold tabular-nums">{fmtMoney(q.unitMinor)}</span>
                          </div>
                          <div className="mt-0.5 flex justify-between gap-3 text-xs text-muted-foreground">
                            <span className="truncate">{b.tenant.name} · {available} {unitLabel[b.product.unit]}</span>
                            <span className="shrink-0">{left}</span>
                          </div>
                          <div className="mt-2 h-1 overflow-hidden rounded-full bg-sand" aria-hidden><div className={`h-full rounded-full ${tone}`} style={{ width: `${frac * 100}%` }} /></div>
                        </div>
                        <Sticker pct={q.combinedPct} size="sm" className="absolute -left-2 -top-2" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="px-2 pb-1 pt-2.5 text-xs text-muted-foreground">Bars show time left across the next {WINDOW_DAYS} days.</p>
          </div>
        </div>
      </section>

      <PhotoBand src="/photos/packaging-waste.jpg" position="60% 40%" className="min-h-[340px]">
        <div className="max-w-md px-6 py-12 md:px-12 md:py-16">
          <h2 className="text-[1.9rem] leading-tight text-white md:text-[2.3rem]">This is where too much of it ends up.</h2>
          <p className="mt-4 text-[1.02rem] leading-relaxed text-white/80">Plates, packets and good food thrown out together after a single event. Khana Bridge works on the food before it gets here: sold while it is still good, or handed to a kitchen that can serve it today.</p>
        </div>
      </PhotoBand>

      <section aria-label="Who uses Khana Bridge" className="grid gap-5 md:grid-cols-2">
        <Path tone="turmeric" photo="/photos/produce-shelves.jpg" photoPos="center 55%" icon={<Store className="size-5" />} title="Supermarkets and shoppers" href="/market" cta="Browse the marketplace"
          points={["Each batch is listed with its real use-by date and a photo", "Discounts deepen as the date gets closer, within the store's own limits", "Same price for restaurants and the public; pay when you collect"]} />
        <Path tone="forest" photo="/photos/canned-food.jpg" photoPos="center 60%" icon={<HandHeart className="size-5" />} title="Restaurants and community kitchens" href="/how-it-works" cta="See how donations work"
          points={["Verified organisations post what they need, ahead of time", "Restaurants confirm what is actually ready, with allergens and deadlines", "Collection is arranged and both sides record what was handed over"]} />
      </section>

      <section className="grid gap-8 rounded-[1.75rem] bg-steel-50 p-7 md:grid-cols-3 md:p-10">
        <Fact icon={<Building2 className="size-5" />} title="Checked before anything moves">A person reviews every organisation before it can request or reserve food. Picking a category is not approval.</Fact>
        <Fact icon={<Truck className="size-5" />} title="Collected within the hour, where possible">That is a working target. It is never a reason to stretch a food deadline.</Fact>
        <Fact icon={<HandHeart className="size-5" />} title="Only what was received counts">Reports use the quantities people actually accepted at handover. No estimated meals or savings.</Fact>
      </section>
    </div>
  );
}

function Path({ icon, title, points, href, cta, tone, photo, photoPos }: { icon: React.ReactNode; title: string; points: string[]; href: string; cta: string; tone: "turmeric" | "forest"; photo: string; photoPos?: string }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[1.5rem] border border-line bg-white">
      <CardPhoto src={photo} position={photoPos} className="aspect-[16/9]" />
      <div className="relative flex flex-1 flex-col p-7 pt-0">
      <span className={`-mt-6 flex size-12 ring-4 ring-white items-center justify-center rounded-xl ${tone === "turmeric" ? "bg-turmeric text-turmeric-ink" : "bg-forest text-white"}`}>{icon}</span>
      <h2 className="mt-5 text-xl">{title}</h2>
      <ul className="mt-3 flex-1 space-y-2.5 text-[0.95rem] text-muted-foreground">
        {points.map((p) => <li key={p} className="flex gap-2.5"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-forest/50" />{p}</li>)}
      </ul>
      <Link href={href} className="mt-6 inline-flex items-center gap-1 self-start font-medium text-forest hover:underline">{cta}<ArrowUpRight aria-hidden className="size-4" /></Link>
      </div>
    </div>
  );
}

function Fact({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="flex size-9 items-center justify-center rounded-lg bg-white text-steel">{icon}</span>
      <h3 className="mt-3 text-base">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
