import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { invalid, AppError } from "./domain";
import { addMin, now } from "./time";

export const SESSION_DAYS = 7;

/** Normalise to E.164. Bare 10-digit numbers are treated as Indian (+91). Does NOT prove ownership. */
export function normalizePhone(raw: string): string {
  const s = (raw ?? "").replace(/[\s\-().]/g, "");
  let out: string | null = null;
  if (/^\+\d{8,15}$/.test(s)) out = s;
  else if (/^0?\d{10}$/.test(s)) out = "+91" + s.slice(-10);
  else if (/^91\d{10}$/.test(s)) out = "+" + s;
  if (!out) throw invalid("Enter a valid phone number.", { phone: "Use a 10-digit Indian number or +country format." });
  return out;
}

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export function checkPasswordStrength(p: string) {
  if (typeof p !== "string" || p.length < 10) throw invalid("Password too short.", { password: "Use at least 10 characters." });
  if (p.length > 200) throw invalid("Password too long.", { password: "Use at most 200 characters." });
}

// shortcut: in-memory limiter is per-process; use a shared store (Redis/DB) when running multiple instances.
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max = 8, windowMs = 10 * 60_000) {
  const t = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < t) return void hits.set(key, { n: 1, reset: t + windowMs });
  if (++h.n > max) throw new AppError("Too many attempts. Try again in a few minutes.", "FORBIDDEN");
}

export async function registerUser(input: { phone: string; name: string; password: string }) {
  const phone = normalizePhone(input.phone);
  const name = (input.name ?? "").trim();
  if (name.length < 2 || name.length > 80) throw invalid("Enter your name.", { name: "2–80 characters." });
  checkPasswordStrength(input.password);
  if (await db.user.findUnique({ where: { phone } })) throw invalid("An account with this phone already exists.", { phone: "Already registered — sign in instead." });
  // isPlatformAdmin is never settable here.
  return db.user.create({ data: { phone, name, passwordHash: await hashPassword(input.password) } });
}

export async function verifyLogin(phoneRaw: string, password: string) {
  const phone = normalizePhone(phoneRaw);
  rateLimit("login:" + phone);
  const user = await db.user.findUnique({ where: { phone } });
  // Compare against a dummy hash when user is missing to keep timing similar.
  const ok = await bcrypt.compare(password ?? "", user?.passwordHash ?? "$2b$12$C6UzMDM.H6dfI/f/IKcEeO8wD7zZq8XvG1hJ6x3o4u6ZbJq9c6Uba");
  if (!user || !ok || !user.active) throw invalid("Phone number or password is incorrect.");
  return user;
}

export async function createSession(userId: string) {
  const token = newToken();
  const membership = await db.membership.findFirst({ where: { userId, active: true }, orderBy: { createdAt: "asc" } });
  await db.session.create({
    data: { tokenHash: sha256(token), userId, activeMembershipId: membership?.id ?? null, expiresAt: addMin(now(), SESSION_DAYS * 24 * 60) },
  });
  return token;
}
