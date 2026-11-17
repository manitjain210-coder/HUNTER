import Link from "next/link";
import { AuthSplit } from "@/components/auth-split";
import { ActionForm, Input, Submit } from "@/components/form";
import { loginAction } from "@/app/actions/auth";
import { demoMode } from "@/lib/session";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthSplit>
      <h1 className="mb-1 text-2xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-muted-foreground">Use your phone number and password.</p>
      <ActionForm action={loginAction}>
        <input type="hidden" name="next" value={next ?? ""} />
        <Input name="phone" label="Phone number" type="tel" autoComplete="tel" required placeholder="98765 43210" />
        <Input name="password" label="Password" type="password" autoComplete="current-password" required />
        <Submit className="w-full">Sign in</Submit>
      </ActionForm>
      <p className="mt-4 text-sm">New here? <Link className="text-forest underline" href="/register">Create an account</Link></p>
      <p className="mt-2 text-xs text-muted-foreground">Forgot your password? There is no SMS/email reset in this build — ask a platform admin to issue a one-time temporary password.</p>
      {demoMode() && <p className="mt-4 text-sm"><Link className="text-coral underline" href="/demo">Demo entry (seeded fictional accounts)</Link></p>}
    </AuthSplit>
  );
}
