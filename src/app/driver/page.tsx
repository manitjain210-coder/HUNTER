import Link from "next/link";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { fmtDateTime } from "@/lib/time";
import { Card, Empty, Status } from "@/components/kit";
import { PhotoBand } from "@/components/photo-band";

export const metadata = { title: "My collections" };

/** Drivers only see jobs assigned to them, with the information needed for those jobs. */
export default async function Driver() {
  const a = await requireActor();
  const jobs = await db.deliveryJob.findMany({ where: { collectorId: a.userId }, include: { stops: { orderBy: { seq: "asc" } } }, orderBy: { updatedAt: "desc" }, take: 30 });
  const active = jobs.filter((j) => !["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"].includes(j.status));
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PhotoBand src="/photos/collection-rider.jpg" position="center 66%" scrim="bottom" className="flex min-h-[220px] items-end">
        <div className="px-6 pb-6 pt-20">
          <h1 className="text-[1.8rem] leading-tight text-white">My assigned collections</h1>
          <p className="mt-1 text-sm text-white/85">Pick up, hand over, and record what was collected at each stop.</p>
        </div>
      </PhotoBand>
      {!active.length && <Empty title="No active collections">New assignments appear here and in your inbox.</Empty>}
      {active.map((j) => (
        <Link key={j.id} href={`/logistics/jobs/${j.id}`} className="spot block rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-float)]">
          <div className="flex items-center justify-between"><strong>Job {j.id.slice(-6)}</strong><Status s={j.status} /></div>
          <ol className="mt-2 space-y-1 text-sm">{j.stops.map((s) => <li key={s.id}>{s.seq + 1}. {s.kind === "PICKUP" ? "Pick up" : "Drop off"} · {s.address} {s.doneAt ? "✓" : `(by ${fmtDateTime(s.windowEnd)})`}</li>)}</ol>
          <span className="btn btn-accent mt-3 w-full">Open job</span>
        </Link>
      ))}
      {jobs.length > active.length && (
        <Card title="Recent">
          <ul className="text-sm">{jobs.filter((j) => !active.includes(j)).map((j) => <li key={j.id} className="flex justify-between py-1"><Link className="underline" href={`/logistics/jobs/${j.id}`}>Job {j.id.slice(-6)}</Link><Status s={j.status} /></li>)}</ul>
        </Card>
      )}
    </div>
  );
}
