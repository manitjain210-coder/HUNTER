import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Throwaway test database: recreated from migrations on every run. Never points at dev/prod data.
export default function setup() {
  for (const f of ["prisma/test.db", "prisma/test.db-journal"]) rmSync(f, { force: true });
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: "file:./test.db" } });
}
