/* eslint-disable @next/next/no-img-element -- local photograph in /public */
import type { ReactNode } from "react";

/** Sign-in / register frame: a photo panel beside the form on wide screens, the form alone on phones. */
export function AuthSplit({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[1.75rem] border border-line bg-white lg:grid-cols-2">
      <div className="relative hidden min-h-[560px] lg:block">
        <img src="/photos/produce-shelves.jpg" alt="" aria-hidden className="absolute inset-0 size-full object-cover" style={{ objectPosition: "center 45%" }} />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-leaf-900/90 via-leaf-900/20 to-transparent" />
        <p className="absolute inset-x-8 bottom-8 font-display text-2xl leading-snug text-white">Every shelf has a date on it. We help it get eaten before then.</p>
      </div>
      <div className="flex items-center justify-center px-6 py-10 md:px-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
