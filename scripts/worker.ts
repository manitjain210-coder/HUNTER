// Local background worker: `npm run worker` (loop every 60 s) or `npm run worker -- --once`.
// Safe to run several copies: each task is claimed once per minute bucket via the JobTask table.
import { runSweep } from "@/services/worker";
import { db } from "@/lib/db";

const once = process.argv.includes("--once");
async function tick() {
  const r = await runSweep();
  console.log(new Date().toISOString(), JSON.stringify(r));
}
(async () => {
  await tick();
  if (once) return db.$disconnect();
  setInterval(() => tick().catch((e) => console.error(e)), 60_000);
})();
