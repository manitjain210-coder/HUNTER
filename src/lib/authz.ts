import { db } from "./db";
import { forbidden, AppError } from "./domain";

export type Ctx = {
  membershipId: string;
  tenantId: string;
  tenantKind: string;
  tenantName: string;
  role: string;
  verificationStatus: string;
  timezone: string;
};
export type Actor = { userId: string; name: string; phone: string; isAdmin: boolean; ctx: Ctx | null };

/** Load an actor for a user + chosen membership, re-validating the membership from the DB (never trusted from the client). */
export async function loadActor(userId: string, membershipId: string | null): Promise<Actor | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) return null;
  let ctx: Ctx | null = null;
  if (membershipId) {
    const m = await db.membership.findFirst({ where: { id: membershipId, userId, active: true }, include: { tenant: true } });
    if (m && !m.tenant.archived)
      ctx = {
        membershipId: m.id, tenantId: m.tenantId, tenantKind: m.tenant.kind, tenantName: m.tenant.name, role: m.role,
        verificationStatus: m.tenant.verificationStatus, timezone: m.tenant.timezone,
      };
  }
  return { userId: user.id, name: user.name, phone: user.phone, isAdmin: user.isPlatformAdmin, ctx };
}

export function requireAdmin(a: Actor | null): Actor {
  if (!a) throw new AppError("Please sign in.", "UNAUTHENTICATED");
  if (!a.isAdmin) throw forbidden();
  return a;
}

/** Require the active context to be a tenant of one of `kinds` with one of `roles`. Returns the context. */
export function requireCtx(a: Actor | null, kinds: string[], roles?: string[]): Ctx {
  if (!a) throw new AppError("Please sign in.", "UNAUTHENTICATED");
  const c = a.ctx;
  if (!c || !kinds.includes(c.tenantKind)) throw forbidden("Switch to an authorised organisation to do this.");
  if (roles && !roles.includes(c.role)) throw forbidden(`Your role (${c.role.toLowerCase()}) cannot do this.`);
  return c;
}

/** Recipient org that may publish tickets / accept donations right now. */
export function requireActiveRecipient(a: Actor | null): Ctx {
  const c = requireCtx(a, ["RECIPIENT"], ["OWNER", "COORDINATOR"]);
  if (c.verificationStatus !== "APPROVED") throw forbidden("Your organisation must be approved (and not suspended) before it can publish tickets or accept donations.");
  return c;
}
export const SUPPLIER_WRITE = ["OWNER", "MANAGER", "OPERATOR"];
export const SUPPLIER_MANAGE = ["OWNER", "MANAGER"];
export function requireActiveSupplier(a: Actor | null, kind: "RESTAURANT" | "SUPERMARKET", roles = SUPPLIER_WRITE): Ctx {
  const c = requireCtx(a, [kind], roles);
  if (c.verificationStatus !== "APPROVED") throw forbidden("Your business must be approved before listing stock or surplus.");
  return c;
}
