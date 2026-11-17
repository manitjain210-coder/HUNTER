import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { ORG_ROLES, SUPPLIER_ROLES, roleLabel } from "@/lib/domain";
import { fmtDateTime } from "@/lib/time";
import { ActionButton, ActionForm, Check, Input, Select, Submit } from "@/components/form";
import { Card, PageHeader, Status } from "@/components/kit";
import { addVehicleAction, changeMemberAction, inviteAction } from "@/app/actions/org";
import { InviteResult } from "./invite-result";

export const metadata = { title: "Team" };

export default async function Team() {
  const g = await gate(["RECIPIENT", "RESTAURANT", "SUPERMARKET", "LOGISTICS"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  const [members, invites, vehicles] = await Promise.all([
    db.membership.findMany({ where: { tenantId: ctx.tenantId }, include: { user: { select: { name: true, phone: true } } }, orderBy: { createdAt: "asc" } }),
    db.invitation.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.vehicle.findMany({ where: { tenantId: ctx.tenantId } }),
  ]);
  const owner = ctx.role === "OWNER";
  const roles = (ctx.tenantKind === "RECIPIENT" || ctx.tenantKind === "LOGISTICS" ? ORG_ROLES : SUPPLIER_ROLES).filter((r) => r !== "OWNER");
  return (
    <div className="space-y-5">
      <PageHeader title="Team & permissions" subtitle={ctx.tenantKind === "RECIPIENT" ? "Owners manage members and the profile; coordinators raise tickets, accept offers and confirm receipt; viewers read only; drivers see only assigned collections." : "Owners and managers manage the business; operators list and update stock; viewers read only."} />
      <Card title="Members">
        <div className="overflow-x-auto">
          <table className="data">
            <thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Status</th>{owner && <th>Change</th>}</tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.user.name}</td><td>{m.user.phone}</td><td>{roleLabel[m.role]}</td><td>{m.active ? "Active" : "Deactivated"}</td>
                  {owner && (
                    <td className="space-y-2">
                      <ActionForm action={changeMemberAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="membershipId" value={m.id} />
                        <Select name="role" label="Role" defaultValue={m.role} options={[...(m.role === "OWNER" ? ["OWNER"] : []), ...roles, "OWNER"].filter((v, i, a) => a.indexOf(v) === i).map((r) => [r, roleLabel[r]])} />
                        <Submit variant="ghost">Update</Submit>
                      </ActionForm>
                      <ActionButton action={changeMemberAction} fields={{ membershipId: m.id, op: m.active ? "deactivate" : "activate" }} variant={m.active ? "danger" : "ghost"}>{m.active ? "Deactivate" : "Reactivate"}</ActionButton>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {owner && (
        <Card title="Invite a team member">
          <InviteResult action={inviteAction} roles={roles.map((r) => [r, roleLabel[r]])} />
          <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
            {invites.map((i) => <li key={i.id}>{roleLabel[i.role]} invite · created {fmtDateTime(i.createdAt)} · {i.usedAt ? "used" : i.expiresAt < new Date() ? "expired" : "open"}</li>)}
          </ul>
        </Card>
      )}
      {(ctx.tenantKind === "LOGISTICS" || ctx.tenantKind === "RECIPIENT") && (
        <Card title="Vehicles">
          <ul className="mb-3 space-y-1 text-sm">{vehicles.map((v) => <li key={v.id}>{v.label} · {v.capacityKg} kg{v.refrigerated ? " · refrigerated" : ""} {!v.active && <Status s="WITHDRAWN" />}</li>)}{!vehicles.length && <li className="text-muted-foreground">No vehicles recorded.</li>}</ul>
          {["OWNER", "COORDINATOR"].includes(ctx.role) && (
            <ActionForm action={addVehicleAction} className="grid gap-3 sm:grid-cols-4 sm:items-end" resetOnSuccess>
              <Input name="label" label="Vehicle" required />
              <Input name="capacityKg" label="Capacity (kg)" type="number" required />
              <Check name="refrigerated" label="Refrigerated" />
              <Submit variant="ghost">Add vehicle</Submit>
            </ActionForm>
          )}
        </Card>
      )}
    </div>
  );
}
