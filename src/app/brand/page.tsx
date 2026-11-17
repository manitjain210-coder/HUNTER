import type { Metadata } from "next";
import { Lockup, Mark, TAGLINE } from "@/components/logo";

export const metadata: Metadata = { title: "Logo options" };

const grounds = [
  { name: "Limestone", className: "bg-cream", light: false },
  { name: "White", className: "bg-white", light: false },
  { name: "Leaf green", className: "bg-leaf-900", light: true },
];

/** Logo review sheet: the two lockups on each background the site uses, plus the mark at app-icon sizes. */
export default function Brand() {
  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <h1 className="text-[2rem] leading-tight">Khana Bridge logo options</h1>
        <p className="mt-2 text-muted-foreground">A suspension bridge whose cable is a full bowl: food carried across, from people who have extra to people who need it. Pick option A, option B, or both (B for the footer and print, A for tight spaces).</p>
      </div>

      {[{ id: "A", title: "Option A: name only", tagline: false }, { id: "B", title: `Option B: with “${TAGLINE}”`, tagline: true }].map((o) => (
        <section key={o.id} aria-labelledby={`opt-${o.id}`} className="d-card float rounded-[1.75rem]">
          <div className="d-card-body gap-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-turmeric font-display font-semibold text-turmeric-ink">{o.id}</span>
              <h2 id={`opt-${o.id}`} className="d-card-title text-xl">{o.title}</h2>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              {grounds.map((g) => (
                <figure key={g.name} className={`flex min-h-44 flex-col justify-between rounded-2xl border border-line p-6 ${g.className}`}>
                  <div className="flex flex-1 items-center justify-center"><Lockup light={g.light} tagline={o.tagline} scale={1.15} /></div>
                  <figcaption className={`mt-4 text-xs ${g.light ? "text-white/60" : "text-muted-foreground"}`}>On {g.name.toLowerCase()}</figcaption>
                </figure>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-dashed border-line p-5">
              <span className="text-sm text-muted-foreground">Header size</span>
              <Lockup tagline={o.tagline} />
              <span className="text-sm text-muted-foreground">Large</span>
              <Lockup tagline={o.tagline} scale={2.2} />
            </div>
          </div>
        </section>
      ))}

      <section aria-labelledby="mark" className="d-card float rounded-[1.75rem]">
        <div className="d-card-body">
          <h2 id="mark" className="d-card-title text-xl">The mark alone</h2>
          <p className="text-sm text-muted-foreground">Used for the browser tab icon, the phone header and app icons. Shared by both options.</p>
          <div className="mt-3 flex flex-wrap items-end gap-6">
            {[16, 24, 32, 48, 96].map((s) => (
              <div key={s} className="flex flex-col items-center gap-2"><Mark size={s} /><span className="text-xs text-muted-foreground">{s}px</span></div>
            ))}
            <div className="flex flex-col items-center gap-2"><span className="flex size-24 items-center justify-center rounded-[1.4rem] bg-leaf-900"><Mark size={68} light /></span><span className="text-xs text-muted-foreground">App icon</span></div>
            <div className="flex flex-col items-center gap-2"><span className="flex size-24 items-center justify-center rounded-[1.4rem] bg-cream ring-1 ring-line"><Mark size={68} /></span><span className="text-xs text-muted-foreground">Tab icon</span></div>
          </div>
        </div>
      </section>
    </div>
  );
}
