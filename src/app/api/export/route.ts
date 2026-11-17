import { getActor } from "@/lib/session";
import { AppError } from "@/lib/domain";
import { exportRows, toCsv } from "@/services/reports";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

/** Scoped CSV export (tenant scope comes from the session, never the URL). */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return new Response("Sign in required", { status: 401 });
  const kind = new URL(req.url).searchParams.get("kind") === "orders" ? "orders" : "allocations";
  try {
    const rows = await exportRows(actor, kind);
    await audit(db, { actorId: actor.userId, tenantId: actor.ctx?.tenantId, action: "export.csv", entityType: "Export", entityId: kind, data: { rows: rows.length } });
    return new Response(toCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="khana-bridge-${kind}.csv"`, "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof AppError) return new Response(e.message, { status: 403 });
    throw e;
  }
}
