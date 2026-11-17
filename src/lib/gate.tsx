import "server-only";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getActor } from "./session";
import { AppError } from "./domain";
import type { Actor, Ctx } from "./authz";
import { Forbidden } from "@/components/kit";

type Gate = { actor: Actor; ctx: Ctx } | { deny: ReactElement };

/** Page-level guard. Server actions/services re-check everything; this only decides what to render. */
export async function gate(kinds: string[], roles?: string[]): Promise<Gate> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const c = actor.ctx;
  if (!c || !kinds.includes(c.tenantKind)) return { deny: <Forbidden message={`This page is for ${kinds.map((k) => k.toLowerCase()).join(" / ")} accounts. Switch context in the top bar.`} /> };
  // Drivers only see assigned collections (/driver) unless a page explicitly allows them.
  if (c.role === "DRIVER" && !roles?.includes("DRIVER")) return { deny: <Forbidden message="Drivers can only see their assigned collections under 'My assigned jobs'." /> };
  if (roles && !roles.includes(c.role)) return { deny: <Forbidden message="Your role in this organisation cannot open this page." /> };
  return { actor, ctx: c };
}

export async function adminGate(): Promise<{ actor: Actor } | { deny: ReactElement }> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!actor.isAdmin) return { deny: <Forbidden message="Platform admins only." /> };
  if (actor.ctx) return { deny: <Forbidden message="Switch to the 'Platform admin' context in the top bar to use admin tools." /> };
  return { actor };
}

/** Convert service errors thrown while loading a page into 404/redirect/forbidden UI. */
export function pageError(e: unknown): ReactElement {
  if (e instanceof AppError) {
    if (e.code === "NOT_FOUND") notFound();
    if (e.code === "UNAUTHENTICATED") redirect("/login");
    return <Forbidden message={e.message} />;
  }
  throw e;
}
