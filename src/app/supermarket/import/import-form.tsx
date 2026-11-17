"use client";

import { useActionState } from "react";
import { importAction } from "@/app/actions/ops";

type Row = { line: number; name: string; batch: string; qty: string; errors: string[] };

export function ImportForm() {
  const [state, action, pending] = useActionState(importAction, null);
  const rows = (state?.data?.rows as Row[] | undefined) ?? [];
  const csv = (state?.data?.csv as string | undefined) ?? "";
  const allValid = rows.length > 0 && rows.every((r) => !r.errors.length);
  return (
    <form action={action} className="space-y-3">
      <label htmlFor="csv" className="block text-sm font-medium">Paste CSV</label>
      <textarea id="csv" name="csv" rows={8} className="input font-mono text-xs" defaultValue={csv} key={csv} placeholder={"product_name,category,unit,batch_code,quantity,price_inr,min_order,expiry_date,storage,pickup_location\nToned milk,Dairy,LITRE,MILK-C,40,56,1,2026-12-01,CHILLED,Desk"} />
      <div><label htmlFor="file" className="block text-sm font-medium">…or upload a .csv file</label><input id="file" name="file" type="file" accept=".csv,text/csv" className="mt-1 text-sm" /></div>
      {state?.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.message && <p role="status" className="text-sm font-medium">{state.message}</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto"><table className="data">
          <thead><tr><th>Line</th><th>Product</th><th>Batch</th><th>Qty</th><th>Problems</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.line} className={r.errors.length ? "bg-red-50" : ""}><td>{r.line}</td><td>{r.name}</td><td>{r.batch}</td><td>{r.qty}</td><td className="text-xs text-danger">{r.errors.join("; ") || <span className="text-forest">OK</span>}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      <div className="flex gap-2">
        <button name="intent" value="preview" className="btn btn-ghost" disabled={pending}>Preview</button>
        <button name="intent" value="apply" className="btn btn-primary" disabled={pending || !allValid}>Apply import</button>
      </div>
    </form>
  );
}
