import { ActionForm, Input, Submit } from "@/components/form";
import { AuthSplit } from "@/components/auth-split";
import { registerAction } from "@/app/actions/auth";
import { Notice } from "@/components/kit";

export const metadata = { title: "Create account" };

export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthSplit>
      <h1 className="mb-1 text-2xl font-semibold">Create an account</h1>
      <p className="mb-4 text-sm text-muted-foreground">Everyone starts as a personal buyer. Organisations are registered separately and verified by a reviewer.</p>
      <Notice>This local build does not send an OTP, so it cannot verify that you own this phone number.</Notice>
      <ActionForm action={registerAction} className="mt-4 space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <Input name="name" label="Your name" autoComplete="name" required />
        <Input name="phone" label="Phone number" type="tel" autoComplete="tel" required />
        <Input name="password" label="Password" type="password" autoComplete="new-password" hint="At least 10 characters." required />
        <Input name="password2" label="Repeat password" type="password" autoComplete="new-password" required />
        <Submit className="w-full">Create account</Submit>
      </ActionForm>
    </AuthSplit>
  );
}
