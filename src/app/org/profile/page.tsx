import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { fmtDateTime } from "@/lib/time";
import { EVIDENCE_HINT, RECIPIENT_CATEGORIES, parseJson } from "@/lib/domain";
import { ActionForm, Check, Input, Select, Submit, TextArea } from "@/components/form";
import { OrgFields } from "@/components/org-fields";
import { A, Card, Notice, PageHeader, Status, Timeline } from "@/components/kit";
import { addBranchAction, submitAppAction, updateOrgAction, uploadDocAction } from "@/app/actions/org";

export const metadata = { title: "Profile & verification" };

export default async function Profile({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const g = await gate(["RECIPIENT", "RESTAURANT", "SUPERMARKET", "LOGISTICS"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  const { created } = await searchParams;
  const t = await db.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, include: { branches: true } });
  const app = await db.verificationApplication.findFirst({ where: { tenantId: t.id }, orderBy: { createdAt: "desc" }, include: { reviews: { orderBy: { createdAt: "asc" } } } });
  const docs = ["OWNER", "COORDINATOR", "MANAGER"].includes(ctx.role) ? await db.storedFile.findMany({ where: { tenantId: t.id, purpose: "VERIFICATION" }, orderBy: { createdAt: "desc" } }) : [];
  const isOwner = ctx.role === "OWNER";
  const canSubmit = isOwner && app && ["DRAFT", "CHANGES_REQUESTED"].includes(app.status);
  const lastReason = app?.reviews.filter((r) => r.reason).at(-1);
  const restricted = parseJson<string[]>(t.restrictedFoodTypes, []);
  return (
    <div className="space-y-5">
      <PageHeader title={t.name} subtitle={<>Verification: <Status s={t.verificationStatus} /> {t.category && <span className="ml-2">{RECIPIENT_CATEGORIES[t.category]}</span>}</>} />
      {created && <Notice tone="green">Draft saved. Add supporting evidence and the POC declaration below, then submit for review.</Notice>}
      {t.needsReReview && <Notice>Sensitive profile changes are awaiting admin re-review.</Notice>}
      {restricted.length > 0 && <Notice tone="blue">Reviewer restriction: this organisation may only request {restricted.join(", ").toLowerCase().replace(/_/g, " ")}.</Notice>}
      {t.verificationStatus === "CHANGES_REQUESTED" && lastReason && <Notice>Changes requested: {lastReason.reason}</Notice>}
      {t.verificationStatus === "SUSPENDED" && <Notice tone="red">Suspended{lastReason ? `: ${lastReason.reason}` : ""}. You cannot publish tickets or accept new donations. Active deliveries are being resolved by the platform team.</Notice>}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card title="Profile">
          {isOwner ? (
            <ActionForm action={updateOrgAction} className="space-y-6">
              <OrgFields t={t as unknown as Record<string, unknown>} kindLocked={t.kind} />
              <Submit>Save profile</Submit>
            </ActionForm>
          ) : <p className="text-sm text-muted-foreground">Only the owner / POC can edit the profile.</p>}
        </Card>
        <div className="space-y-5">
          <Card title="Verification">
            {canSubmit ? (
              <ActionForm action={submitAppAction}>
                <TextArea name="registrationDetails" label="Registration / authorisation details" defaultValue={app?.registrationDetails} hint={t.category ? EVIDENCE_HINT[t.category] : "Registration number, licence or authorisation reference"} />
                <Check name="declaration" label="I declare that I am authorised by this organisation to apply and act as its point of contact, and the information is accurate." />
                <Submit>Submit for review</Submit>
              </ActionForm>
            ) : <p className="text-sm text-muted-foreground">Status: {t.verificationStatus.replace(/_/g, " ").toLowerCase()}.</p>}
            <div className="mt-4">
              <Timeline events={(app?.reviews ?? []).map((r) => ({ at: fmtDateTime(r.createdAt, t.timezone), label: `${r.fromStatus.toLowerCase()} → ${r.toStatus.toLowerCase()}`.replace(/_/g, " "), detail: r.reason || undefined }))} />
            </div>
          </Card>
          {["OWNER", "COORDINATOR", "MANAGER"].includes(ctx.role) && (
            <Card title="Private documents">
              <p className="mb-2 text-xs text-muted-foreground">Stored outside the public site; visible only to your owners/coordinators and platform reviewers. PDF/PNG/JPEG/WebP up to 5 MB. Files are type-checked; no malware scanning is performed.</p>
              <ul className="mb-3 space-y-1 text-sm">
                {docs.map((d) => <li key={d.id}><a className="text-forest underline" href={`/api/files/${d.id}`}>{d.originalName}</a> <span className="text-xs text-muted-foreground">{d.kind} · {fmtDateTime(d.createdAt)}</span></li>)}
                {!docs.length && <li className="text-muted-foreground">No documents yet.</li>}
              </ul>
              <ActionForm action={uploadDocAction} resetOnSuccess>
                <Select name="kind" label="Document type" options={[["REGISTRATION", "Registration certificate"], ["AUTHORISATION_LETTER", "Institutional authorisation letter"], ["LICENCE", "Licence (e.g. food business)"], ["OTHER", "Other"]]} />
                <Input name="file" label="File" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" required />
                <Submit variant="ghost">Upload</Submit>
              </ActionForm>
            </Card>
          )}
          <Card title="Branches">
            <ul className="mb-3 space-y-1 text-sm">{t.branches.map((b) => <li key={b.id}><strong>{b.name}</strong> · {b.address}{b.maxPlatesPerDay ? ` · cap ${b.maxPlatesPerDay}/day` : ""}</li>)}</ul>
            {isOwner && (
              <ActionForm action={addBranchAction} resetOnSuccess>
                <Input name="name" label="Branch name" required />
                <Input name="address" label="Address" required />
                <div className="grid grid-cols-2 gap-2"><Input name="lat" label="Lat" /><Input name="lng" label="Lng" /></div>
                <Input name="maxPlatesPerDay" label="Capacity override (plates/day)" type="number" />
                <Input name="capacityReason" label="Reason for override" />
                <Submit variant="ghost">Add branch</Submit>
              </ActionForm>
            )}
          </Card>
          <p className="text-xs text-muted-foreground">Public summary shown to suppliers: “{t.publicSummary || t.description.slice(0, 120) || t.name}”. Contact details are shared only for confirmed allocations. <A href="/reports">View impact</A></p>
        </div>
      </div>
    </div>
  );
}
