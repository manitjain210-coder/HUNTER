"use server";

import { redirect } from "next/navigation";
import { formToObj, type FormState } from "@/lib/form-state";
import * as tickets from "@/services/tickets";
import * as surplus from "@/services/surplus";
import * as offers from "@/services/offers";
import { addImage } from "@/services/files";
import type { Actor } from "@/lib/authz";
import { run, s } from "./run";

async function addPhotos(a: Actor, lotId: string, f: FormData) {
  for (const file of f.getAll("photos")) if (file instanceof File && file.size) await addImage(a, { lotId }, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
}

export async function saveTicketAction(_: FormState, f: FormData): Promise<FormState> {
  const publish = s(f, "intent") === "publish";
  const id = s(f, "ticketId");
  let target = "";
  const r = await run(async (a) => {
    const data = formToObj(f);
    if (s(f, "recurring") === "on" && !id) {
      const sched = await tickets.createSchedule(a, data, { daysOfWeek: f.getAll("daysOfWeek"), localTime: s(f, "localTime"), startDate: s(f, "startDate"), endDate: s(f, "endDate"), exceptions: s(f, "exceptionDates"), receiveLeadMin: s(f, "receiveLeadMin") || 90, latestLeadMin: s(f, "latestLeadMin") || 20 });
      await tickets.generateRecurring(2);
      target = `/org/recurring?created=${sched.id}`;
      return;
    }
    if (id) {
      await tickets.updateTicket(a, id, data, publish);
      target = `/org/tickets/${id}`;
    } else {
      const t = await tickets.createTicket(a, data, publish);
      target = `/org/tickets/${t.id}`;
    }
  });
  if (r?.error) return r;
  redirect(target);
}

export const cancelTicketAction = async (_: FormState, f: FormData) => run((a) => tickets.cancelTicket(a, s(f, "ticketId"), s(f, "reason")), "Ticket cancelled; uncollected reservations were released.");
export const urgencyAction = async (_: FormState, f: FormData) => run((a) => tickets.reviewUrgency(a, s(f, "ticketId"), s(f, "decision") === "approve", s(f, "reason")), "Urgency decision recorded.");
export const pauseScheduleAction = async (_: FormState, f: FormData) => run((a) => tickets.setSchedulePaused(a, s(f, "scheduleId"), s(f, "paused") === "true"), "Schedule updated.");

export async function surplusAction(_: FormState, f: FormData): Promise<FormState> {
  let target = "";
  const r = await run(async (a) => {
    const data = formToObj(f);
    if (s(f, "stage") === "EXPECTED") {
      const lot = await surplus.createExpected(a, { ...data, expectedFrom: s(f, "expectedFrom"), expectedUntil: s(f, "expectedUntil") });
      await addPhotos(a, lot.id, f);
      target = `/restaurant/surplus/${lot.id}`;
    } else {
      const lot = await surplus.confirmReady(a, data, s(f, "lotId") || undefined);
      await addPhotos(a, lot.id, f);
      target = `/restaurant/surplus/${lot.id}?confirmed=1`;
    }
  });
  if (r?.error) return r;
  redirect(target);
}

export const withdrawLotAction = async (_: FormState, f: FormData) =>
  run(async (a) => {
    const r = await surplus.withdrawLot(a, s(f, "lotId"), s(f, "reason"));
    return `Withdrawn from distribution. ${r.released} reservation(s) released.`;
  });
export const adjustItemAction = async (_: FormState, f: FormData) => run((a) => surplus.adjustItem(a, s(f, "itemId"), Number(f.get("quantity")), s(f, "reason")), "Quantity corrected.");

export const proposeOfferAction = async (_: FormState, f: FormData) => run(async (a) => void (await offers.proposeOffer(a, s(f, "lotId"), s(f, "ticketId"), s(f, "idem"))), "Offer sent. It is not fulfilment until the organisation accepts and the food is received.");
export const acceptOfferAction = async (_: FormState, f: FormData) => run(async (a) => void (await offers.acceptOffer(a, s(f, "offerId"))), "Reserved — transport pending, delivery not yet guaranteed.");
export const declineOfferAction = async (_: FormState, f: FormData) => run((a) => offers.declineOffer(a, s(f, "offerId"), s(f, "reason") || "Not suitable"), "Offer declined.");
export const withdrawOfferAction = async (_: FormState, f: FormData) => run((a) => offers.withdrawOffer(a, s(f, "offerId"), s(f, "reason") || "Withdrawn"), "Offer withdrawn.");
export const cancelAllocationAction = async (_: FormState, f: FormData) => run((a) => offers.cancelAllocation(a, s(f, "allocationId"), s(f, "reason")), "Reservation released.");

export async function reserveLotAction(_: FormState, f: FormData): Promise<FormState> {
  if (f.get("confirm") !== "on") return { error: "Tick the confirmation box first.", fieldErrors: { confirm: "Required" } };
  const r = await run(async (a) => void (await offers.reserveLot(a, s(f, "lotId"), s(f, "ticketId"), s(f, "idem"))));
  if (r?.error) return r;
  redirect(`/org/tickets/${s(f, "ticketId")}?reserved=1`);
}
