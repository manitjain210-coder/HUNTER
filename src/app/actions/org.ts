"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/authz";
import { invalid } from "@/lib/domain";
import { formToObj, type FormState } from "@/lib/form-state";
import { currentSessionId } from "@/lib/session";
import { audit } from "@/lib/audit";
import * as orgs from "@/services/orgs";
import { saveUpload } from "@/services/files";
import { run, s } from "./run";

export async function createOrgAction(_: FormState, f: FormData): Promise<FormState> {
  let tenantId = "";
  const r = await run(async (a) => {
    const t = await orgs.createOrganisation(a, formToObj(f));
    tenantId = t.id;
    const m = await db.membership.findFirstOrThrow({ where: { tenantId: t.id, userId: a.userId } });
    const sid = await currentSessionId();
    if (sid) await orgs.switchContext(a.userId, sid, m.id);
  });
  if (r?.error) return r;
  redirect(`/org/profile?created=${tenantId}`);
}

export const updateOrgAction = async (_: FormState, f: FormData) =>
  run(async (a) => {
    const r = await orgs.updateOrganisation(a, formToObj(f));
    return r.reReview ? `Saved. Sensitive changes (${r.changed.join(", ")}) were sent for re-review.` : "Profile saved.";
  });

export const submitAppAction = async (_: FormState, f: FormData) => run((a) => orgs.submitApplication(a, formToObj(f)), "Application submitted for review.");

export const uploadDocAction = async (_: FormState, f: FormData) =>
  run(async (a) => {
    const c = requireCtx(a, ["RECIPIENT", "RESTAURANT", "SUPERMARKET", "LOGISTICS"], ["OWNER", "COORDINATOR", "MANAGER"]);
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) throw invalid("Choose a file.", { file: "Required" });
    await saveUpload(a, { tenantId: c.tenantId, purpose: "VERIFICATION", kind: s(f, "kind"), file: { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } });
  }, "Document uploaded (stored privately).");

export const reviewAppAction = async (_: FormState, f: FormData) =>
  run((a) => orgs.reviewApplication(a, s(f, "applicationId"), formToObj(f)), "Decision recorded.");

export const suspendAction = async (_: FormState, f: FormData) =>
  run(async (a) => {
    const r = await orgs.setSuspended(a, s(f, "tenantId"), s(f, "mode") === "suspend", s(f, "reason"));
    return s(f, "mode") === "suspend" ? `Suspended. ${r.pendingOffersClosed} pending offers closed; existing reservations and jobs await your explicit resolution.` : "Reinstated.";
  });

export const inviteAction = async (_: FormState, f: FormData) =>
  run(async (a) => {
    const token = await orgs.createInvitation(a, s(f, "role"));
    return { ok: true, message: "Invitation link created. Copy it now — it is shown once, works once and expires in 72 hours. It is not emailed or texted.", data: { link: `/invite/${token}` } };
  });

export async function acceptInviteAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await run(async (a) => {
    const res = await orgs.acceptInvitation(a, s(f, "token"));
    const sid = await currentSessionId();
    if (sid) await orgs.switchContext(a.userId, sid, res.membershipId);
  });
  if (r?.error) return r;
  redirect("/dashboard");
}

export const changeMemberAction = async (_: FormState, f: FormData) =>
  run((a) => orgs.changeMember(a, s(f, "membershipId"), s(f, "op") === "deactivate" ? { active: false } : s(f, "op") === "activate" ? { active: true } : { role: s(f, "role") }), "Member updated.");

export const addBranchAction = async (_: FormState, f: FormData) => run(async (a) => void (await orgs.addBranch(a, formToObj(f))), "Branch added.");

export const addVehicleAction = async (_: FormState, f: FormData) =>
  run(async (a) => {
    const c = requireCtx(a, ["LOGISTICS", "RECIPIENT"], ["OWNER", "COORDINATOR"]);
    const cap = Number(f.get("capacityKg"));
    if (!s(f, "label").trim()) throw invalid("Name the vehicle.", { label: "Required" });
    if (!Number.isInteger(cap) || cap <= 0 || cap > 20000) throw invalid("Capacity must be a whole number of kg.", { capacityKg: "1–20000" });
    const v = await db.vehicle.create({ data: { tenantId: c.tenantId, label: s(f, "label").trim().slice(0, 80), capacityKg: cap, refrigerated: f.get("refrigerated") === "on" } });
    await audit(db, { actorId: a.userId, tenantId: c.tenantId, action: "vehicle.add", entityType: "Vehicle", entityId: v.id });
  }, "Vehicle added.");
