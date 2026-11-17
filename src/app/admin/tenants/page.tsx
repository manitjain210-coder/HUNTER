import { db } from "@/lib/db";
import { adminGate } from "@/lib/gate";
import { roleLabel } from "@/lib/domain";
import { ActionForm, Submit } from "@/components/form";
import { A, Card, PageHeader, Status } from "@/components/kit";
import { resetPasswordAction } from "@/app/actions/ops";

export const metadata = { title: "Organisations & users" };

export default async function Tenants({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const g = await adminGate();
  if ("deny" in g) return g.deny;
  const q = (await searchParams).q?.slice(0, 60) ?? "";
  const [tenants, users] = await Promise.all([
    db.tenant.findMany({ where: q ? { name: { contains: q } } : {}, include: { applications: { take: 1, orderBy: { createdAt: "desc" } }, _count: { select: { memberships: true } } }, orderBy: { name: "asc" }, take: 200 }),
    db.user.findMany({ where: q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }] } : {}, include: { memberships: { include: { tenant: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="Organisations & users" />
      <form role="search" className="flex gap-2"><label htmlFor="q" className="sr-only">Search</label><input id="q" name="q" defaultValue={q} className="input max-w-xs" placeholder="Name or phone" /><button className="btn btn-primary">Search</button></form>
      <Card title="Organisations">
        <div className="overflow-x-auto"><table className="data">
          <thead><tr><th>Name</th><th>Kind</th><th>Members</th><th>Status</th></tr></thead>
          <tbody>{tenants.map((t) => (
            <tr key={t.id}><td>{t.applications[0] ? <A href={`/admin/verification/${t.applications[0].id}`}>{t.name}</A> : t.name}{t.needsReReview && <div className="text-xs text-amber-ink">re-review</div>}</td><td>{t.kind.toLowerCase()}</td><td>{t._count.memberships}</td><td><Status s={t.verificationStatus} /></td></tr>
          ))}</tbody>
        </table></div>
      </Card>
      <Card title="Users">
        <div className="overflow-x-auto"><table className="data">
          <thead><tr><th>Name</th><th>Phone</th><th>Memberships</th><th>Password help</th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}{u.isPlatformAdmin && " · admin"}</td><td>{u.phone}</td>
              <td className="text-xs">{u.memberships.map((m) => `${m.tenant.name} (${roleLabel[m.role]})`).join(", ") || "personal buyer"}</td>
              <td>{u.id !== g.actor.userId && <ActionForm action={resetPasswordAction} className="space-y-1"><input type="hidden" name="userId" value={u.id} /><Submit variant="ghost">Issue temporary password</Submit></ActionForm>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="mt-2 text-xs text-muted-foreground">Admin-assisted reset only: verify the person by phone call or in person first. Nothing is sent by SMS or email.</p>
      </Card>
    </div>
  );
}
