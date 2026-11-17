"use client";

import { useState } from "react";
import { ActionForm, Check, Input, Select, TextArea, useFormState } from "./form";
import { ALLERGENS, MEAL_SLOTS, PURPOSES } from "@/lib/domain";
import { saveTicketAction } from "@/app/actions/donation";

type Comp = { name: string; unit: string; quantity: number | string; servingNote: string };
export type TicketDefaults = Record<string, string | number | boolean | string[] | Comp[] | undefined>;

function Components({ initial }: { initial: Comp[] }) {
  const [rows, setRows] = useState<Comp[]>(initial.length ? initial : [{ name: "Rice", unit: "KG", quantity: "", servingNote: "" }]);
  const err = useFormState()?.fieldErrors;
  const set = (i: number, k: keyof Comp, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Components (each keeps its own unit — never converted to plates)</legend>
      <input type="hidden" name="components" value={JSON.stringify(rows.map((r) => ({ ...r, quantity: Number(r.quantity) })))} />
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_0.8fr_1.4fr_auto]">
          <input aria-label="Component name" className="input" value={r.name} onChange={(e) => set(i, "name", e.target.value)} placeholder="Rice" />
          <select aria-label="Unit" className="input" value={r.unit} onChange={(e) => set(i, "unit", e.target.value)}>
            {[["KG", "kg"], ["LITRES", "litres"], ["PIECES", "pieces"], ["PORTIONS", "component portions"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input aria-label="Quantity" className="input" type="number" min={1} value={r.quantity} onChange={(e) => set(i, "quantity", e.target.value)} placeholder="Qty" />
          <input aria-label="Approximate serving requirement" className="input" value={r.servingNote} onChange={(e) => set(i, "servingNote", e.target.value)} placeholder="≈ serves 100" />
          <button type="button" className="btn btn-ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove ${r.name || "component"}`}>Remove</button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost" onClick={() => setRows([...rows, { name: "", unit: "KG", quantity: "", servingNote: "" }])}>Add component</button>
      {err?.components && <p className="text-xs font-medium text-danger">{err.components}</p>}
      {Object.entries(err ?? {}).filter(([k]) => k.startsWith("components.")).map(([k, v]) => <p key={k} className="text-xs text-danger">Row {Number(k.split(".")[1]) + 1}: {v}</p>)}
    </fieldset>
  );
}

export function TicketForm({ d, branches, ticketId, allowRecurring }: { d: TicketDefaults; branches: [string, string][]; ticketId?: string; allowRecurring: boolean }) {
  const [cat, setCat] = useState(String(d.foodCategory ?? "COMPLETE_MEALS"));
  const [ful, setFul] = useState(String(d.fulfilment ?? "DELIVERY"));
  const [rec, setRec] = useState(false);
  const [urgent, setUrgent] = useState(!!d.urgent);
  const s = (k: string) => (d[k] == null ? undefined : String(d[k]));
  const excl = (d.exclusions as string[]) ?? [];
  return (
    <ActionForm action={saveTicketAction} className="space-y-8">
      {ticketId && <input type="hidden" name="ticketId" value={ticketId} />}
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2">1 · What and when</h2>
        <Input name="title" label="Ticket title" defaultValue={s("title")} required wrap="sm:col-span-2" />
        <Select name="branchId" label="Branch" defaultValue={s("branchId")} options={branches} />
        <Select name="purpose" label="Request purpose" defaultValue={s("purpose")} options={Object.entries(PURPOSES)} required />
        <Select name="mealSlot" label="Meal slot" defaultValue={s("mealSlot") ?? "LUNCH"} options={MEAL_SLOTS.map((m) => [m, m[0] + m.slice(1).toLowerCase()])} required />
        {!rec && <Input name="needDate" label="Date" type="date" defaultValue={s("needDate")} required />}
        <Input name="peopleCount" label="Number of people" type="number" min={1} defaultValue={s("peopleCount")} required />
        {allowRecurring && !ticketId && (
          <div className="sm:col-span-2 rounded-xl border border-line bg-cream/60 p-3">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="recurring" checked={rec} onChange={(e) => setRec(e.target.checked)} className="h-4 w-4" /> Recurring request (creates a separate dated ticket for each occurrence)</label>
            {rec && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-3 flex flex-wrap gap-3">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((l, i) => <Check key={l} name="daysOfWeek" value={String(i)} label={l} defaultChecked={i > 0} />)}</div>
                <Input name="localTime" label="Serving time (local)" type="time" defaultValue="13:00" required />
                <Input name="startDate" label="Start date" type="date" required />
                <Input name="endDate" label="End date (optional)" type="date" />
                <Input name="exceptionDates" label="Skip dates (YYYY-MM-DD, comma-separated)" wrap="sm:col-span-3" />
                <Input name="receiveLeadMin" label="Receiving window opens (min before serving)" type="number" defaultValue="90" />
                <Input name="latestLeadMin" label="Latest delivery (min before serving)" type="number" defaultValue="20" />
              </div>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2">2 · Food needed</h2>
        <Select name="foodCategory" label="Food category" value={cat} onChange={(e) => setCat(e.target.value)} options={[["COMPLETE_MEALS", "Complete meals (plates)"], ["PACKAGED", "Packaged food (items)"], ["COMPONENTS", "Components (rice, dal, bread…)"]]} required />
        {cat === "COMPLETE_MEALS" && <Input name="plates" label="Complete-meal plates requested" type="number" min={1} defaultValue={s("plates")} required />}
        {cat === "PACKAGED" && <Input name="packagedUnits" label="Packaged items requested" type="number" min={1} defaultValue={s("packagedUnits")} required />}
        {cat === "COMPONENTS" && <div className="sm:col-span-2"><Components initial={(d.components as Comp[]) ?? []} /></div>}
        <Select name="dietPref" label="Diet" defaultValue={s("dietPref") ?? "VEG"} options={[["VEG", "Vegetarian only"], ["VEGAN", "Vegan only"], ["NONVEG", "Non-veg accepted"], ["ANY", "Any"]]} />
        <Input name="otherDietary" label="Other dietary requirements" defaultValue={s("otherDietary")} />
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Strict exclusions (food with unknown allergen info will not match)</legend>
          <div className="grid grid-cols-2 sm:grid-cols-5">{ALLERGENS.map((a) => <Check key={a} name="exclusions" value={a} label={a.replace("_", " ")} defaultChecked={excl.includes(a)} />)}</div>
        </fieldset>
        <Check name="partialOk" label="Partial fulfilment is useful" defaultChecked={d.partialOk !== false} />
        <Input name="minUseful" label="Minimum useful amount (per line)" type="number" min={1} defaultValue={s("minUseful") ?? "1"} />
      </section>

      {!rec && (
        <section className="grid gap-4 sm:grid-cols-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-3">3 · Timing (your organisation&apos;s local time)</h2>
          <Input name="receiveFrom" label="Receiving window opens" type="datetime-local" defaultValue={s("receiveFrom")} required />
          <Input name="latestDelivery" label="Latest acceptable delivery" type="datetime-local" defaultValue={s("latestDelivery")} required />
          <Input name="servingTime" label="Intended serving time" type="datetime-local" defaultValue={s("servingTime")} required />
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2">4 · Collection or delivery</h2>
        <Select name="fulfilment" label="How will food reach you?" value={ful} onChange={(e) => setFul(e.target.value)} options={[["DELIVERY", "Delivery requested"], ["PICKUP_BY_ORG", "We collect"]]} />
        <Select name="transportFunding" label="Transport funding preference" defaultValue={s("transportFunding") ?? "ORG"} options={[["ORG", "We pay"], ["RESTAURANT", "Restaurant may pay"], ["SPONSOR", "Seek a sponsor"], ["PLATFORM", "Request platform budget"], ["UNDECIDED", "Undecided"]]} />
        {ful === "DELIVERY" && <Input name="deliveryAddress" label="Delivery address" defaultValue={s("deliveryAddress")} wrap="sm:col-span-2" required />}
        <Input name="receivingContact" label="Receiving contact (name + phone)" defaultValue={s("receivingContact")} required={ful === "DELIVERY"} />
        <Input name="maxDistanceKm" label="Distance limit (km)" type="number" step="0.5" defaultValue={s("maxDistanceKm")} />
        <Input name="lat" label="Latitude (optional, defaults to branch)" defaultValue={s("lat")} />
        <Input name="lng" label="Longitude (optional)" defaultValue={s("lng")} />
        <Input name="storageNotes" label="Storage / reheating capability" defaultValue={s("storageNotes")} />
        <Input name="containers" label="Suitable containers" defaultValue={s("containers")} />
        <TextArea name="unloading" label="Unloading instructions" defaultValue={s("unloading")} wrap="sm:col-span-2" />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">5 · Priority</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="urgent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-4 w-4" /> Request urgent priority (reviewed by the platform; not automatic)</label>
        {urgent && <Input name="urgencyReason" label="Why is this urgent?" defaultValue={s("urgencyReason")} required />}
      </section>

      <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-3 border-t border-line bg-white/95 px-5 py-3">
        <button type="submit" name="intent" value="publish" className="btn btn-accent">{rec ? "Create recurring schedule" : "Publish ticket"}</button>
        {!rec && <button type="submit" name="intent" value="draft" className="btn btn-ghost">Save draft</button>}
        <span className="text-xs text-muted-foreground">Publishing a need does not guarantee supply.</span>
      </div>
    </ActionForm>
  );
}
