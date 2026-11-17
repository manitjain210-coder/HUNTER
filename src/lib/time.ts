// Controllable clock: set KHANA_BRIDGE_CLOCK_OFFSET_MIN to shift "now" for demos/tests.
export function now(): Date {
  const off = Number(process.env.KHANA_BRIDGE_CLOCK_OFFSET_MIN ?? 0);
  return new Date(Date.now() + off * 60_000);
}
export const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
export const DEFAULT_TZ = "Asia/Kolkata";

export function fmtDateTime(d: Date | string | null | undefined, tz = DEFAULT_TZ) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}
export function fmtDate(d: Date | string | null | undefined, tz = DEFAULT_TZ) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, dateStyle: "medium" }).format(new Date(d));
}
export function fmtMoney(minor: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(minor / 100);
}

/** Offset (ms) of tz from UTC at instant d. */
function tzOffsetMs(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - d.getTime();
}
/** Convert a local wall-clock "YYYY-MM-DD" + "HH:mm" in tz to a UTC Date. */
export function localToUtc(date: string, time: string, tz = DEFAULT_TZ): Date {
  const [y, mo, da] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, da, h, mi));
  const first = new Date(guess.getTime() - tzOffsetMs(guess, tz));
  return new Date(guess.getTime() - tzOffsetMs(first, tz));
}
/** Local YYYY-MM-DD for an instant in tz. */
export function localDate(d: Date, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
/** datetime-local input value ("YYYY-MM-DDTHH:mm") in tz → UTC Date. */
export function parseLocalInput(v: string, tz = DEFAULT_TZ): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(v ?? "");
  return m ? localToUtc(m[1], m[2], tz) : null;
}
export function toLocalInput(d: Date | null | undefined, tz = DEFAULT_TZ) {
  if (!d) return "";
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${localDate(d, tz)}T${t}`;
}
export function minutesLeft(deadline: Date | null | undefined, at = now()) {
  return deadline ? Math.round((new Date(deadline).getTime() - at.getTime()) / 60000) : null;
}
