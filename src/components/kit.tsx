import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { unitLabel } from "@/lib/domain";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        <h1 className="text-[1.75rem] leading-tight md:text-[2.1rem]">{title}</h1>
        {subtitle && <div className="mt-1.5 text-[0.95rem] text-muted-foreground">{subtitle}</div>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/** A floating surface. Use `quiet` for nested or secondary panels. */
export function Card({ title, children, action, className = "", quiet = false }: { title?: ReactNode; children: ReactNode; action?: ReactNode; className?: string; quiet?: boolean }) {
  return (
    <section className={cn("rounded-[1.25rem] border p-5 md:p-6", quiet ? "border-line bg-white/55" : "border-line bg-white shadow-[var(--shadow-float)]", className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const TONE: Record<string, string> = {
  green: "bg-forest-50 text-forest [--dot:var(--color-forest)]",
  coral: "bg-coral-50 text-coral [--dot:var(--color-coral)]",
  amber: "bg-amber-50 text-amber-ink [--dot:#d99a00]",
  gray: "bg-sand text-muted-foreground [--dot:#9aa39d]",
  red: "bg-red-50 text-danger [--dot:var(--color-danger)]",
  blue: "bg-sky-50 text-sky-800 [--dot:#2f7fb8]",
};
const STATUS_TONE: Record<string, string> = {
  APPROVED: "green", OPEN: "green", READY: "green", ACCEPTED: "green", COMPLETED: "green", DELIVERED: "green", COLLECTED: "green", ADMIN_CONFIRMED: "green", RESOLVED: "green",
  FILLED: "blue", RESERVED: "blue", ASSIGNED: "blue", IN_TRANSIT: "blue", AT_PICKUP: "blue", UNDER_REVIEW: "blue", PROPOSED: "blue",
  SUBMITTED: "amber", DRAFT: "gray", EXPECTED: "amber", PENDING: "amber", MANUAL_REPORTED: "amber", AWAITING_FUNDING: "amber", PLANNING: "amber", CHANGES_REQUESTED: "amber", URGENT_PENDING: "amber", PARTIAL: "amber", PARTIALLY_COMPLETED: "amber",
  REJECTED: "red", SUSPENDED: "red", FAILED: "red", CANCELLED: "gray", EXPIRED: "gray", WITHDRAWN: "gray", RELEASED: "gray", DECLINED: "gray", CLOSED: "gray", RECALLED: "red", URGENT: "coral",
  DEMO_SIMULATED: "coral", PAUSED: "gray",
};
export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-2 pr-2.5 text-xs font-medium", TONE[tone] ?? TONE.gray)}>
      <span aria-hidden className="size-1.5 rounded-full bg-[var(--dot)]" />
      {children}
    </span>
  );
}
export function Status({ s }: { s: string }) {
  const t = s.replace(/_/g, " ").toLowerCase();
  return <Badge tone={STATUS_TONE[s] ?? "gray"}>{t[0].toUpperCase() + t.slice(1)}</Badge>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-cream/70 px-6 py-8 text-center">
      <svg aria-hidden width="56" height="40" viewBox="0 0 56 40" className="mb-3 text-forest/45">
        <ellipse cx="28" cy="30" rx="22" ry="6" fill="currentColor" opacity=".18" />
        <path d="M10 26c2-9 9-14 18-14s16 5 18 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M28 6v6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <p className="font-display font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 border-b border-line/60 pb-2">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="font-medium break-words">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-[1.65rem] font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Qty({ n, unit }: { n: number; unit: string }) {
  return <span className="tabular-nums">{n} <span className="text-muted-foreground">{unitLabel[unit] ?? unit.toLowerCase()}</span></span>;
}

const NOTICE = {
  amber: { cls: "border-amber-200/80 bg-amber-50/90 text-amber-ink", Icon: AlertTriangle },
  green: { cls: "border-forest/15 bg-forest-50 text-forest", Icon: CheckCircle2 },
  red: { cls: "border-red-200 bg-red-50 text-danger", Icon: OctagonAlert },
  blue: { cls: "border-sky-200/80 bg-sky-50/90 text-sky-900", Icon: Info },
};
export function Notice({ children, tone = "amber" }: { children: ReactNode; tone?: keyof typeof NOTICE }) {
  const { cls, Icon } = NOTICE[tone];
  return (
    <div role="note" className={cn("flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm", cls)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function A({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return <Link href={href} className={cn("font-medium text-forest underline decoration-forest/25 underline-offset-[3px] hover:decoration-forest", className)}>{children}</Link>;
}

export function Timeline({ events }: { events: { at: string; label: ReactNode; detail?: ReactNode }[] }) {
  if (!events.length) return <p className="text-sm text-muted-foreground">Nothing has happened here yet.</p>;
  return (
    <ol className="relative ml-1.5 border-l-2 border-forest-50">
      {events.map((e, i) => (
        <li key={i} className="relative mb-4 ml-5 last:mb-0">
          <span aria-hidden className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-white bg-forest/70" />
          <div className="text-sm font-medium">{e.label}</div>
          <div className="text-xs text-muted-foreground">{e.at}{e.detail ? <> · {e.detail}</> : null}</div>
        </li>
      ))}
    </ol>
  );
}

export function Forbidden({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <Card className="text-center">
        <h1 className="text-xl">Not available in this context</h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
        <p className="mt-4 text-sm">Use the organisation switcher at the top of the sidebar, or open <A href="/account">your account</A>.</p>
      </Card>
    </div>
  );
}

/** Yellow markdown sticker, like the "reduced" labels shops put on near-expiry stock. */
export function Sticker({ pct, size = "md", className = "" }: { pct: number; size?: "sm" | "md" | "lg"; className?: string }) {
  if (pct <= 0) return null;
  const s = { sm: "text-sm", md: "text-lg", lg: "round text-2xl" }[size];
  return (
    <span className={cn("sticker", s, className)} aria-label={`${pct}% off`}>
      {pct}%<small>off</small>
    </span>
  );
}
