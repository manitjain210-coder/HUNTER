import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { localDate, toLocalInput } from "@/lib/time";
import { parseJson } from "@/lib/domain";
import { Card, Notice, PageHeader } from "@/components/kit";
import { TicketForm } from "@/components/ticket-form";

export default async function EditTicket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(["RECIPIENT"], ["OWNER", "COORDINATOR"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  const t = await db.needTicket.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { requirements: true } });
  if (!t) notFound();
  if (!["DRAFT", "OPEN"].includes(t.status)) return <Notice>Only draft or open tickets can be edited.</Notice>;
  const branches = await db.branch.findMany({ where: { tenantId: ctx.tenantId } });
  const tz = ctx.timezone;
  const committed = t.requirements.some((r) => r.reservedQty > 0);
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Edit: ${t.title}`} />
      {committed && <Notice>Food is already committed. Quantities cannot go below commitments and timing cannot change until those allocations are resolved.</Notice>}
      <Card className="mt-4">
        <TicketForm
          ticketId={t.id}
          allowRecurring={false}
          branches={branches.map((b) => [b.id, b.name])}
          d={{
            title: t.title, purpose: t.purpose, mealSlot: t.mealSlot, peopleCount: t.peopleCount, foodCategory: t.foodCategory, dietPref: t.dietPref, otherDietary: t.otherDietary,
            partialOk: t.partialOk, minUseful: t.minUseful, fulfilment: t.fulfilment, deliveryAddress: t.deliveryAddress, receivingContact: t.receivingContact, storageNotes: t.storageNotes,
            containers: t.containers, unloading: t.unloading, transportFunding: t.transportFunding, urgencyReason: t.urgencyReason,
            needDate: localDate(t.needDate, tz), receiveFrom: toLocalInput(t.receiveFrom, tz), latestDelivery: toLocalInput(t.latestDelivery, tz), servingTime: toLocalInput(t.servingTime, tz),
            exclusions: parseJson(t.exclusions, []), urgent: t.urgency !== "NORMAL", branchId: t.branchId ?? undefined, lat: t.lat ?? undefined, lng: t.lng ?? undefined, maxDistanceKm: t.maxDistanceKm ?? undefined,
            plates: t.requirements.find((r) => r.unit === "PLATES")?.quantity, packagedUnits: t.requirements.find((r) => r.kind === "PACKAGED")?.quantity,
            components: t.requirements.filter((r) => r.kind === "COMPONENT").map((r) => ({ name: r.name, unit: r.unit, quantity: r.quantity, servingNote: r.servingNote })),
          }}
        />
      </Card>
    </div>
  );
}
