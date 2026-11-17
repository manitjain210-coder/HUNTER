"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { AppError, invalid } from "@/lib/domain";
import { createSession, registerUser, verifyLogin, rateLimit, checkPasswordStrength, hashPassword } from "@/lib/auth";
import { setSessionCookie, destroySession, demoMode, currentSessionId } from "@/lib/session";
import { switchContext } from "@/services/orgs";
import type { FormState } from "@/lib/form-state";
import { run, s } from "./run";

async function ip() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
const safeNext = (v: string) => (v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard");

export async function loginAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    rateLimit("login-ip:" + (await ip()), 30);
    const user = await verifyLogin(s(f, "phone"), s(f, "password"));
    await setSessionCookie(await createSession(user.id));
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) return { error: e.message, fieldErrors: e.fieldErrors };
    throw e;
  }
  redirect(safeNext(s(f, "next")));
}

export async function registerAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    rateLimit("register-ip:" + (await ip()), 10);
    if (s(f, "password") !== s(f, "password2")) throw invalid("Passwords do not match.", { password2: "Must match" });
    const user = await registerUser({ phone: s(f, "phone"), name: s(f, "name"), password: s(f, "password") });
    await setSessionCookie(await createSession(user.id));
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) return { error: e.message, fieldErrors: e.fieldErrors };
    throw e;
  }
  redirect(safeNext(s(f, "next")));
}

/** Demo-only: sign in as a seeded demo account. Disabled unless DEMO_MODE=true outside production; only isDemo users. */
export async function demoLoginAction(_: FormState, f: FormData): Promise<FormState> {
  if (!demoMode()) return { error: "Demo sign-in is disabled." };
  const user = await db.user.findFirst({ where: { id: s(f, "userId"), isDemo: true, active: true } });
  if (!user) return { error: "Unknown demo account." };
  await setSessionCookie(await createSession(user.id));
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function switchContextAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await run(async (a) => {
    const sid = await currentSessionId();
    if (!sid) throw invalid("No session.");
    await switchContext(a.userId, sid, s(f, "membershipId") || null);
  });
  if (r?.error) return r;
  redirect("/dashboard");
}

export async function changePasswordAction(_: FormState, f: FormData) {
  return run(async (a) => {
    const u = await db.user.findUniqueOrThrow({ where: { id: a.userId } });
    if (!(await bcrypt.compare(s(f, "current"), u.passwordHash))) throw invalid("Current password is incorrect.", { current: "Incorrect" });
    checkPasswordStrength(s(f, "password"));
    await db.user.update({ where: { id: a.userId }, data: { passwordHash: await hashPassword(s(f, "password")) } });
    const sid = await currentSessionId();
    await db.session.deleteMany({ where: { userId: a.userId, id: { not: sid ?? "" } } }); // sign out other devices
  }, "Password changed. Other sessions were signed out.");
}
