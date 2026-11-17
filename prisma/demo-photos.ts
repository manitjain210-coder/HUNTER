// Attaches a matching photo (prisma/demo-photos/<slug>.jpg, picked by keyword in the name) to every demo product and surplus batch that has none.
// Runs at the end of the seed; also runnable on an already-seeded database: `npx tsx prisma/demo-photos.ts`.
// Photos are from Wikimedia Commons; licences and authors are in prisma/demo-photos/CREDITS.md.
import { PrismaClient } from "@prisma/client";
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

// First keyword found in the name wins, so put specific dishes before generic words like "rice".
const PRODUCTS: [RegExp, string][] = [
  [/milk/, "milk"], [/bread/, "bread"], [/tomato/, "tomatoes"], [/curd/, "curd"], [/paneer/, "paneer"], [/banana/, "bananas"],
  [/atta|flour/, "atta"], [/yog(h)?urt/, "yoghurt"], [/snack|namkeen|mix/, "snack"], [/rice/, "rice"],
];
const LOTS: [RegExp, string][] = [
  [/biryani/, "biryani"], [/thali/, "thali"], [/paneer/, "paneer-jeera"], [/pulao/, "pulao"], [/lemon rice/, "lemon-rice"],
  [/idli|dosa/, "idli"], [/dal/, "rice-dal"], [/buffet/, "buffet"], [/meal/, "mixed-meals"],
];
const pick = (list: [RegExp, string][], name: string) => list.find(([re]) => re.test(name.toLowerCase()))?.[1];

export async function attachDemoPhotos(db: PrismaClient) {
  const dir = path.join(__dirname, "demo-photos");
  const root = path.resolve(process.env.UPLOAD_DIR ?? "./storage/uploads");
  await mkdir(root, { recursive: true });
  const owner = async (tenantId: string) => (await db.membership.findFirst({ where: { tenantId, role: "OWNER" } }))?.userId;
  let added = 0;
  async function attach(tenantId: string, slug: string, target: { productId?: string; lotId?: string }, purpose: string) {
    const src = path.join(dir, `${slug}.jpg`);
    const uploadedById = await owner(tenantId);
    if (!existsSync(src) || !uploadedById) return;
    const storageName = `${randomBytes(16).toString("hex")}.jpg`;
    await copyFile(src, path.join(root, storageName));
    await db.storedFile.create({ data: { tenantId, purpose, originalName: `${slug}.jpg`, storageName, mime: "image/jpeg", size: statSync(src).size, uploadedById, ...target } });
    added++;
  }
  for (const p of await db.product.findMany({ where: { tenant: { isDemo: true } } })) {
    const slug = pick(PRODUCTS, p.name);
    if (slug && !(await db.storedFile.count({ where: { productId: p.id } }))) await attach(p.tenantId, slug, { productId: p.id }, "PRODUCT_IMAGE");
  }
  for (const l of await db.surplusLot.findMany({ where: { tenant: { isDemo: true } } })) {
    const slug = pick(LOTS, l.title);
    if (slug && !(await db.storedFile.count({ where: { lotId: l.id } }))) await attach(l.tenantId, slug, { lotId: l.id }, "SURPLUS_IMAGE");
  }
  return added;
}

if (require.main === module) {
  const db = new PrismaClient();
  attachDemoPhotos(db).then((n) => console.log(`Attached ${n} demo photos.`)).finally(() => db.$disconnect());
}
