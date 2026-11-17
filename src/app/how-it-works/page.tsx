import { Card } from "@/components/kit";
import { PhotoBand } from "@/components/photo-band";
import { POLICY_DEFAULTS } from "@/lib/policy";

export const metadata = { title: "How it works" };

export default function HowItWorks() {
  return (
    <div className="space-y-5">
      <PhotoBand src="/photos/fruit-waste.jpg" position="center 50%" scrim="full">
        <div className="max-w-xl px-6 py-14 md:px-10 md:py-16">
          <h1 className="text-[2rem] leading-tight text-white md:text-[2.5rem]">How Khana Bridge works</h1>
          <p className="mt-3 text-white/85">Peel and trimmings belong in compost. Food that is still good to eat should not end up there. These are the rules we use to keep it moving, stated plainly.</p>
        </div>
      </PhotoBand>
      <Card title="Donation flow">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>An organisation applies; a platform reviewer approves, requests changes or rejects. Choosing a category is not approval.</li>
          <li>Approved organisations raise food-need tickets in advance. Publishing a need does not guarantee supply.</li>
          <li>Restaurants may post an <em>expected</em> surplus estimate for planning. It cannot be reserved or counted as rescued food.</li>
          <li>When food is actually ready, the restaurant confirms quantities, allergens, holding conditions and batch deadlines, and signs a handling declaration. Only safe, unused food never served to customers is accepted. Photos do not establish safety.</li>
          <li>A deterministic matching service applies hard filters (verification, diet, allergens, units, timing, distance) and then ranks feasible matches. Every match shows why it matched or why not.</li>
          <li>Accepting an offer reserves food until an explicit hold deadline (default {POLICY_DEFAULTS.reservationHoldMinutes} min). Without transport it shows “Reserved — transport pending”.</li>
          <li>Dispatch needs a confirmed receiver, a confirmed collector and recorded transport funding. Food stays free; transport costs are tracked separately.</li>
          <li>The receiver records accepted and rejected quantities. Partial acceptance never marks the whole ticket fulfilled; rejected or failed food goes to an operations resolution and is never re-listed.</li>
        </ol>
      </Card>
      <Card title="The one-hour target">
        <p className="text-sm">We aim to collect confirmed restaurant surplus within {POLICY_DEFAULTS.collectionTargetMinutes} minutes where feasible. This is an operational target, not a food-safety lifetime and not a guarantee. Each batch carries its own declared pickup and consumption deadlines, and the platform never extends a food deadline because a booking failed.</p>
      </Card>
      <Card title="Units and impact">
        <p className="text-sm">Complete-meal plates, kilograms, litres, pieces and component portions are kept separate. Rice plus dal portions are never added up as extra plates. Reports count only received and accepted food from real records — no CO₂, people-fed or money-saved estimates.</p>
      </Card>
      <Card title="What is not connected">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>No SMS, email, payment gateway, map routing or logistics-provider integration. Notifications are in-app only.</li>
          <li>Phone-number sign-in does not verify that you own the number.</li>
          <li>Distances are straight-line estimates; travel times are estimates with buffers, not road routes.</li>
          <li>No partnership with any delivery company, government body or CSR sponsor is implied.</li>
        </ul>
      </Card>
    </div>
  );
}
