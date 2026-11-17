import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { fmtMoney } from "@/lib/time";
import { parseJson } from "@/lib/domain";
import { getPolicy } from "@/lib/policy";
import { quote } from "@/services/marketplace";
import { ActionForm, Input, Select, Submit, TextArea } from "@/components/form";
import { Badge, Card, Empty, PageHeader } from "@/components/kit";
import { saveRuleAction } from "@/app/actions/ops";

export const metadata = { title: "Discount rules" };

export default async function Discounts() {
  const g = await gate(["SUPERMARKET"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  const policy = await getPolicy();
  const rules = await db.discountRule.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ active: "desc" }, { version: "desc" }] });
  const sample = { originalPriceMinor: 10000, expiryDate: new Date(0) };
  const ref = new Date(0);
  return (
    <div className="space-y-5">
      <PageHeader title="Discount rules" subtitle={`Most specific rule wins: batch → category → store default. Platform cap ${policy.maxDiscountPct}%.`} />
      {!rules.length ? <Empty title="No rules — items sell at original price" /> : rules.map((r) => {
        const tt = parseJson<{ maxDaysLeft: number; pct: number }[]>(r.timeTiers, []);
        const qt = parseJson<{ minQty: number; pct: number }[]>(r.qtyTiers, []);
        return (
          <Card key={r.id} title={<>{r.batchId ? `Batch ${r.batchId.slice(-6)}` : r.category ? `Category: ${r.category}` : "Store default"} · v{r.version} {r.active ? <Badge tone="green">active</Badge> : <Badge>superseded</Badge>} {r.illustrative && <Badge tone="amber">illustrative seed</Badge>}</>}>
            <p className="text-sm">Time tiers: {tt.map((t) => `≤${t.maxDaysLeft}d → ${t.pct}%`).join(", ") || "none"} · Volume tiers: {qt.map((t) => `≥${t.minQty} → ${t.pct}%`).join(", ") || "none"} · cap {r.maxPct}% · floor {fmtMoney(r.floorMinor)}</p>
            <div className="mt-2 overflow-x-auto"><table className="data"><thead><tr><th>Preview (₹100 item)</th>{[1, 5, 20].map((q) => <th key={q}>qty {q}</th>)}</tr></thead>
              <tbody>{[1, 3, 7, 14].map((d) => (
                <tr key={d}><td>{d} day(s) left</td>{[1, 5, 20].map((q) => <td key={q}>{fmtMoney(quote({ ...sample, expiryDate: new Date(ref.getTime() + d * 86400000 - 1000) }, r, q, ref, policy.maxDiscountPct).unitMinor)}</td>)}</tr>
              ))}</tbody></table></div>
          </Card>
        );
      })}
      {["OWNER", "MANAGER"].includes(ctx.role) && (
        <Card title="Create / replace a rule (new version)">
          <ActionForm action={saveRuleAction} className="grid gap-3 sm:grid-cols-2">
            <Select name="scope" label="Applies to" options={[["STORE", "Store default"], ["CATEGORY", "A category"], ["BATCH", "A single batch"]]} />
            <Input name="category" label="Category (if category scope)" />
            <Input name="batchId" label="Batch id (if batch scope)" />
            <Input name="maxPct" label="Maximum combined discount %" type="number" defaultValue="50" />
            <TextArea name="timeTiers" label="Time tiers (JSON)" defaultValue='[{"maxDaysLeft":1,"pct":40},{"maxDaysLeft":3,"pct":20}]' />
            <TextArea name="qtyTiers" label="Volume tiers (JSON; discount must not drop as quantity rises)" defaultValue='[{"minQty":10,"pct":5}]' />
            <Input name="floorInr" label="Price floor per unit (₹)" type="number" step="0.01" defaultValue="0" />
            <div className="sm:col-span-2"><Submit>Save rule</Submit></div>
          </ActionForm>
          <p className="mt-2 text-xs text-muted-foreground">Existing orders keep the price snapshot and rule version they were placed with.</p>
        </Card>
      )}
    </div>
  );
}
