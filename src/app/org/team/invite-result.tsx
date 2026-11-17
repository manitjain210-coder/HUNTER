"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/lib/form-state";

export function InviteResult({ action, roles }: { action: (s: FormState, f: FormData) => Promise<FormState>; roles: string[][] }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [copied, setCopied] = useState(false);
  const link = state?.data?.link ? `${typeof window !== "undefined" ? window.location.origin : ""}${state.data.link}` : null;
  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="role" className="mb-1 block text-sm font-medium">Role</label>
          <select id="role" name="role" className="input">{roles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
        <button className="btn btn-primary" disabled={pending}>{pending ? "Creating…" : "Create single-use link"}</button>
      </div>
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {link && (
        <div role="status" className="rounded-xl border border-forest/20 bg-forest-50 p-3 text-sm">
          <p className="mb-2">{state?.message}</p>
          <div className="flex gap-2">
            <input readOnly value={link} className="input font-mono text-xs" aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}>{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      )}
    </form>
  );
}
