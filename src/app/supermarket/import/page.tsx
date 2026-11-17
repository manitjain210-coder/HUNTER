import { gate } from "@/lib/gate";
import { Card, PageHeader } from "@/components/kit";
import { ImportForm } from "./import-form";

export const metadata = { title: "Stock import" };

export default async function Import() {
  const g = await gate(["SUPERMARKET"], ["OWNER", "MANAGER"]);
  if ("deny" in g) return g.deny;
  return (
    <div className="max-w-4xl">
      <PageHeader title="CSV stock import" subtitle="Preview first. Nothing is applied unless every row is valid." />
      <Card>
        <p className="mb-3 text-sm">Columns: <code className="rounded bg-sand px-1">product_name,category,unit,batch_code,quantity,price_inr,min_order,expiry_date,storage,pickup_location</code>. Unit: ITEM, KG, LITRE or PACK. Dates: YYYY-MM-DD.</p>
        <ImportForm />
      </Card>
    </div>
  );
}
