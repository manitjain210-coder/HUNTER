import { z } from "zod";
import { invalid } from "./domain";

export { z };

/** Parse with zod; throw AppError with per-field messages on failure. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const fe: Record<string, string> = {};
  for (const i of r.error.issues) {
    const k = i.path.join(".") || "_";
    fe[k] ??= i.message;
  }
  throw invalid(`Please fix: ${Object.keys(fe).join(", ")}.`, fe);
}

/** Optional text: a field the form did not render arrives as "" rather than failing validation. */
export const str = (max = 200) => z.preprocess((v) => v ?? "", z.string().trim().max(max));
export const reqStr = (max = 200, msg = "Required") => z.string().trim().min(1, msg).max(max);
export const posInt = (max = 1_000_000) => z.coerce.number().int("Whole numbers only").positive("Must be more than 0").max(max, `At most ${max}`);
export const optNum = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().optional());
export const bool = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());
export const strList = z.preprocess(
  (v) => (Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : []),
  z.array(z.string().trim().toLowerCase()).transform((a) => [...new Set(a.filter(Boolean))]),
);
