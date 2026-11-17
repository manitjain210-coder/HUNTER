import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;

export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/** Interactive transaction with retry on SQLite busy/serialization conflicts. */
export async function tx<T>(fn: (t: Tx) => Promise<T>, tries = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await db.$transaction(fn, { timeout: 15000, maxWait: 10000 });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      const retryable = /database is locked|SQLITE_BUSY|write conflict|deadlock|P2034|Transaction already closed/i.test(msg);
      if (!retryable || i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 20 * (i + 1) + Math.random() * 30));
    }
  }
}
