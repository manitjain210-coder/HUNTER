"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { OctagonAlert } from "lucide-react";
import type { FormState } from "@/lib/form-state";

const Ctx = createContext<FormState>(null);
const Pending = createContext(false);

/**
 * Form bound to a server action with inline field errors, a status banner and pending state.
 * Submits via onSubmit (not the `action` prop) so React does not reset typed values after a failed validation.
 */
export function ActionForm({
  action, children, className = "space-y-4", resetOnSuccess = false,
}: { action: (s: FormState, f: FormData) => Promise<FormState>; children: ReactNode; className?: string; resetOnSuccess?: boolean }) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    // Success is confirmed with a toast (it survives the route refresh that may unmount this form); errors stay inline.
    if (state?.ok && state.message) toast.success(state.message, { duration: state.message.length > 90 ? 9000 : 4000 });
    if (state?.error) banner.current?.focus();
  }, [state, resetOnSuccess]);
  return (
    <Ctx value={state}>
     <Pending value={pending}>
      <form
        ref={ref}
        // Kept for progressive enhancement (POST before hydration); after hydration onSubmit takes over.
        action={formAction}
        className={className}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => formAction(fd));
        }}
      >
        {state?.error && (
          <div ref={banner} tabIndex={-1} role="alert" className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
            <OctagonAlert aria-hidden className="mt-0.5 size-4 shrink-0" />{state.error}
          </div>
        )}
        {children}
      </form>
     </Pending>
    </Ctx>
  );
}

export const useFormState = () => useContext(Ctx);

type FieldProps = { name: string; label: string; hint?: ReactNode; required?: boolean; children?: ReactNode; className?: string };
export function Field({ name, label, hint, required, children, className = "" }: FieldProps) {
  const err = useFormState()?.fieldErrors?.[name];
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-1 block text-sm font-medium">{label}{required && <span className="text-coral" aria-hidden> *</span>}</label>
      {children}
      {hint && !err && <p id={`${name}-hint`} className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {err && <p id={`${name}-err`} className="mt-1 text-xs font-medium text-danger">{err}</p>}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { name: string; label: string; hint?: ReactNode; wrap?: string };
export function Input({ name, label, hint, wrap, required, ...rest }: InputProps) {
  const err = useFormState()?.fieldErrors?.[name];
  return (
    <Field name={name} label={label} hint={hint} required={required} className={wrap}>
      <input id={name} name={name} className="input" aria-invalid={!!err} aria-describedby={err ? `${name}-err` : hint ? `${name}-hint` : undefined} required={required} {...rest} />
    </Field>
  );
}
export function TextArea({ name, label, hint, wrap, required, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { name: string; label: string; hint?: ReactNode; wrap?: string }) {
  const err = useFormState()?.fieldErrors?.[name];
  return (
    <Field name={name} label={label} hint={hint} required={required} className={wrap}>
      <textarea id={name} name={name} rows={3} className="input" aria-invalid={!!err} required={required} {...rest} />
    </Field>
  );
}
export function Select({ name, label, hint, options, wrap, required, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { name: string; label: string; hint?: ReactNode; options: [string, string][]; wrap?: string }) {
  const err = useFormState()?.fieldErrors?.[name];
  return (
    <Field name={name} label={label} hint={hint} required={required} className={wrap}>
      <select id={name} name={name} className="input" aria-invalid={!!err} required={required} {...rest}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Field>
  );
}
export function Check({ name, label, defaultChecked, value = "on", hint }: { name: string; label: ReactNode; defaultChecked?: boolean; value?: string; hint?: string }) {
  const err = useFormState()?.fieldErrors?.[name];
  const id = `${name}-${value}`;
  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-2 text-sm">
        <input id={id} type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 accent-[var(--color-forest)]" />
        <span>{label}</span>
      </label>
      {hint && <p className="ml-6 text-xs text-muted-foreground">{hint}</p>}
      {err && <p className="ml-6 text-xs font-medium text-danger">{err}</p>}
    </div>
  );
}

export function Submit({ children, variant = "primary", className = "" }: { children: ReactNode; variant?: "primary" | "accent" | "ghost" | "danger"; className?: string }) {
  const pending = useContext(Pending);
  return (
    <button type="submit" disabled={pending} className={`btn btn-${variant} ${className}`} aria-busy={pending}>
      {pending ? <><span aria-hidden className="d-loading d-loading-spinner d-loading-xs" />Working…</> : children}
    </button>
  );
}

/** A one-button form for simple confirmed actions. */
export function ActionButton({ action, fields = {}, children, variant = "primary", confirm }: { action: (s: FormState, f: FormData) => Promise<FormState>; fields?: Record<string, string>; children: ReactNode; variant?: "primary" | "accent" | "ghost" | "danger"; confirm?: string }) {
  return (
    <ActionForm action={action} className="inline-flex flex-col gap-2">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {confirm && <Check name="confirm" label={confirm} />}
      <Submit variant={variant}>{children}</Submit>
    </ActionForm>
  );
}
