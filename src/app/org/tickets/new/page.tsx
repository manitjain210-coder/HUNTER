import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { addMin, now, toLocalInput, localDate } from "@/lib/time";
import { Card, Notice, PageHeader } from "@/components/kit";
import { TicketForm } from "@/components/ticket-form";

export const metadata = { title: "Raise a ticket" };

export default async function NewTicket() {
  const g = await gate(["RECIPIENT"], ["OWNER", "COORDINATOR"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  const [t, branches] = await Promise.all([db.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }), db.branch.findMany({ where: { tenantId: ctx.tenantId, active: true } })]);
  const tz = ctx.timezone, at = now();
  return (
    <div className="max-w-4xl">
      <PageHeader title="Raise a food-need ticket" subtitle={`For ${t.name}. You are the authorised requester.`} />
      {ctx.verificationStatus !== "APPROVED" && <Notice>Your organisation is {ctx.verificationStatus.toLowerCase().replace(/_/g, " ")}. You can save drafts, but publishing is blocked until approval.</Notice>}
      <Card className="mt-4">
        <TicketForm
          allowRecurring={ctx.verificationStatus === "APPROVED"}
          branches={branches.map((b) => [b.id, b.name])}
          d={{
            needDate: localDate(at, tz), receiveFrom: toLocalInput(addMin(at, 120), tz), latestDelivery: toLocalInput(addMin(at, 210), tz), servingTime: toLocalInput(addMin(at, 240), tz),
            deliveryAddress: t.address, receivingContact: `${t.pocName} ${t.phone}`, maxDistanceKm: t.maxDistanceKm ?? undefined, exclusions: JSON.parse(t.exclusions), purpose: "REGULAR_MEALS",
            dietPref: JSON.parse(t.dietAccepted).includes("NONVEG") ? "ANY" : "VEG",
          }}
        />
      </Card>
    </div>
  );
}
