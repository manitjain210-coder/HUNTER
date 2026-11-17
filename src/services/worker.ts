import { db, tx } from "@/lib/db";
import { notify, memberIds, adminIds } from "@/lib/audit";
import { getPolicy } from "@/lib/policy";
import { addMin, now } from "@/lib/time";
import { releaseAllocation } from "./offers";
import { alertMatches, withdrawLot } from "./surplus";
import { generateRecurring } from "./tickets";
import { cancelOrderTx } from "./marketplace";

/**
 * Run one task at most once per key. A JobTask row is claimed with a conditional update, so two workers
 * (or a retry after a crash) cannot both run the same logical task. Stale RUNNING claims (>5 min) are retried.
 */
async function runOnce(type: string, key: string, fn: () => Promise<unknown>) {
  await db.jobTask.upsert({ where: { key }, create: { type, key }, update: {} });
  const stale = addMin(now(), -5);
  const claim = await db.jobTask.updateMany({
    where: { key, OR: [{ status: "PENDING" }, { status: "FAILED", attempts: { lt: 5 } }, { status: "RUNNING", lockedAt: { lt: stale } }] },
    data: { status: "RUNNING", lockedAt: now(), attempts: { increment: 1 } },
  });
  if (claim.count !== 1) return { skipped: true };
  try {
    const result = await fn();
    await db.jobTask.update({ where: { key }, data: { status: "DONE", result: JSON.stringify(result ?? null) } });
    return { result };
  } catch (e) {
    await db.jobTask.update({ where: { key }, data: { status: "FAILED", lastError: String((e as Error).message ?? e).slice(0, 1000) } });
    throw e;
  }
}

/** Release allocation holds past their deadline that have no active job. Holds on an active job alert ops instead. */
export async function releaseExpiredHolds(at = now()) {
  const due = await db.allocation.findMany({ where: { status: "RESERVED", holdExpiresAt: { lt: at } }, include: { job: true, ticket: true } });
  let released = 0, flagged = 0;
  for (const a of due) {
    const activeJob = a.job && !["CANCELLED", "FAILED"].includes(a.job.status);
    if (activeJob) {
      await notify(db, { userIds: await adminIds(), type: "ops", title: "Reservation hold expired while a job is active", body: `Job ${a.jobId}`, link: `/logistics/jobs/${a.jobId}`, dedupeKey: `holdstall:${a.id}` });
      flagged++;
      continue;
    }
    const ok = await tx((t) => releaseAllocation(t, a.id, "Reservation hold expired before collection", null));
    if (ok) {
      released++;
      await notify(db, { userIds: await memberIds(db, a.ticket.tenantId, ["OWNER", "COORDINATOR"]), type: "reservation", title: "Reservation expired (no transport arranged in time)", link: `/org/tickets/${a.ticketId}`, dedupeKey: `holdexp:${a.id}` });
    }
  }
  return { released, flagged };
}

export async function expireOffers(at = now()) {
  return (await db.offer.updateMany({ where: { status: "PROPOSED", expiresAt: { lt: at } }, data: { status: "EXPIRED", decidedAt: at } })).count;
}

/** Lots past pickup deadline leave human-food distribution with a recorded reason. Deadlines are never extended. */
export async function expireLots(at = now()) {
  const lots = await db.surplusLot.findMany({ where: { stage: "READY", pickupDeadline: { lt: at } } });
  for (const l of lots) await withdrawLot(null, l.id, "Pickup deadline passed without a safe collection", true);
  const est = await db.surplusLot.updateMany({ where: { stage: "EXPECTED", expectedUntil: { lt: at } }, data: { stage: "EXPIRED", closeReason: "Estimate window passed without confirmation" } });
  return { ready: lots.length, expected: est.count };
}

/** Escalate alerts in waves while nothing is accepted. */
export async function escalate(at = now()) {
  const policy = await getPolicy();
  const lots = await db.surplusLot.findMany({ where: { stage: "READY", pickupDeadline: { gt: at } }, include: { offers: true } });
  let waves = 0;
  for (const l of lots) {
    if (l.offers.some((o) => o.status === "ACCEPTED")) continue;
    const since = l.confirmedAt ?? l.createdAt;
    const due = 1 + Math.floor((at.getTime() - since.getTime()) / (policy.escalationMinutes * 60000));
    if (due > l.alertLevel && l.alertLevel < 4) {
      await alertMatches(l.id, l.alertLevel + 1);
      waves++;
    }
  }
  return waves;
}

export async function expireTickets(at = now()) {
  return (await db.needTicket.updateMany({ where: { status: "OPEN", latestDelivery: { lt: at } }, data: { status: "EXPIRED" } })).count;
}

export async function expireGroceryOrders(at = now()) {
  const due = await db.groceryOrder.findMany({ where: { status: "RESERVED", reservationExpiresAt: { lt: at } } });
  let n = 0;
  for (const o of due) if (await tx((t) => cancelOrderTx(t, o.id, null, "Reservation expired before collection"))) n++;
  return n;
}

/** One sweep. Each task key is bucketed per minute so overlapping workers do not double-run. */
export async function runSweep(at = now()) {
  const bucket = at.toISOString().slice(0, 16);
  const out: Record<string, unknown> = {};
  const tasks: [string, () => Promise<unknown>][] = [
    ["expireOffers", () => expireOffers(at)],
    ["releaseHolds", () => releaseExpiredHolds(at)],
    ["expireLots", () => expireLots(at)],
    ["escalate", () => escalate(at)],
    ["expireTickets", () => expireTickets(at)],
    ["groceryOrders", () => expireGroceryOrders(at)],
    ["recurring", () => generateRecurring(2, at)],
  ];
  for (const [type, fn] of tasks) {
    try {
      out[type] = await runOnce(type, `${type}:${bucket}`, fn);
    } catch (e) {
      out[type] = { error: String((e as Error).message ?? e) };
    }
  }
  return out;
}
