import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { roleLabel } from "@/lib/domain";
import { ActionForm, Check, Input, Submit, TextArea } from "@/components/form";
import { A, Card, KV, PageHeader } from "@/components/kit";
import { changePasswordAction } from "@/app/actions/auth";
import { complaintAction, prefsAction } from "@/app/actions/ops";

export const metadata = { title: "Account" };
const TYPES: [string, string][] = [["offer", "Offers"], ["match", "Food matches"], ["reservation", "Reservations"], ["transport", "Transport"], ["receipt", "Receipts"], ["verification", "Verification"], ["order", "Grocery orders"], ["ticket", "Tickets"], ["ops", "Operations"], ["announcement", "Announcements"]];

export default async function Account() {
  const a = await requireActor();
  const [user, ms] = await Promise.all([db.user.findUniqueOrThrow({ where: { id: a.userId } }), db.membership.findMany({ where: { userId: a.userId }, include: { tenant: true } })]);
  const prefs = JSON.parse(user.notifyPrefs || "{}") as Record<string, boolean>;
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Account" />
      <Card title="You">
        <KV items={[["Name", user.name], ["Phone", `${user.phone} (not verified — no OTP in this build)`], ["Platform admin", user.isPlatformAdmin ? "yes" : "no"]]} />
        <h3 className="mt-4 text-sm font-semibold">Memberships</h3>
        <ul className="text-sm">{ms.map((m) => <li key={m.id}>{m.tenant.name} · {roleLabel[m.role]}{!m.active && " (deactivated)"}</li>)}{!ms.length && <li className="text-muted-foreground">None. <A href="/apply">Register an organisation</A></li>}</ul>
        <p className="mt-2 text-xs text-muted-foreground">Switch the organisation you are acting for with the selector in the top bar. Your role is always re-checked on the server.</p>
      </Card>
      <Card title="In-app notification preferences">
        <ActionForm action={prefsAction} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TYPES.map(([k, l]) => <Check key={k} name={k} label={l} defaultChecked={prefs[k] !== false} />)}
          <div className="col-span-full"><Submit variant="ghost">Save preferences</Submit></div>
        </ActionForm>
        <p className="mt-2 text-xs text-muted-foreground">Email: unavailable · SMS: unavailable.</p>
      </Card>
      <Card title="Change password">
        <ActionForm action={changePasswordAction} resetOnSuccess>
          <Input name="current" label="Current password" type="password" autoComplete="current-password" required />
          <Input name="password" label="New password" type="password" autoComplete="new-password" hint="At least 10 characters" required />
          <Submit variant="ghost">Change password</Submit>
        </ActionForm>
      </Card>
      <Card title="Report a problem or unsafe food">
        <ActionForm action={complaintAction} resetOnSuccess>
          <Input name="subject" label="Subject" required />
          <TextArea name="body" label="What happened?" required />
          <Input name="relatedType" label="Related record type (optional)" placeholder="DeliveryJob, SurplusLot, GroceryOrder…" />
          <Input name="relatedId" label="Related record id (optional)" />
          <Submit variant="ghost">Send to operations</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
