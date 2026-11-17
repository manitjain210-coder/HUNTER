"use client";

/* eslint-disable @next/next/no-img-element -- photos come from our authorised /api/files route at original quality */
import { useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useFormState } from "./form";
import { cn } from "@/lib/utils";

const ACCEPT = "image/png,image/jpeg,image/webp";

/** File picker with instant previews, so people can see exactly what they are about to publish. */
export function PhotoPicker({ name = "photos", max = 6, label = "Photos" }: { name?: string; max?: number; label?: string }) {
  const [previews, setPreviews] = useState<{ url: string; name: string; big: boolean }[]>([]);
  const err = useFormState()?.fieldErrors?.[name];
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);
  return (
    <div>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <label className={cn("flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line bg-cream/60 px-4 py-6 text-center transition hover:border-forest/40 hover:bg-forest-50/50", err && "border-danger/60")}>
        <ImagePlus aria-hidden className="size-6 text-forest" />
        <span className="text-sm font-medium">Choose photos</span>
        <span className="text-xs text-muted-foreground">PNG, JPEG or WebP · up to 5 MB each · {max} max. Clear, well-lit shots of the actual product work best.</span>
        <input type="file" name={name} accept={ACCEPT} multiple className="sr-only"
          onChange={(e) => {
            previews.forEach((p) => URL.revokeObjectURL(p.url));
            setPreviews([...(e.target.files ?? [])].slice(0, max).map((f) => ({ url: URL.createObjectURL(f), name: f.name, big: f.size > 5 * 1024 * 1024 })));
          }} />
      </label>
      {err && <p className="mt-1 text-xs font-medium text-danger">{err}</p>}
      {previews.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {previews.map((p, i) => (
            <li key={p.url} className="relative">
              <img src={p.url} alt={`Preview of ${p.name}`} className={cn("aspect-square w-full rounded-xl object-cover ring-1 ring-line", p.big && "opacity-50 ring-danger")} />
              {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-ink/75 px-1.5 py-0.5 text-[10px] font-medium text-white">Cover</span>}
              {p.big && <span className="absolute inset-x-1 bottom-1 rounded bg-danger px-1 text-center text-[10px] text-white">Over 5 MB</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Large photo shown in full (object-contain, never cropped) with thumbnails and a full-screen view. */
export function Gallery({ ids, alt }: { ids: string[]; alt: string }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  if (!ids.length) return null;
  const src = (id: string) => `/api/files/${id}`;
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)} className="group relative block w-full overflow-hidden rounded-2xl bg-[#f7f7f5] ring-1 ring-line" aria-label={`View ${alt} full size`}>
        <img src={src(ids[i])} alt={alt} className="aspect-[4/3] w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]" />
        <span className="absolute bottom-2 right-2 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-ink shadow-sm">View full size</span>
      </button>
      {ids.length > 1 && (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {ids.map((id, n) => (
            <li key={id}>
              <button type="button" onClick={() => setI(n)} aria-label={`Show photo ${n + 1}`} aria-pressed={n === i}
                className={cn("block size-16 overflow-hidden rounded-xl ring-2 transition", n === i ? "ring-forest" : "ring-transparent opacity-75 hover:opacity-100")}>
                <img src={src(id)} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(96vw,1100px)] border-0 bg-ink/95 p-2 sm:max-w-[min(96vw,1100px)]">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <img src={src(ids[i])} alt={alt} className="max-h-[82vh] w-full rounded-xl object-contain" />
          {ids.length > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              {ids.map((id, n) => (
                <button key={id} type="button" onClick={() => setI(n)} aria-label={`Photo ${n + 1}`} className={cn("size-2.5 rounded-full", n === i ? "bg-white" : "bg-white/40")} />
              ))}
            </div>
          )}
          <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5" aria-label="Close"><X className="size-4" /></button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
