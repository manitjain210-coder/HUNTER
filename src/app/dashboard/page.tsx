import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";

/** Route each context to its home. */
export default async function Dashboard() {
  const a = await requireActor();
  const c = a.ctx;
  if (!c) redirect(a.isAdmin ? "/admin" : "/market");
  if (c.role === "DRIVER") redirect("/driver");
  redirect({ RECIPIENT: "/org", RESTAURANT: "/restaurant", SUPERMARKET: "/supermarket", LOGISTICS: "/logistics" }[c.tenantKind] ?? "/");
}
