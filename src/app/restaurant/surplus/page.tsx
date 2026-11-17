import Link from "next/link";
import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { fmtDateTime } from "@/lib/time";
import { unitLabel } from "@/lib/domain";
import { A, Card, Empty, PageHeader, Status } from "@/components/kit";
import { Cover } from "@/components/photos";
import { imagesFor } from "@/services/files";

export const metadata = { title: "Surplus batches" };

export default async function SurplusList() {
  const g = await gate(["RESTAURANT"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  const lots = await db.surplusLot.findMany({ where: { tenantId: ctx.tenantId }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 100 });
  const lotPhotos = await imagesFor("lot", lots.map((l) => l.id));
  const sections: [string, string[]][] = [["Ready for collection", ["READY"]], ["Expected (estimates)", ["EXPECTED"]], ["Closed", ["CLOSED", "WITHDRAWN", "EXPIRED"]]];
  return (
    <div className="space-y-5">
      <PageHeader title="Surplus batches" action={ctx.role !== "VIEWER" ? <div className="flex gap-2"><Link href="/restaurant/surplus/new?mode=expected" className="btn btn-ghost">Expected surplus</Link><Link href="/restaurant/surplus/new" className="btn btn-accent">List surplus</Link></div> : undefined} />
      {sections.map(([title, stages]) => {
        const list = lots.filter((l) => stages.includes(l.stage));
        return (
          <Card key={title} title={title}>
            {!list.length ? <Empty title="None" /> : (
              <div className="overflow-x-auto"><table className="data">
                <thead><tr><th>Batch</th><th>Items (available / confirmed)</th><th>Pickup deadline</th><th>Stage</th></tr></thead>
                <tbody>{list.map((l) => (
                  <tr key={l.id}>
                    <td><div className="flex items-center gap-3"><Cover id={lotPhotos.get(l.id)?.[0]} alt={l.title} className="size-11 shrink-0 rounded-lg ring-1 ring-line" /><A href={`/restaurant/surplus/${l.id}`}>{l.title}</A></div></td>
                    <td>{l.items.map((i) => `${i.name}: ${i.quantity - i.allocatedQty}/${i.quantity} ${unitLabel[i.unit]}`).join(" · ")}</td>
                    <td>{l.stage === "EXPECTED" ? `≈ ${fmtDateTime(l.expectedFrom, ctx.timezone)}` : fmtDateTime(l.pickupDeadline, ctx.timezone)}</td>
                    <td><Status s={l.stage} /></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
