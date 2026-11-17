import Link from "next/link";
import { cn } from "@/lib/utils";

export const TAGLINE = "Everyone deserves to eat";

/**
 * The Khana Bridge mark: a suspension bridge whose sagging cable is a full bowl, with steam rising off it.
 * Two towers, a turmeric bowl slung between them, hangers down to the road deck.
 */
export function Mark({ size = 32, light = false, className }: { size?: number; light?: boolean; className?: string }) {
  const ink = light ? "#ffffff" : "#17553a";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className={cn("shrink-0", className)}>
      <path d="M20 9.5c-1.5-1.7 1.5-3.2 0-5.3M28 9.5c-1.5-1.7 1.5-3.2 0-5.3" stroke={ink} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.7" />
      <path d="M12 12Q24 44 36 12Z" fill="#f2b705" />
      <path d="M18 24V34M30 24V34M12 11L4.5 33M36 11L43.5 33" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 10v30M36 10v30" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M4 34h40" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

/** Mark + wordmark, optionally with the tagline underneath. `small` shows the mark alone. */
export function Lockup({ light = false, tagline = false, small = false, scale = 1 }: { light?: boolean; tagline?: boolean; small?: boolean; scale?: number }) {
  return (
    <span className={cn("flex items-center", light ? "text-white" : "text-forest")} style={{ gap: `${0.5 * scale}rem` }}>
      <Mark size={(small ? 30 : tagline ? 40 : 34) * scale} light={light} />
      {!small && (
        <span className="flex flex-col whitespace-nowrap leading-none">
          <span className="font-display font-semibold tracking-[-0.02em]" style={{ fontSize: `${1.2 * scale}rem` }}>Khana Bridge</span>
          {tagline && <span className={cn("font-medium", light ? "text-white/75" : "text-forest/70")} style={{ fontSize: `${0.72 * scale}rem`, marginTop: `${0.3 * scale}rem` }}>{TAGLINE}</span>}
        </span>
      )}
    </span>
  );
}

export function Logo({ small = false, light = false, tagline = false }: { small?: boolean; light?: boolean; tagline?: boolean }) {
  return (
    <Link href="/" aria-label="Khana Bridge home" className="rounded-lg">
      <Lockup small={small} light={light} tagline={tagline} />
    </Link>
  );
}
