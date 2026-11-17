import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getActor } from "@/lib/session";
import { sha256 } from "@/lib/auth";
import { roleLabel } from "@/lib/domain";
import { ActionForm, Submit } from "@/components/form";
import { Card, Notice, PageHeader } from "@/components/kit";
import { acceptInviteAction } from "@/app/actions/org";

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const a = await getActor();
  if (!a) redirect(`/register?next=/invite/${token}`);
  const inv = await db.invitation.findUnique({ where: { tokenHash: sha256(token) }, include: { tenant: true } });
  const valid = inv && !inv.usedAt && inv.expiresAt > new Date();
  return (
    <div className="max-w-lg">
      <PageHeader title="Join an organisation" />
      {!valid ? <Notice tone="red">This invitation is invalid, already used or expired. Ask the organisation owner for a new link.</Notice> : (
        <Card>
          <p className="mb-4">You have been invited to join <strong>{inv.tenant.name}</strong> as <strong>{roleLabel[inv.role]}</strong>, signed in as {a.name} ({a.phone}).</p>
          <ActionForm action={acceptInviteAction}>
            <input type="hidden" name="token" value={token} />
            <Submit>Accept invitation</Submit>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
