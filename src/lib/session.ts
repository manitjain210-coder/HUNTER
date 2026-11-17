import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { sha256, SESSION_DAYS } from "./auth";
import { loadActor, type Actor } from "./authz";
import { now } from "./time";

const COOKIE = "sp_session";

export async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86400,
  });
}

/** Current actor or null. Memoised per request. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!s || s.expiresAt < now()) return null;
  return loadActor(s.userId, s.activeMembershipId);
});

export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) redirect("/login");
  return a;
}

export async function currentSessionId() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return (await db.session.findUnique({ where: { tokenHash: sha256(token) } }))?.id ?? null;
}

export async function destroySession() {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  c.delete(COOKIE);
}

export const demoMode = () => process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
