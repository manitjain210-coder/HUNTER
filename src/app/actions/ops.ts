"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { invalid } from "@/lib/domain";
import { formToObj, type FormState } from "@/lib/form-state";
import { demoMode } from "@/lib/session";
import { audit } from "@/lib/audit";
import { requireAdmin, requireCtx } from "@/lib/authz";
import * as lg from "@/services/logistics";
import * as mk from "@/services/marketplace";
import * as adm from "@/services/admin";
import { saveUpload, addImage, changeImage } from "@/services/files";
import { runSweep } from "@/services/worker";
import { run, s, n } from "./run";

// ---------- Logistics ----------
export async function createJobAction(_: FormState, f: FormData): Promise<FormState> {
  let id = "";
  const r = await run(async (a) => {
    const job = await lg.createJob(a, { allocationIds: f.getAll("allocationIds").map(String), mode: s(f, "mode") || "PLATFORM_DISPATCH", quoteMinor: Math.round(n(f, "quoteInr") * 100) || 0 });
    id = job.id;
  });
  if (r?.error) return r;
  redirect(`/logistics/jobs/${id}`);
}
export const saveRouteAction = async (_: FormState, f: FormData) =>
  run(async (a) => {
    const order = s(f, "order").trim() ? s(f, "order").split(",").map((x) => x.trim()) : null;
    const r = await lg.saveRoute(a, s(f, "jobId"), order, f.get("capacityKg") ? n(f, "capacityKg") : undefined);
    return r.feasible ? "Route approved (suggested order; straight-line estimates, not road routing)." : `Route saved but NOT feasible: ${r.failures.join("; ")}. Consider manual assignment or splitting the job.`;
  });
export const addFundingAction = async (_: FormState, f: FormData) => run(async (a) => void (await lg.addFunding(a, s(f, "jobId"), { payerType: s(f, "payerType"), amountMinor: Math.round(n(f, "amountInr") * 100), sponsorName: s(f, "sponsorName") })), "Funding commitment recorded (a commitment record, not proof of payment).");
export const confirmReceiverAction = async (_: FormState, f: FormData) => run((a) => lg.confirmReceiver(a, s(f, "jobId")), "Receiving confirmed.");
export const assignAction = async (_: FormState, f: FormData) => run((a) => lg.assignCollector(a, s(f, "jobId"), s(f, "collectorId"), s(f, "vehicleId") || null), "Collector assigned.");
export const collectorAcceptAction = async (_: FormState, f: FormData) => run((a) => lg.collectorAccept(a, s(f, "jobId")), "Job accepted.");
export const arriveAction = async (_: FormState, f: FormData) => run((a) => lg.arriveAtPickup(a, s(f, "jobId"), s(f, "stopId")), "Arrival recorded.");
export const pickupAction = async (_: FormState, f: FormData) =>
  run(async (a) => {
    const qty: Record<string, number> = {};
    for (const [k, v] of f.entries()) if (k.startsWith("qty_")) qty[k.slice(4)] = Number(v);
    const evidenceId = await maybeEvidence(a, f);
    const r = await lg.recordPickup(a, s(f, "jobId"), s(f, "stopId"), qty, s(f, "notes"), evidenceId);
    return `Pickup recorded: ${r.total} collected.${r.remainingPickups ? ` ${r.remainingPickups} pickup stop(s) left.` : ""}`;
  });
export const transitAction = async (_: FormState, f: FormData) => run((a) => lg.startTransit(a, s(f, "jobId")), "In transit.");
export const deliveredAction = async (_: FormState, f: FormData) => run(async (a) => lg.markDelivered(a, s(f, "jobId"), s(f, "stopId"), s(f, "notes"), await maybeEvidence(a, f)), "Arrival at drop-off recorded. The receiver now records what they accept.");
export const receiptAction = async (_: FormState, f: FormData) =>
  run(async (a) => {
    const lines: Record<string, { accepted: number; rejected: number; reason?: string }> = {};
    for (const id of f.getAll("allocationIds").map(String)) lines[id] = { accepted: n(f, `acc_${id}`), rejected: n(f, `rej_${id}`), reason: s(f, `why_${id}`) };
    await lg.recordReceipt(a, s(f, "jobId"), s(f, "stopId"), lines, s(f, "condition"));
  }, "Receipt recorded.");
