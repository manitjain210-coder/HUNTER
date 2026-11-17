// Vercel build: Postgres schema + migrations, optional one-time demo seed, then the Next build.
// Needs DATABASE_URL, POSTGRES_URL or PRISMA_DATABASE_URL (a Postgres URL, e.g. Neon/Vercel Postgres) and CRON_SECRET. Set SEED_DEMO=1 for the first deploy only.
import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PRISMA_DATABASE_URL || "";
process.env.DATABASE_URL ||= url;
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error("DATABASE_URL must be a postgres:// URL on Vercel (SQLite files do not persist there).");
const run = (c) => execSync(c, { stdio: "inherit", env: { ...process.env, FILE_STORE: "db" } });
run("node scripts/vercel-prepare.mjs");
run("npx prisma generate --schema prisma/pg/schema.prisma");
run("npx prisma migrate deploy --schema prisma/pg/schema.prisma");
if (process.env.SEED_DEMO === "1") run("npx tsx prisma/seed.ts");
run("npx next build");
