import { runSweep } from "@/services/worker";

// Vercel Cron replacement for `npm run worker`. Vercel sends `Authorization: Bearer $CRON_SECRET`.
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runSweep());
}
