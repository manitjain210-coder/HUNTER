import Link from "next/link";
import { gate } from "@/lib/gate";
import { addMin, now, toLocalInput } from "@/lib/time";
import { Card, Notice, PageHeader } from "@/components/kit";
import { SurplusForm } from "@/components/surplus-form";

export const metadata = { title: "List surplus" };

export default async function NewSurplus({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const g = await gate(["RESTAURANT"], ["OWNER", "MANAGER", "OPERATOR"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  const mode = (await searchParams).mode === "expected" ? "EXPECTED" : "READY";
  const at = now(), tz = ctx.timezone;
  return (
    <div className="max-w-4xl">
      <PageHeader title={mode === "READY" ? "Confirm surplus ready for collection" : "Announce expected surplus"} subtitle={mode === "READY" ? "Only confirmed food can be offered or reserved." : "An early estimate for planning. It cannot be reserved, fulfilled or counted as rescued food."} />
      <nav className="mb-4 flex gap-2 text-sm">
        <Link href="?mode=ready" className={`rounded-full border px-3 py-1 ${mode === "READY" ? "border-forest bg-forest-50 text-forest" : "border-line bg-white"}`}>Ready now</Link>
        <Link href="?mode=expected" className={`rounded-full border px-3 py-1 ${mode === "EXPECTED" ? "border-forest bg-forest-50 text-forest" : "border-line bg-white"}`}>Expected later</Link>
      </nav>
      {ctx.verificationStatus !== "APPROVED" && <Notice>Your business must be approved before listing surplus.</Notice>}
      <Card className="mt-3">
        <SurplusForm
          key={mode}
          mode={mode}
          initialItems={[]}
          d={{ preparedAt: toLocalInput(addMin(at, -30), tz), readyAt: toLocalInput(at, tz), pickupDeadline: toLocalInput(addMin(at, 60), tz), consumeBy: toLocalInput(addMin(at, 240), tz), expectedFrom: toLocalInput(addMin(at, 180), tz), expectedUntil: toLocalInput(addMin(at, 300), tz) }}
        />
      </Card>
    </div>
  );
}
