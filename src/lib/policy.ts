import { db, type Tx } from "./db";
import { parseJson } from "./domain";

/** Defaults; admins override via PolicySetting rows (versioned). */
export const POLICY_DEFAULTS = {
  reservationHoldMinutes: 45, // donation allocation hold until collection
  groceryHoldMinutes: 240, // grocery order reservation until collection
  offerTtlMinutes: 30,
  maxPendingOffersPerLot: 5,
  escalationMinutes: 8, // next wave of alerts after N minutes without acceptance
  collectionTargetMinutes: 60, // operational target, NOT a food-safety lifetime
  servingBufferMinutes: 20, // time needed between delivery and serving
  travelBufferMinutes: 15,
  avgSpeedKmh: 18, // straight-line estimate only
  maxPlatesPerTicket: 2000,
  maxPeoplePerTicket: 5000,
  maxDiscountPct: 80,
  maxReadyToConsumeHours: 12, // flag declared deadlines beyond this for review
  serviceAreas: ["Bengaluru", "Mumbai", "Delhi"],
  fairnessLookbackDays: 7,
};
export type Policy = typeof POLICY_DEFAULTS;

export async function getPolicy(t: Tx = db): Promise<Policy & { _versions: Record<string, number> }> {
  const rows = await t.policySetting.findMany();
  const p: Record<string, unknown> = { ...POLICY_DEFAULTS };
  const versions: Record<string, number> = {};
  for (const r of rows) {
    if (r.key in POLICY_DEFAULTS) {
      p[r.key] = parseJson(r.value, p[r.key]);
      versions[r.key] = r.version;
    }
  }
  return { ...(p as Policy), _versions: versions };
}
