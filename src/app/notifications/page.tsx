import Link from "next/link";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { fmtDateTime } from "@/lib/time";
import { ActionButton } from "@/components/form";
import { Card, Empty, Notice, PageHeader } from "@/components/kit";
import { markReadAction } from "@/app/actions/ops";

export const metadata = { title: "Inbox" };

export default async function Inbox() {
  const a = await requireActor();
  const [notes, announcements] = await Promise.all([
    db.notification.findMany({ where: { userId: a.userId }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 3 }),
  ]);
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Inbox" action={<ActionButton action={markReadAction} variant="ghost">Mark all read</ActionButton>} />
      <Notice tone="blue">In-app only. Email and SMS delivery are not available in this build, so nothing here was sent to your phone.</Notice>
      {announcements.length > 0 && <Card title="Announcements"><ul className="space-y-2 text-sm">{announcements.map((n) => <li key={n.id}><strong>{n.title}</strong> — {n.body} <span className="text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</span></li>)}</ul></Card>}
      <Card>
        {!notes.length ? <Empty title="No notifications yet" /> : (
          <ul className="divide-y divide-line">{notes.map((n) => (
            <li key={n.id} className={`flex flex-wrap items-start justify-between gap-2 py-3 ${n.readAt ? "opacity-70" : ""}`}>
              <div>
                <div className="font-medium">{!n.readAt && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-coral" aria-label="unread" />}{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</div>
                {n.body && <div className="text-sm text-muted-foreground">{n.body}</div>}
                <div className="text-xs text-muted-foreground">{n.type} · {fmtDateTime(n.createdAt)}</div>
              </div>
              {!n.readAt && <ActionButton action={markReadAction} fields={{ id: n.id }} variant="ghost">Mark read</ActionButton>}
            </li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}
