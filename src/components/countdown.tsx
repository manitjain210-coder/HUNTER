"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const HORIZON_MIN = 240;

/**
 * Time-left meter for a server deadline. The bar drains across `from`→`to` when a window is known,
 * otherwise across a fixed 4-hour horizon. serverNow corrects for client clock drift.
 */
export function Countdown({ to, from, serverNow, label, compact = false }: { to: string | null; from?: string | null; serverNow: string; label: string; compact?: boolean }) {
  const [skew] = useState(() => new Date(serverNow).getTime() - Date.now());
  const [t, setT] = useState(() => Date.now() + skew);
  useEffect(() => {
    const i = setInterval(() => setT(Date.now() + skew), 15000);
    return () => clearInterval(i);
  }, [skew]);
  if (!to) return null;
  const end = new Date(to).getTime();
  const mins = Math.round((end - t) / 60000);
  const span = from ? Math.max(1, (end - new Date(from).getTime()) / 60000) : HORIZON_MIN;
  const frac = Math.max(0, Math.min(1, mins / span));
  const tone = mins < 0 ? "passed" : mins < 20 ? "critical" : mins < 60 ? "tight" : "ok";
  const bar = { ok: "bg-forest", tight: "bg-[#d99a00]", critical: "bg-coral", passed: "bg-line" }[tone];
  const text = { ok: "text-forest", tight: "text-amber-ink", critical: "text-coral", passed: "text-muted-foreground" }[tone];
  const txt = mins < 0 ? "Passed" : mins >= 120 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  return (
    <div className={cn("rounded-2xl border border-line/80 bg-white", compact ? "min-w-36 px-3 py-2" : "min-w-44 px-4 py-3 shadow-[var(--shadow-float)]")}
      role="timer" aria-label={`${label}: ${mins < 0 ? "deadline passed" : `${txt} left`}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn("font-display text-base font-semibold tabular-nums", text)}>{txt}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand" aria-hidden>
        <div className={cn("h-full rounded-full transition-[width] duration-700", bar, tone === "critical" && "animate-pulse")} style={{ width: `${Math.max(frac, mins < 0 ? 0 : 0.03) * 100}%` }} />
      </div>
    </div>
  );
}
