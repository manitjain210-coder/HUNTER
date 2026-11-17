"use client";

/* eslint-disable @next/next/no-img-element -- local photographs in /public, sized by CSS */
import { usePathname } from "next/navigation";

/**
 * One fixed background photo behind the whole page.
 * Home: the dusk market street under a green tint (the home hero sits directly on it).
 * Every other page: the chilled aisle, softened under a light limestone wash so tables and forms stay readable.
 */
export function Backdrop() {
  const home = usePathname() === "/";
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {home ? (
        <>
          <img src="/hero/market.jpg" alt="" className="absolute inset-0 size-full object-cover" style={{ objectPosition: "center 40%" }} />
          <div className="absolute inset-0 bg-gradient-to-b from-leaf-900/55 via-leaf-900/75 to-leaf-900/90" />
        </>
      ) : (
        <>
          <img src="/photos/chilled-aisle.jpg" alt="" className="absolute inset-0 size-full scale-105 object-cover blur-[2px]" style={{ objectPosition: "center 35%" }} />
          <div className="absolute inset-0 bg-cream/80" />
        </>
      )}
    </div>
  );
}
