/* eslint-disable @next/next/no-img-element -- local photographs in /public, sized by CSS */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A real photograph behind a leaf-green scrim, with white text on top. Decorative: alt is empty. */
export function PhotoBand({ src, position = "center", children, className = "", scrim = "left" }: {
  src: string; position?: string; children: ReactNode; className?: string; scrim?: "left" | "full" | "bottom";
}) {
  return (
    <section className={cn("relative isolate overflow-hidden rounded-[1.75rem] bg-leaf-900 text-white", className)}>
      <img src={src} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 -z-10 size-full object-cover" style={{ objectPosition: position }} />
      <div aria-hidden className={cn("absolute inset-0 -z-10", scrim === "left" ? "bg-gradient-to-r from-leaf-900/95 via-leaf-900/75 to-leaf-900/20" : scrim === "bottom" ? "bg-gradient-to-t from-leaf-900/95 via-leaf-900/45 to-transparent" : "bg-leaf-900/70")} />
      {children}
    </section>
  );
}

/** A photo inside a card, cropped to a fixed shape. */
export function CardPhoto({ src, position = "center", className = "" }: { src: string; position?: string; className?: string }) {
  return <img src={src} alt="" aria-hidden loading="lazy" decoding="async" className={cn("w-full object-cover", className)} style={{ objectPosition: position }} />;
}
