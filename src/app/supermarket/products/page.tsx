import { db } from "@/lib/db";
import { gate } from "@/lib/gate";
import { fmtDate, fmtMoney, now } from "@/lib/time";
import { unitLabel } from "@/lib/domain";
import { ActionForm, Input, Select, Submit } from "@/components/form";
import { A, Card, Empty, Notice, PageHeader, Status } from "@/components/kit";
import { addBatchAction, batchStatusAction, createProductAction } from "@/app/actions/ops";
import { PhotoPicker } from "@/components/photo-client";
import { Cover, PhotoManager } from "@/components/photos";
import { imagesFor } from "@/services/files";

export const metadata = { title: "Products & batches" };

const BatchFields = () => (
  <>
    <Input name="batchCode" label="Batch code" required />
    <Input name="quantity" label="Quantity" type="number" min={1} required />
    <Input name="priceInr" label="Original price per unit (₹)" type="number" step="0.01" min={0} required />
    <Input name="minOrder" label="Minimum order" type="number" min={1} defaultValue="1" />
    <Input name="expiryDate" label="Expiry / use-by date" type="date" required />
    <Input name="bestBefore" label="Best-before (optional, separate)" type="date" />
    <Select name="storage" label="Storage" options={[["AMBIENT", "Ambient"], ["CHILLED", "Chilled"], ["FROZEN", "Frozen"]]} />
    <Input name="pickupLocation" label="Pickup location" />
  </>
);

export default async function Products({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const g = await gate(["SUPERMARKET"]);
  if ("deny" in g) return g.deny;
  const { ctx } = g;
  const { created } = await searchParams;
  const products = await db.product.findMany({ where: { tenantId: ctx.tenantId }, include: { batches: { orderBy: { expiryDate: "asc" } } }, orderBy: { name: "asc" } });
  const photos = await imagesFor("product", products.map((p) => p.id));
  const canWrite = ["OWNER", "MANAGER", "OPERATOR"].includes(ctx.role);
  const canManage = ["OWNER", "MANAGER"].includes(ctx.role);
  const at = now();
  return (
    <div className="space-y-5">
      <PageHeader title="Products & batches" subtitle="Each batch keeps its own expiry date, quantity and price. Expired, withdrawn or recalled batches are never sold." />
      {created && <Notice tone="green">Product created.</Notice>}
      {canWrite && (
        <Card title="New product with first batch">
          <ActionForm action={createProductAction} className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <Input name="name" label="Product name" required />
            <Input name="category" label="Category" required />
            <Select name="unit" label="Sold per" options={[["ITEM", "item"], ["KG", "kg"], ["LITRE", "litre"], ["PACK", "pack"]]} />
            <Input name="description" label="Description" />
            <BatchFields />
            <div className="sm:col-span-4"><PhotoPicker label="Product photos (optional)" /></div>
            <Submit>Create</Submit>
          </ActionForm>
        </Card>
      )}
      {!products.length ? <Empty title="No products yet" /> : products.map((p) => (
        <Card key={p.id} title={<span className="flex items-center gap-3"><Cover id={photos.get(p.id)?.[0]} alt={p.name} className="size-12 shrink-0 rounded-xl ring-1 ring-line" />{p.name} · {p.category}</span>} action={<span className="text-xs text-muted-foreground">per {unitLabel[p.unit]}</span>}>
          <details className="mb-4 rounded-2xl border border-line bg-cream/50 p-3" open={!photos.get(p.id)?.length && canWrite}>
            <summary className="cursor-pointer text-sm font-medium">Photos ({photos.get(p.id)?.length ?? 0})</summary>
            <div className="mt-3"><PhotoManager ids={photos.get(p.id) ?? []} target={{ productId: p.id }} canEdit={canWrite && ctx.verificationStatus === "APPROVED"} /></div>
          </details>
          <div className="overflow-x-auto"><table className="data">
            <thead><tr><th>Batch</th><th>Expiry</th><th>Stock (avail / reserved / sold / total)</th><th>Price</th><th>Status</th>{canManage && <th>Change status</th>}</tr></thead>
            <tbody>{p.batches.map((b) => (
              <tr key={b.id}>
                <td><A href={`/market/${b.id}`}>{b.batchCode}</A></td>
                <td>{fmtDate(b.expiryDate)}{b.expiryDate <= at && <div className="text-xs text-danger">expired</div>}</td>
                <td>{b.quantity - b.reservedQty - b.soldQty} / {b.reservedQty} / {b.soldQty} / {b.quantity}</td>
                <td>{fmtMoney(b.originalPriceMinor)}</td>
                <td><Status s={b.status} /></td>
                {canManage && (
                  <td>{b.status !== "RECALLED" && (
                    <ActionForm action={batchStatusAction} className="flex flex-wrap items-end gap-1">
                      <input type="hidden" name="batchId" value={b.id} />
                      <Select name="status" label="Status" options={[["WITHDRAWN", "Withdraw"], ["RECALLED", "Recall (cancels open orders)"], ["ACTIVE", "Re-activate"]]} />
                      <Input name="reason" label="Reason" />
                      <Submit variant="ghost">Apply</Submit>
                    </ActionForm>
                  )}</td>
                )}
              </tr>
            ))}</tbody>
          </table></div>
          {canWrite && (
            <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-forest">Add a batch</summary>
              <ActionForm action={addBatchAction} className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end" resetOnSuccess>
                <input type="hidden" name="productId" value={p.id} />
                <BatchFields />
                <Submit variant="ghost">Add batch</Submit>
              </ActionForm>
            </details>
          )}
        </Card>
      ))}
    </div>
  );
}
