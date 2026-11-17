import { db } from "@/lib/db";
import { adminGate } from "@/lib/gate";
import { getPolicy, POLICY_DEFAULTS } from "@/lib/policy";
import { fmtDateTime } from "@/lib/time";
import { ActionForm, Input, Submit } from "@/components/form";
import { Card, PageHeader } from "@/components/kit";
import { setPolicyAction } from "@/app/actions/ops";

export const metadata = { title: "Policy settings" };

const HELP: Record<string, string> = {
  reservationHoldMinutes: "How long an accepted donation stays reserved before collection",
  groceryHoldMinutes: "How long grocery stock is held for collection",
  offerTtlMinutes: "How long a restaurant offer stays open",
  maxPendingOffersPerLot: "Limit on outstanding offers per batch",
  escalationMinutes: "Minutes before alerting the next group of organisations",
  collectionTargetMinutes: "Operational collection target (not a safety lifetime)",
  servingBufferMinutes: "Minimum time needed between delivery and consumption deadline",
  travelBufferMinutes: "Added to every straight-line travel estimate",
  avgSpeedKmh: "Average speed for travel estimates",
  maxPlatesPerTicket: "Hard limit per ticket", maxPeoplePerTicket: "Hard limit per ticket",
  maxDiscountPct: "Platform-wide discount cap", maxReadyToConsumeHours: "Declared deadlines beyond this are flagged for review",
  serviceAreas: "Comma-separated local service areas", fairnessLookbackDays: "Window for the fairness factor in matching",
};

export default async function Policy() {
  const g = await adminGate();
  if ("deny" in g) return g.deny;
  const p = await getPolicy();
  const rows = await db.policySetting.findMany();
  return (
    <div className="space-y-5">
      <PageHeader title="Policy settings" subtitle="Each change creates a new version; reservations and orders snapshot the version they used. Overrides cannot make expired food available." />
      <div className="grid gap-3 md:grid-cols-2">
        {Object.keys(POLICY_DEFAULTS).map((k) => {
          const row = rows.find((r) => r.key === k);
          const v = p[k as keyof typeof POLICY_DEFAULTS];
          return (
            <Card key={k} title={k}>
              <p className="mb-2 text-xs text-muted-foreground">{HELP[k]} · v{row?.version ?? 0}{row ? ` · updated ${fmtDateTime(row.updatedAt)}` : " · default"}</p>
              <ActionForm action={setPolicyAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="key" value={k} />
                <Input name="value" label="Value" defaultValue={Array.isArray(v) ? v.join(", ") : String(v)} />
                <Input name="reason" label="Reason" required />
                <Submit variant="ghost">Save</Submit>
              </ActionForm>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
