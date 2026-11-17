import { db } from "@/lib/db";
import { adminGate } from "@/lib/gate";
import { fmtDateTime } from "@/lib/time";
import { ActionForm, Input, Submit } from "@/components/form";
import { Card, Empty, PageHeader, Status } from "@/components/kit";
import { announceAction, resolveComplaintAction } from "@/app/actions/ops";
import { TextArea } from "@/components/form";

export const metadata = { title: "Complaints & announcements" };

export default async function Complaints() {
  const g = await adminGate();
  if ("deny" in g) return g.deny;
  const complaints = await db.complaint.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 });
  const reporters = await db.user.findMany({ where: { id: { in: complaints.map((c) => c.reporterId) } }, select: { id: true, name: true } });
  return (
    <div className="space-y-5">
      <PageHeader title="Complaints & reported food" />
      <Card>
        {!complaints.length ? <Empty title="No complaints" /> : (
          <ul className="space-y-3">{complaints.map((c) => (
            <li key={c.id} className="rounded-xl border border-line p-3 text-sm">
              <div className="flex justify-between"><strong>{c.subject}</strong><Status s={c.status} /></div>
              <p>{c.body}</p>
              <p className="text-xs text-muted-foreground">{reporters.find((r) => r.id === c.reporterId)?.name} · {fmtDateTime(c.createdAt)}{c.relatedType ? ` · ${c.relatedType} ${c.relatedId?.slice(-6)}` : ""}</p>
              {c.status === "OPEN" ? (
                <ActionForm action={resolveComplaintAction} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={c.id} /><Input name="resolution" label="Resolution" required /><Submit variant="ghost">Resolve</Submit></ActionForm>
              ) : <p className="text-xs">Resolution: {c.resolution}</p>}
            </li>
          ))}</ul>
        )}
      </Card>
      <Card title="Post an in-app announcement">
        <ActionForm action={announceAction} resetOnSuccess>
          <Input name="title" label="Title" required />
          <TextArea name="body" label="Message" required />
          <Submit>Post to all users (in-app only)</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
