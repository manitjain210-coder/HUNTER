import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { getActor, demoMode } from "@/lib/session";
import { roleLabel } from "@/lib/domain";
import { NAV } from "./nav-config";
import { AppChrome, PublicNav } from "./shell-client";
import { Logo } from "./logo";

export async function AppShell({ children }: { children: ReactNode }) {
  const actor = await getActor();
  if (!actor) return <PublicShell>{children}</PublicShell>;
  const c = actor.ctx;
  const nav = c ? (c.role === "DRIVER" ? NAV.DRIVER : NAV[c.tenantKind]) : actor.isAdmin ? NAV.ADMIN : NAV.PERSONAL;
  const [memberships, unread] = await Promise.all([
    db.membership.findMany({ where: { userId: actor.userId, active: true }, include: { tenant: true }, orderBy: { createdAt: "asc" } }),
    db.notification.count({ where: { userId: actor.userId, readAt: null } }),
  ]);
  const contexts = [
    { id: "", name: actor.isAdmin ? "Platform admin" : "Personal buyer", detail: actor.isAdmin ? "Admin tools" : "Shop as yourself", kind: actor.isAdmin ? "ADMIN" : "PERSONAL" },
    ...memberships.map((m) => ({ id: m.id, name: m.tenant.name, detail: `${roleLabel[m.role] ?? m.role} · ${m.tenant.verificationStatus.toLowerCase().replace(/_/g, " ")}`, kind: m.tenant.kind })),
  ];
  return (
    <AppChrome
      nav={nav}
      contexts={contexts}
      currentContext={c?.membershipId ?? ""}
      user={{ name: actor.name, phone: actor.phone }}
      unread={unread}
      status={c ? c.verificationStatus : null}
      demo={demoMode()}
    >
      {children}
    </AppChrome>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:p-2">Skip to content</a>
      <PublicNav demo={demoMode()} />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-16 pt-28">{children}</main>
      <footer className="mx-auto mb-6 max-w-6xl px-4">
        <div className="float flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4 text-xs text-muted-foreground">
          <Logo tagline />
          <span>Local build. No SMS, email, payment or logistics provider is connected.</span>
          <Link href="/how-it-works" className="underline-offset-2 hover:underline">How it works</Link>
        </div>
      </footer>
    </div>
  );
}
