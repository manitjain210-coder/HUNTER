import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { demoMode } from "@/lib/session";
import { roleLabel } from "@/lib/domain";
import { ActionForm, Submit } from "@/components/form";
import { demoLoginAction } from "@/app/actions/auth";
import { Notice, PageHeader } from "@/components/kit";

export const metadata = { title: "Demo entry" };

export default async function Demo() {
  if (!demoMode()) notFound();
  const users = await db.user.findMany({ where: { isDemo: true }, include: { memberships: { include: { tenant: true } } }, orderBy: { phone: "asc" } });
  return (
    <div>
      <PageHeader title="Demo entry" subtitle="Local demo only. Every account, organisation and figure here is fictional seed data." />
      <Notice>Enabled because DEMO_MODE=true and the app is not running in production. It only signs in seeded demo accounts (password also listed in the README) and cannot impersonate real users.</Notice>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((u) => (
          <div key={u.id} className="spot flex flex-col rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-float)]">
            <div className="font-semibold">{u.name}</div>
            <div className="text-xs text-muted-foreground">{u.phone}</div>
            <ul className="mt-2 flex-1 text-sm text-muted-foreground">
              {u.isPlatformAdmin && <li>Platform admin</li>}
              {u.memberships.map((m) => <li key={m.id}>{roleLabel[m.role]} · {m.tenant.name} <span className="text-xs">({m.tenant.verificationStatus.toLowerCase()})</span></li>)}
              {!u.isPlatformAdmin && !u.memberships.length && <li>Personal buyer</li>}
            </ul>
            <ActionForm action={demoLoginAction} className="mt-3">
              <input type="hidden" name="userId" value={u.id} />
              <Submit variant="ghost" className="w-full">Enter as this user</Submit>
            </ActionForm>
          </div>
        ))}
      </div>
    </div>
  );
}