export const failJobAction = async (_: FormState, f: FormData) => run((a) => lg.failJob(a, s(f, "jobId"), s(f, "reason")), "Job marked failed. Operations will resolve any collected food.");
export const cancelJobAction = async (_: FormState, f: FormData) => run((a) => lg.cancelJob(a, s(f, "jobId"), s(f, "reason")), "Job cancelled; reservations are transport-pending again until their hold expires.");
export const resolveJobAction = async (_: FormState, f: FormData) => run((a) => lg.resolveJob(a, s(f, "jobId"), s(f, "resolution")), "Resolution recorded.");

async function maybeEvidence(a: Awaited<ReturnType<typeof import("@/lib/session").getActor>>, f: FormData) {
  const file = f.get("evidence");
  if (!(file instanceof File) || !file.size || !a) return undefined;
  const job = await db.deliveryJob.findUnique({ where: { id: s(f, "jobId") }, include: { stops: true } });
  if (!job || job.collectorId !== a.userId) throw invalid("Only the assigned collector can attach evidence.");
  const stop = job.stops.find((x) => x.id === s(f, "stopId"));
  const rec = await saveUpload(a, { tenantId: stop?.tenantId ?? job.stops[0].tenantId, purpose: "EVIDENCE", jobId: job.id, file: { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } });
  return rec.id;
}

// ---------- Marketplace ----------
export const addToCartAction = async (_: FormState, f: FormData) => run((a) => mk.addToCart(a, s(f, "batchId"), Math.round(n(f, "quantity"))), "Added to cart.");
export const removeCartAction = async (_: FormState, f: FormData) => run((a) => mk.removeFromCart(a, s(f, "itemId")), "Removed.");
export async function checkoutAction(_: FormState, f: FormData): Promise<FormState> {
  let first = "";
  const r = await run(async (a) => {
    const orders = await mk.checkout(a, s(f, "idem"));
    first = orders[0].id;
  });
  if (r?.error) return r;
  redirect(`/orders/${first}?placed=1`);
}
export const cancelOrderAction = async (_: FormState, f: FormData) => run((a) => mk.cancelOrder(a, s(f, "orderId"), s(f, "reason")), "Order cancelled; stock released.");
export const collectOrderAction = async (_: FormState, f: FormData) => run((a) => mk.confirmCollection(a, s(f, "orderId")), "Collection confirmed.");
export const recordPaymentAction = async (_: FormState, f: FormData) => run((a) => mk.recordPayment(a, s(f, "orderId"), { method: s(f, "method"), reference: s(f, "reference") }, demoMode()), "Payment recorded.");
export const confirmPaymentAction = async (_: FormState, f: FormData) => run((a) => mk.adminConfirmPayment(a, s(f, "orderId")), "Payment confirmed by admin.");
export async function createProductAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await run(async (a) => { const p = await mk.createProductWithBatch(a, formToObj(f)); await savePhotos(a, { productId: p.id }, f); });
  if (r?.error) return r;
  redirect("/supermarket/products?created=1");
}
export const addBatchAction = async (_: FormState, f: FormData) => run(async (a) => void (await mk.addBatch(a, s(f, "productId"), formToObj(f))), "Batch added.");
export const batchStatusAction = async (_: FormState, f: FormData) => run((a) => mk.setBatchStatus(a, s(f, "batchId"), s(f, "status") as "ACTIVE", s(f, "reason")), "Batch updated.");
export const saveRuleAction = async (_: FormState, f: FormData) => run(async (a) => void (await mk.saveDiscountRule(a, formToObj(f))), "Discount rule saved (new version). Existing orders keep their snapshot.");
export const importAction = async (_: FormState, f: FormData) =>
  run(async (a) => {
    const file = f.get("file");
    const text = file instanceof File && file.size ? await file.text() : s(f, "csv");
    if (text.length > 500_000) throw invalid("File too large (max 500 KB).");
    if (s(f, "intent") === "apply") return `Imported ${await mk.applyStockImport(a, text)} batch(es).`;
    const p = mk.parseStockCsv(text);
    if (p.headerError) throw invalid(p.headerError);
    return { ok: true, message: `${p.rows.filter((r) => !r.errors.length).length} valid, ${p.rows.filter((r) => r.errors.length).length} invalid. Nothing has been changed yet.`, data: { rows: p.rows.map((r) => ({ line: r.line, name: r.rec.product_name, batch: r.rec.batch_code, qty: r.rec.quantity, errors: r.errors })), csv: text } };
  });
