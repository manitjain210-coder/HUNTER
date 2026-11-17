export type FormState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; message?: string; data?: Record<string, unknown> } | null;

/** FormData → plain object. Repeated keys become arrays. */
export function formToObj(f: FormData): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of f.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (k in o) o[k] = ([] as unknown[]).concat(o[k], v);
    else o[k] = v;
  }
  return o;
}
