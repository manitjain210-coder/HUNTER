import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { adminGate } from "@/lib/gate";
import { fmtDateTime } from "@/lib/time";
import { EVIDENCE_HINT, RECIPIENT_CATEGORIES, VERIFICATION_TRANSITIONS, parseJson } from "@/lib/domain";
import { ActionForm, Check, Input, Submit, TextArea } from "@/components/form";
import { Card, KV, Notice, PageHeader, Status, Timeline } from "@/components/kit";
import { reviewAppAction, suspendAction } from "@/app/actions/org";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await adminGate();
  if ("deny" in g) return g.deny;
  const app = await db.verificationApplication.findUnique({ where: { id }, include: { tenant: { include: { memberships: { include: { user: true } }, branches: true } }, reviews: { orderBy: { createdAt: "asc" } } } });
  if (!app) notFound();
  const t = app.tenant;
  const docs = await db.storedFile.findMany({ where: { tenantId: t.id, purpose: "VERIFICATION" } });
  const selfMember = t.memberships.some((m) => m.userId === g.actor.userId);
  const next = VERIFICATION_TRANSITIONS[app.status] ?? [];
  return (
    <div className="space-y-5">
      <PageHeader title={t.name} subtitle={<span className="flex gap-2"><Status s={app.status} /> {t.kind.toLowerCase()}{t.category && ` · ${RECIPIENT_CATEGORIES[t.category]}`}</span>} />
      {selfMember && <Notice tone="red">You are a member of this organisation and cannot review it.</Notice>}
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card title="Profile (private)">
            <KV items={[
              ["Address", t.address], ["Service area", t.serviceArea], ["POC", `${t.pocName} (${t.pocRole}) · ${t.phone}`], ["Backup", t.backupContact], ["Email", t.email ?? "—"], ["Capacity", t.dailyCapacity ?? "—"],
              ["Beneficiaries", t.beneficiaryInfo || "—"], ["Programme & dietary restrictions", t.programmeNotes || "—"], ["Diets", parseJson<string[]>(t.dietAccepted, []).join(", ")], ["Exclusions", parseJson<string[]>(t.exclusions, []).join(", ") || "—"],
              ["Kitchen / fridge / vehicle", `${t.hasKitchen ? "yes" : "no"} / ${t.hasRefrigeration ? "yes" : "no"} / ${t.hasVehicle ? "yes" : "no"}`], ["Registration details", app.registrationDetails || "—"],
              ["Declaration", app.declarationAccepted ? "accepted by POC" : "not accepted"], ["Members", t.memberships.map((m) => `${m.user.name} (${m.role.toLowerCase()})`).join(", ")],
            ]} />
            {t.category && <p className="mt-3 text-xs text-muted-foreground">Suggested evidence for this category: {EVIDENCE_HINT[t.category]}. No single document rule applies to every category; use judgement and record reasons.</p>}
          </Card>
          <Card title="Documents">
            <ul className="text-sm">{docs.map((d) => <li key={d.id}><a className="text-forest underline" href={`/api/files/${d.id}`}>{d.originalName}</a> <span className="text-xs text-muted-foreground">{d.kind} · {d.mime} · {(d.size / 1024).toFixed(0)} KB</span></li>)}{!docs.length && <li className="text-muted-foreground">No documents uploaded.</li>}</ul>
          </Card>
        </div>
        <div className="space-y-5">
          {!selfMember && next.some((s) => ["UNDER_REVIEW", "APPROVED", "CHANGES_REQUESTED", "REJECTED"].includes(s)) && (
            <Card title="Decision">
              <ActionForm action={reviewAppAction}>
                <input type="hidden" name="applicationId" value={app.id} />
                <TextArea name="reason" label="Reason / message to the applicant" hint="Required for requests for changes and rejections." />
                {t.kind === "RECIPIENT" && next.includes("APPROVED") && (
                  <fieldset><legend className="mb-1 text-sm font-medium">Restrict to food types (optional)</legend>
                    {[["COMPLETE_MEALS", "Complete meals"], ["PACKAGED", "Packaged food"], ["COMPONENTS", "Components"]].map(([v, l]) => <Check key={v} name="restrictedFoodTypes" value={v} label={l} />)}
                  </fieldset>
                )}
                <div className="flex flex-wrap gap-2">
                  {next.includes("UNDER_REVIEW") && <button name="action" value="START" className="btn btn-ghost">Start review</button>}
                  {next.includes("APPROVED") && <button name="action" value="APPROVE" className="btn btn-primary">Approve</button>}
                  {next.includes("CHANGES_REQUESTED") && <button name="action" value="REQUEST_CHANGES" className="btn btn-ghost">Request changes</button>}
                  {next.includes("REJECTED") && <button name="action" value="REJECT" className="btn btn-danger">Reject</button>}
                </div>
              </ActionForm>
            </Card>
          )}
          {!selfMember && ["APPROVED", "SUSPENDED"].includes(t.verificationStatus) && (
            <Card title={t.verificationStatus === "APPROVED" ? "Suspend" : "Reinstate"}>
              <ActionForm action={suspendAction}>
                <input type="hidden" name="tenantId" value={t.id} /><input type="hidden" name="mode" value={t.verificationStatus === "APPROVED" ? "suspend" : "reinstate"} />
                <Input name="reason" label="Reason" required />
                <Submit variant={t.verificationStatus === "APPROVED" ? "danger" : "primary"}>{t.verificationStatus === "APPROVED" ? "Suspend organisation" : "Reinstate"}</Submit>
              </ActionForm>
              <p className="mt-2 text-xs text-muted-foreground">Suspension blocks new tickets, offers and reservations. Existing reservations and deliveries stay visible in the exceptions queue for your explicit resolution.</p>
            </Card>
          )}
          <Card title="History"><Timeline events={app.reviews.map((r) => ({ at: fmtDateTime(r.createdAt), label: `${r.fromStatus} → ${r.toStatus}`.replace(/_/g, " ").toLowerCase(), detail: r.reason || undefined }))} /></Card>
        </div>
      </div>
    </div>
  );
}