export const watchlistAction = async (_: FormState, f: FormData) =>
  run(async (a) => {
    const c = requireCtx(a, ["RESTAURANT"], ["OWNER", "MANAGER", "OPERATOR"]);
    if (s(f, "op") === "delete") return void (await db.ingredientWatchlist.deleteMany({ where: { id: s(f, "id"), tenantId: c.tenantId } }));
    if (!s(f, "query").trim()) throw invalid("Enter an item to watch.", { query: "Required" });
    await db.ingredientWatchlist.create({ data: { tenantId: c.tenantId, query: s(f, "query").trim().slice(0, 80), category: s(f, "category") || null, quantity: f.get("quantity") ? Math.round(n(f, "quantity")) || null : null, unit: s(f, "unit") || null, requiredBy: s(f, "requiredBy") ? new Date(s(f, "requiredBy")) : null, minShelfDays: Math.max(0, Math.round(n(f, "minShelfDays")) || 0), radiusKm: f.get("radiusKm") ? n(f, "radiusKm") || null : null } });
  }, "Watchlist updated.");

// ---------- Admin & platform ----------
export const setPolicyAction = async (_: FormState, f: FormData) => run((a) => adm.setPolicy(a, s(f, "key"), s(f, "value"), s(f, "reason")), "Policy updated (new version).");
export const announceAction = async (_: FormState, f: FormData) => run(async (a) => void (await adm.postAnnouncement(a, formToObj(f))), "Announcement posted in-app.");
export const complaintAction = async (_: FormState, f: FormData) => run(async (a) => void (await adm.fileComplaint(a, formToObj(f))), "Report filed. Operations will review it.");
export const resolveComplaintAction = async (_: FormState, f: FormData) => run((a) => adm.resolveComplaint(a, s(f, "id"), s(f, "resolution")), "Resolved.");
export const resetPasswordAction = async (_: FormState, f: FormData) =>
  run(async (a) => ({ ok: true, message: `Temporary password (shown once — give it to the user in person/by phone and ask them to change it): ${await adm.adminResetPassword(a, s(f, "userId"))}` }));
export const sweepAction = async () => run(async (a) => { requireAdmin(a); return `Sweep finished: ${JSON.stringify(await runSweep())}`; });

export const markReadAction = async (_: FormState, f: FormData) =>
  run(async (a) => {
    const where = s(f, "id") ? { id: s(f, "id"), userId: a.userId } : { userId: a.userId, readAt: null };
    await db.notification.updateMany({ where, data: { readAt: new Date() } });
  }, "Marked as read.");
export const prefsAction = async (_: FormState, f: FormData) =>
  run(async (a) => {
    const types = ["offer", "match", "reservation", "transport", "receipt", "verification", "order", "ticket", "ops", "announcement"];
    const prefs = Object.fromEntries(types.map((t) => [t, f.get(t) === "on"]));
    await db.user.update({ where: { id: a.userId }, data: { notifyPrefs: JSON.stringify(prefs) } });
    await audit(db, { actorId: a.userId, action: "user.prefs", entityType: "User", entityId: a.userId });
  }, "Preferences saved.");

// ---------- Product & surplus photos ----------
async function savePhotos(a: Parameters<typeof addImage>[0], target: { productId?: string; lotId?: string }, f: FormData) {
  const files = f.getAll("photos").filter((x): x is File => x instanceof File && x.size > 0);
  for (const file of files) await addImage(a, target, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  return files.length;
}
export const addPhotosAction = async (_: FormState, f: FormData) =>
  run(async (a) => {
    const n = await savePhotos(a, s(f, "productId") ? { productId: s(f, "productId") } : { lotId: s(f, "lotId") }, f);
    if (!n) throw invalid("Choose at least one photo.", { photos: "Required" });
    return `${n} photo${n > 1 ? "s" : ""} added.`;
  });
export const changePhotoAction = async (_: FormState, f: FormData) =>
  run((a) => changeImage(a, s(f, "fileId"), s(f, "op") === "cover" ? "cover" : "remove"), s(f, "op") === "cover" ? "Cover photo set." : "Photo removed.");
