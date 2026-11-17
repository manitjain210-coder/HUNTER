"use client";

import { useState } from "react";
import { Check, Input, Select, TextArea } from "./form";
import { ALLERGENS, RECIPIENT_CATEGORIES, EVIDENCE_HINT, PROGRAMME_REQUIRED } from "@/lib/domain";

type T = Record<string, unknown> | null;
const v = (t: T, k: string) => (t?.[k] == null ? undefined : String(t[k]));
const arr = (t: T, k: string): string[] => { try { return JSON.parse(String(t?.[k] ?? "[]")); } catch { return []; } };

/** Organisation profile fields, shared by Create organisation and Edit profile. */
export function OrgFields({ t, kindLocked }: { t: T; kindLocked?: string }) {
  const [kind, setKind] = useState(kindLocked ?? v(t, "kind") ?? "RECIPIENT");
  const [cat, setCat] = useState(v(t, "category") ?? "");
  const isRecipient = kind === "RECIPIENT";
  return (
    <div className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Organisation</legend>
        {kindLocked ? <input type="hidden" name="kind" value={kindLocked} /> : (
          <Select name="kind" label="What kind of organisation?" value={kind} onChange={(e) => setKind(e.target.value)} options={[["RECIPIENT", "Recipient organisation (NGO, shelter, kitchen…)"], ["RESTAURANT", "Restaurant / food business"], ["SUPERMARKET", "Supermarket / grocery seller"]]} required />
        )}
        {isRecipient && (
          <Select name="category" label="Applicant category" value={cat} onChange={(e) => setCat(e.target.value)} options={[["", "Choose…"], ...Object.entries(RECIPIENT_CATEGORIES)]} hint="Describes the applicant only. Approval is a separate manual review." required />
        )}
        <Input name="name" label="Organisation name" defaultValue={v(t, "name")} required />
        <Input name="serviceArea" label="Service area / city" defaultValue={v(t, "serviceArea")} required />
        <TextArea name="description" label="Description" defaultValue={v(t, "description")} wrap="sm:col-span-2" />
        <Input name="address" label="Operating address" defaultValue={v(t, "address")} wrap="sm:col-span-2" required />
        <Input name="lat" label="Latitude (optional)" inputMode="decimal" defaultValue={v(t, "lat")} hint="Used only for straight-line distance estimates." />
        <Input name="lng" label="Longitude (optional)" inputMode="decimal" defaultValue={v(t, "lng")} />
        <Input name="hours" label={isRecipient ? "Receiving hours" : "Operating hours"} defaultValue={v(t, "hours")} placeholder="e.g. 11:00–14:00, 18:00–21:00" />
        <Select name="timezone" label="Timezone" defaultValue={v(t, "timezone") ?? "Asia/Kolkata"} options={[["Asia/Kolkata", "Asia/Kolkata (IST)"]]} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Point of contact</legend>
        <Input name="pocName" label="POC name" defaultValue={v(t, "pocName")} required />
        <Input name="pocRole" label="POC role" defaultValue={v(t, "pocRole")} required />
        <Input name="phone" label="Phone" type="tel" defaultValue={v(t, "phone")} required />
        <Input name="email" label="Email (optional)" type="email" defaultValue={v(t, "email")} />
        <Input name="backupContact" label="Backup contact" defaultValue={v(t, "backupContact")} wrap="sm:col-span-2" />
      </fieldset>

      {isRecipient && (
        <>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Who you serve (no personal details)</legend>
            <Input name="dailyCapacity" label="Approximate daily serving capacity" type="number" min={1} defaultValue={v(t, "dailyCapacity")} required />
            <Input name="beneficiaryInfo" label="Beneficiary categories & estimated counts" defaultValue={v(t, "beneficiaryInfo")} hint="e.g. 'Adults in night shelter (~120)'. Never names or IDs." />
            {PROGRAMME_REQUIRED.includes(cat) && (
              <TextArea name="programmeNotes" label="Intended programme and authorised dietary restrictions" defaultValue={v(t, "programmeNotes")} wrap="sm:col-span-2" required
                hint="Hospitals, children's and elder-care homes must state the programme. Mixed donated meals are not assumed appropriate for patients, children or medically restricted recipients." />
            )}
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Food & handling</legend>
            <div>
              <p className="mb-1 text-sm font-medium">Diets you accept</p>
              {[["VEG", "Vegetarian"], ["VEGAN", "Vegan"], ["NONVEG", "Non-vegetarian"]].map(([k, l]) => <Check key={k} name="dietAccepted" value={k} label={l} defaultChecked={t ? arr(t, "dietAccepted").includes(k) : true} />)}
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">Allergens you must exclude</p>
              <div className="grid grid-cols-2">{ALLERGENS.map((al) => <Check key={al} name="exclusions" value={al} label={al.replace("_", " ")} defaultChecked={arr(t, "exclusions").includes(al)} />)}</div>
            </div>
            <Check name="hasKitchen" label="Kitchen / reheating available" defaultChecked={!!t?.hasKitchen} />
            <Check name="hasRefrigeration" label="Refrigeration available" defaultChecked={!!t?.hasRefrigeration} />
            <Check name="hasVehicle" label="We have a suitable vehicle" defaultChecked={!!t?.hasVehicle} />
            <Check name="acceptsPartial" label="We accept partial donations" defaultChecked={t ? !!t.acceptsPartial : true} />
            <Check name="acceptsComponents" label="We accept components (rice, dal…)" defaultChecked={t ? !!t.acceptsComponents : true} />
            <Input name="storageCapacity" label="Storage capacity" defaultValue={v(t, "storageCapacity")} />
            <Input name="maxDistanceKm" label="Maximum collection distance (km)" type="number" step="0.5" defaultValue={v(t, "maxDistanceKm")} />
            <Input name="packingNeeds" label="Packing / container requirements" defaultValue={v(t, "packingNeeds")} />
          </fieldset>
          {cat && <p className="text-sm text-muted-foreground">Suggested evidence for this category: <strong>{EVIDENCE_HINT[cat]}</strong>. You can add documents after creating the draft.</p>}
        </>
      )}
    </div>
  );
}
