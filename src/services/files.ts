import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { type Actor } from "@/lib/authz";
import { forbidden, invalid, notFound } from "@/lib/domain";

// Local storage adapter. shortcut: local disk only; swap readBytes/writeBytes for object storage in multi-instance deployments.
const ROOT = () => path.resolve(process.env.UPLOAD_DIR ?? "./storage/uploads");
async function writeBytes(name: string, bytes: Uint8Array) {
  await mkdir(ROOT(), { recursive: true });
  await writeFile(path.join(ROOT(), name), bytes, { flag: "wx" });
}
const readBytes = (name: string) => readFile(path.join(ROOT(), name));
// On Vercel (read-only disk) bytes live in StoredFile.data. shortcut: database rows hold files, fine for photos/PDFs under 5 MB; move to object storage at scale.
const inDb = () => !!process.env.VERCEL || process.env.FILE_STORE === "db";
async function stash(name: string, bytes: Uint8Array) {
  if (inDb()) return { data: Buffer.from(bytes) };
  await writeBytes(name, bytes);
  return {};
}

export const MAX_UPLOAD = 5 * 1024 * 1024;
const SIGNATURES: { mime: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  { mime: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", test: (b) => String.fromCharCode(...b.slice(8, 12)) === "WEBP" },
];

/** Validate by size and magic bytes (not by client-sent type). No malware scanning is performed. */
export function sniff(bytes: Uint8Array) {
  if (!bytes.length) throw invalid("The file is empty.");
  if (bytes.length > MAX_UPLOAD) throw invalid("Files must be 5 MB or smaller.");
  const sig = SIGNATURES.find((s) => s.test(bytes));
  if (!sig) throw invalid("Only PDF, PNG, JPEG or WebP files are accepted.");
  if (sig.mime === "application/pdf" && /\/JavaScript|\/JS\s|\/Launch|\/EmbeddedFile/.test(Buffer.from(bytes).toString("latin1")))
    throw invalid("PDFs with scripts, launch actions or embedded files are not accepted.");
  return sig;
}

export async function saveUpload(
  actor: Actor,
  opts: { tenantId: string; purpose: "VERIFICATION" | "EVIDENCE"; kind?: string; jobId?: string; file: { name: string; bytes: Uint8Array } },
) {
  const sig = sniff(opts.file.bytes);
  const storageName = `${randomBytes(16).toString("hex")}.${sig.ext}`;
  const stored = await stash(storageName, opts.file.bytes);
  const rec = await db.storedFile.create({
    data: {
      ...stored,
      tenantId: opts.tenantId, purpose: opts.purpose, kind: opts.kind ?? "", jobId: opts.jobId,
      originalName: opts.file.name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "file", storageName, mime: sig.mime, size: opts.file.bytes.length, uploadedById: actor.userId,
    },
  });
  await audit(db, { actorId: actor.userId, tenantId: opts.tenantId, action: "file.upload", entityType: "StoredFile", entityId: rec.id, data: { purpose: opts.purpose } });
  return rec;
}

// ---------------- Product and surplus photos ----------------

export const MAX_IMAGES = 6;
const WRITE_ROLES = ["OWNER", "MANAGER", "OPERATOR"];

/** Photos: PNG/JPEG/WebP only, checked by magic bytes. */
export function sniffImage(bytes: Uint8Array) {
  const sig = sniff(bytes);
  if (!sig.mime.startsWith("image/")) throw invalid("Photos must be PNG, JPEG or WebP.");
  return sig;
}

/**
 * Attach a photo to a supermarket product or a restaurant surplus batch. Only the owning business's
 * staff (owner/manager/operator) can add photos. Photos never establish food safety.
 */
export async function addImage(actor: Actor, target: { productId?: string; lotId?: string }, file: { name: string; bytes: Uint8Array }) {
  const c = actor.ctx;
  if (!c || !WRITE_ROLES.includes(c.role) || c.verificationStatus !== "APPROVED") throw forbidden("Only approved business staff can add photos.");
  const sig = sniffImage(file.bytes);
  let purpose: "PRODUCT_IMAGE" | "SURPLUS_IMAGE";
  if (target.productId) {
    if (c.tenantKind !== "SUPERMARKET" || !(await db.product.findFirst({ where: { id: target.productId, tenantId: c.tenantId } }))) throw notFound();
    purpose = "PRODUCT_IMAGE";
  } else if (target.lotId) {
    if (c.tenantKind !== "RESTAURANT" || !(await db.surplusLot.findFirst({ where: { id: target.lotId, tenantId: c.tenantId } }))) throw notFound();
    purpose = "SURPLUS_IMAGE";
  } else throw invalid("Choose what the photo is for.");
  const where = target.productId ? { productId: target.productId } : { lotId: target.lotId };
  const count = await db.storedFile.count({ where: { ...where, purpose } });
  if (count >= MAX_IMAGES) throw invalid(`Up to ${MAX_IMAGES} photos. Remove one first.`);
  const storageName = `${randomBytes(16).toString("hex")}.${sig.ext}`;
  const stored = await stash(storageName, file.bytes);
  const rec = await db.storedFile.create({
    data: {
      ...stored,
      tenantId: c.tenantId, purpose, ...where, sortOrder: count, storageName, mime: sig.mime, size: file.bytes.length, uploadedById: actor.userId,
      originalName: file.name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "photo",
    },
  });
  await audit(db, { actorId: actor.userId, tenantId: c.tenantId, action: "image.add", entityType: "StoredFile", entityId: rec.id, data: where });
  return rec;
}

/** Remove a photo, or make it the cover (sortOrder 0). Owning business staff only. */
export async function changeImage(actor: Actor, fileId: string, op: "remove" | "cover") {
  const c = actor.ctx;
  if (!c || !WRITE_ROLES.includes(c.role)) throw forbidden();
  const f = await db.storedFile.findFirst({ where: { id: fileId, tenantId: c.tenantId, purpose: { in: ["PRODUCT_IMAGE", "SURPLUS_IMAGE"] } } });
  if (!f) throw notFound();
  const siblings = { purpose: f.purpose, ...(f.productId ? { productId: f.productId } : { lotId: f.lotId }) };
  if (op === "remove") {
    await db.storedFile.delete({ where: { id: f.id } }); // bytes stay on disk; shortcut: add a cleanup job if storage grows
  } else {
    await db.storedFile.updateMany({ where: { ...siblings, sortOrder: { lt: f.sortOrder } }, data: { sortOrder: { increment: 1 } } });
    await db.storedFile.update({ where: { id: f.id }, data: { sortOrder: 0 } });
  }
  await audit(db, { actorId: actor.userId, tenantId: c.tenantId, action: `image.${op}`, entityType: "StoredFile", entityId: f.id });
}

/** Photo ids for many products/lots at once, cover first. */
export async function imagesFor(kind: "product" | "lot", ids: string[]) {
  if (!ids.length) return new Map<string, string[]>();
  const files = await db.storedFile.findMany({
    where: kind === "product" ? { purpose: "PRODUCT_IMAGE", productId: { in: ids } } : { purpose: "SURPLUS_IMAGE", lotId: { in: ids } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, productId: true, lotId: true },
  });
  const m = new Map<string, string[]>();
  for (const f of files) {
    const k = (kind === "product" ? f.productId : f.lotId)!;
    m.set(k, [...(m.get(k) ?? []), f.id]);
  }
  return m;
}

/**
 * Product photos: public (they sell to everyone). Surplus photos: any signed-in member of an approved
 * organisation, or admin — never anonymous visitors or personal buyers.
 * Verification docs: tenant OWNER/COORDINATOR/MANAGER or admin. Evidence: admin, owning tenant, or the job's collector.
 */
export async function authorizeFile(actor: Actor | null, fileId: string) {
  const f = await db.storedFile.findUnique({ where: { id: fileId }, include: { tenant: { select: { verificationStatus: true } } } });
  if (!f) throw notFound();
  if (f.purpose === "PRODUCT_IMAGE" && f.tenant.verificationStatus === "APPROVED") return f;
  if (!actor) throw forbidden();
  if (actor.isAdmin) return f;
  if (f.purpose === "SURPLUS_IMAGE" && (actor.ctx?.tenantId === f.tenantId || actor.ctx?.verificationStatus === "APPROVED")) return f;
  const m = await db.membership.findFirst({ where: { userId: actor.userId, tenantId: f.tenantId, active: true } });
  if (f.purpose === "VERIFICATION" && m && ["OWNER", "COORDINATOR", "MANAGER"].includes(m.role)) return f;
  if (f.purpose === "EVIDENCE") {
    if (m && m.role !== "VIEWER") return f;
    if (f.jobId && (await db.deliveryJob.findFirst({ where: { id: f.jobId, collectorId: actor.userId } }))) return f;
  }
  throw forbidden();
}

export async function readFileFor(actor: Actor | null, fileId: string) {
  const f = await authorizeFile(actor, fileId);
  return { meta: f, bytes: f.data ?? (await readBytes(f.storageName)) };
}
