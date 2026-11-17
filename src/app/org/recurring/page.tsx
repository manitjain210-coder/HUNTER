import Link from "next/link";
import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { parseJson } from "@/lib/domain";
import { fmtDateTime } from "@/lib/time";
import { ActionButton } from "@/components/form";
import { A, Card, Empty, Notice, PageHeader, Status } from "@/components/kit";
import { pauseScheduleAction } from "@/app/actions/donation";

export const metadata = { title: "Recurring needs" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function Recurring({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const g = await gate(["RECIPIENT"], ["OWNER", "COORDINATOR", "VIEWER"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  const { created } = await searchParams;
  const schedules = await db.recurringSchedule.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" } });
  const occurrences = await db.needTicket.findMany({ where: { tenantId: ctx.tenantId, scheduleId: { not: null } }, orderBy: { servingTime: "desc" }, take: 20 });
  return (
    <div className="space-y-5">
      <PageHeader title="Recurring needs" subtitle="Each occurrence becomes its own dated ticket (generated up to 2 days ahead by the local worker; never in the past)." action={ctx.role !== "VIEWER" ? <Link href="/org/tickets/new" className="btn btn-accent">New schedule</Link> : undefined} />
      {created && <Notice tone="green">Schedule created. Upcoming occurrences were generated.</Notice>}
      <Card title="Schedules">
        {!schedules.length ? <Empty title="No recurring schedules" /> : (
          <ul className="divide-y divide-line">{schedules.map((s) => {
            const tpl = parseJson<Record<string, string>>(s.template, {});
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-medium">{tpl.title} {s.paused && <Status s="PAUSED" />}</div>
                  <div className="text-sm text-muted-foreground">{parseJson<number[]>(s.daysOfWeek, []).map((d) => DAYS[d]).join(", ")} at {s.localTime} · from {s.startDate}{s.endDate ? ` to ${s.endDate}` : ""} · {tpl.foodCategory === "COMPLETE_MEALS" ? `${tpl.plates} plates` : tpl.foodCategory?.toLowerCase()}</div>
                  {parseJson<string[]>(s.exceptions, []).length > 0 && <div className="text-xs text-muted-foreground">Skips: {parseJson<string[]>(s.exceptions, []).join(", ")}</div>}
                </div>
                {ctx.role !== "VIEWER" && <ActionButton action={pauseScheduleAction} fields={{ scheduleId: s.id, paused: String(!s.paused) }} variant="ghost">{s.paused ? "Resume" : "Pause"}</ActionButton>}
              </li>
            );
          })}</ul>
        )}
      </Card>
      <Card title="Generated occurrences">
        {!occurrences.length ? <Empty title="None yet" /> : (
          <ul className="divide-y divide-line text-sm">{occurrences.map((t) => <li key={t.id} className="flex justify-between py-2"><A href={`/org/tickets/${t.id}`}>{t.title}</A><span>{fmtDateTime(t.servingTime, ctx.timezone)} <Status s={t.status} /></span></li>)}</ul>
        )}
      </Card>
    </div>
  );
}
