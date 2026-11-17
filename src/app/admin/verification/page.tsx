import { db } from "@/lib/db";
import { adminGate } from "@/lib/gate";
import { fmtDateTime } from "@/lib/time";
import { RECIPIENT_CATEGORIES } from "@/lib/domain";
import { A, Card, Empty, PageHeader, Status } from "@/components/kit";

export const metadata = { title: "Verification queue" };

export default async function VerificationQueue() {
  const g = await adminGate();
  if ("deny" in g) return g.deny;
  const apps = await db.verificationApplication.findMany({ include: { tenant: true }, orderBy: [{ submittedAt: "asc" }], take: 200 });
  const order = ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "DRAFT", "APPROVED", "SUSPENDED", "REJECTED"];
  apps.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <div>
      <PageHeader title="Verification" subtitle="Approve, request changes, reject or suspend — always with a reason. Reviewers cannot act on organisations they belong to." />
      <Card>
        {!apps.length ? <Empty title="No applications" /> : (
          <div className="overflow-x-auto"><table className="data">
            <thead><tr><th>Organisation</th><th>Type</th><th>Submitted</th><th>Status</th></tr></thead>
            <tbody>{apps.map((a) => (
              <tr key={a.id}><td><A href={`/admin/verification/${a.id}`}>{a.tenant.name}</A>{a.tenant.needsReReview && <div className="text-xs text-amber-ink">sensitive changes to re-review</div>}</td><td>{a.tenant.kind.toLowerCase()}{a.tenant.category ? ` · ${RECIPIENT_CATEGORIES[a.tenant.category]}` : ""}</td><td>{fmtDateTime(a.submittedAt)}</td><td><Status s={a.status} /></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
