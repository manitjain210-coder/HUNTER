import "server-only";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { AppError } from "@/lib/domain";
import type { FormState } from "@/lib/form-state";
import { getActor } from "@/lib/session";
import type { Actor } from "@/lib/authz";

/** Run a mutation; map domain errors to form state; refresh the current route on success. */
export async function run(fn: (actor: Actor) => Promise<FormState | string | void>, okMessage = "Saved."): Promise<FormState> {
  try {
    const actor = await getActor();
    if (!actor) return { error: "Your session has ended. Please sign in again." };
    const r = await fn(actor);
    refresh();
    if (typeof r === "string") return { ok: true, message: r };
    return r ?? { ok: true, message: okMessage };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) return { error: e.message, fieldErrors: e.fieldErrors };
    console.error(e);
    return { error: "Something went wrong and nothing was saved. Please try again." };
  }
}

export const s = (f: FormData, k: string) => String(f.get(k) ?? "");
export const n = (f: FormData, k: string) => Number(f.get(k) ?? NaN);
