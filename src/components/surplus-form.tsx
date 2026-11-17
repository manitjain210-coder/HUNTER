"use client";

import { useState } from "react";
import { ActionForm, Check, Input, Select, Submit, TextArea, useFormState } from "./form";
import { ALLERGENS } from "@/lib/domain";
import { surplusAction } from "@/app/actions/donation";
import { PhotoPicker } from "./photo-client";

type Item = { name: string; kind: string; unit: string; quantity: number | string; servingDesc: string; ingredients: string; allergens: string[]; allergensUnknown: boolean };
const blank: Item = { name: "", kind: "MEAL", unit: "PLATES", quantity: "", servingDesc: "", ingredients: "", allergens: [], allergensUnknown: false };

function Items({ initial, confirmed }: { initial: Item[]; confirmed: boolean }) {
  const [rows, setRows] = useState<Item[]>(initial.length ? initial : [{ ...blank }]);
  const fe = useFormState()?.fieldErrors ?? {};
  const set = (i: number, patch: Partial<Item>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Food items {confirmed ? "(actual confirmed quantities)" : "(estimates)"}</legend>
      <input type="hidden" name="items" value={JSON.stringify(rows.map((r) => ({ ...r, quantity: Number(r.quantity) })))} />
      {rows.map((r, i) => (
        <div key={i} className="rounded-xl border border-line p-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="text-sm">Name<input className="input mt-1" value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Veg thali / Rice / Dal" /></label>
            <label className="text-sm">Type
              <select className="input mt-1" value={r.kind} onChange={(e) => set(i, { kind: e.target.value, unit: e.target.value === "MEAL" ? "PLATES" : e.target.value === "PACKAGED" ? "PIECES" : "KG" })}>
                <option value="MEAL">Complete meal</option><option value="COMPONENT">Component</option><option value="PACKAGED">Packaged</option>
              </select>
            </label>
            <label className="text-sm">Unit
              <select className="input mt-1" value={r.unit} onChange={(e) => set(i, { unit: e.target.value })}>
                {(r.kind === "MEAL" ? [["PLATES", "plates"]] : [["KG", "kg"], ["LITRES", "litres"], ["PIECES", "pieces"], ["PORTIONS", "component portions"]]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="text-sm">Quantity<input className="input mt-1" type="number" min={1} value={r.quantity} onChange={(e) => set(i, { quantity: e.target.value })} /></label>
            <label className="text-sm sm:col-span-2">Serving size (if relevant)<input className="input mt-1" value={r.servingDesc} onChange={(e) => set(i, { servingDesc: e.target.value })} placeholder="≈350 g per plate" /></label>
            <label className="text-sm sm:col-span-2">Ingredients<input className="input mt-1" value={r.ingredients} onChange={(e) => set(i, { ingredients: e.target.value })} /></label>
          </div>
          <div className="mt-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.allergensUnknown} onChange={(e) => set(i, { allergensUnknown: e.target.checked, allergens: e.target.checked ? [] : r.allergens })} className="h-4 w-4" /> Allergen information unknown (will not match any ticket with exclusions)</label>
            {!r.allergensUnknown && (
              <div className="mt-1 flex flex-wrap gap-3 text-sm" role="group" aria-label={`Allergens in ${r.name || "item"}`}>
                {ALLERGENS.map((a) => (
                  <label key={a} className="flex items-center gap-1"><input type="checkbox" checked={r.allergens.includes(a)} onChange={(e) => set(i, { allergens: e.target.checked ? [...r.allergens, a] : r.allergens.filter((x) => x !== a) })} /> {a.replace("_", " ")}</label>
                ))}
              </div>
            )}
          </div>
          {Object.entries(fe).filter(([k]) => k.startsWith(`items.${i}.`)).map(([k, v]) => <p key={k} className="text-xs text-danger">{k.split(".").pop()}: {v}</p>)}
          {rows.length > 1 && <button type="button" className="btn btn-ghost mt-2" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove item</button>}
        </div>
      ))}
      <button type="button" className="btn btn-ghost" onClick={() => setRows([...rows, { ...blank }])}>Add item</button>
      {fe.items && <p className="text-xs text-danger">{fe.items}</p>}
    </fieldset>
  );
}

export function SurplusForm({ mode, lotId, d, initialItems }: { mode: "EXPECTED" | "READY"; lotId?: string; d: Record<string, string>; initialItems: Item[] }) {
  return (
    <ActionForm action={surplusAction} className="space-y-6">
      <input type="hidden" name="stage" value={mode} />
      {lotId && <input type="hidden" name="lotId" value={lotId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="title" label="Batch title" defaultValue={d.title} required />
        <Select name="dietCategory" label="Diet" defaultValue={d.dietCategory ?? "VEG"} options={[["VEG", "Vegetarian"], ["VEGAN", "Vegan"], ["NONVEG", "Non-vegetarian"]]} />
        {mode === "EXPECTED" ? (
          <>
            <Input name="expectedFrom" label="Probably available from" type="datetime-local" defaultValue={d.expectedFrom} required />
            <Input name="expectedUntil" label="Until" type="datetime-local" defaultValue={d.expectedUntil} required />
          </>
        ) : (
          <>
            <Select name="storage" label="Holding condition" defaultValue={d.storage ?? "HOT_HELD"} options={[["HOT_HELD", "Hot-held"], ["CHILLED", "Chilled"], ["AMBIENT", "Ambient (shelf-stable)"]]} />
            <Input name="packaging" label="Packaging" defaultValue={d.packaging} placeholder="Sealed food-grade containers" required />
            <Input name="preparedAt" label="Prepared at" type="datetime-local" defaultValue={d.preparedAt} required />
            <Input name="readyAt" label="Ready for collection at" type="datetime-local" defaultValue={d.readyAt} required />
            <Input name="pickupDeadline" label="Collection deadline" type="datetime-local" defaultValue={d.pickupDeadline} required hint="Your batch-specific deadline. The 1-hour target is operational only." />
            <Input name="consumeBy" label="Must be consumed by" type="datetime-local" defaultValue={d.consumeBy} required />
          </>
        )}
        <TextArea name="notes" label="Notes" defaultValue={d.notes} wrap="sm:col-span-2" />
      </div>
      <Items initial={initialItems} confirmed={mode === "READY"} />
      {!lotId && (
        <div>
          <PhotoPicker label="Photos of the food (optional)" />
          <p className="mt-1 text-xs text-muted-foreground">Photos help organisations recognise the food at handover. They do not show that food is safe; the handling declaration does that.</p>
        </div>
      )}
      {mode === "READY" && (
        <div className="rounded-xl border border-coral/30 bg-coral-50 p-3">
          <Check name="handlingDeclaration" label="I confirm this is safe, unused food that has never been served to customers (no plate scrapings or returned food), prepared and held as declared above. I understand photos do not establish safety." />
        </div>
      )}
      <Submit variant="accent">{mode === "READY" ? "Confirm ready for collection" : "Save expected surplus"}</Submit>
    </ActionForm>
  );
}
