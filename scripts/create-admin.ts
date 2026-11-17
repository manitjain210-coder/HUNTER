// Controlled admin bootstrap. Usage:
//   ADMIN_PASSWORD='long-secret' npm run admin:create -- +919812345678 "Full Name"
// Promotes an existing user, or creates one. Never exposed over HTTP.
import { db } from "@/lib/db";
import { checkPasswordStrength, hashPassword, normalizePhone } from "@/lib/auth";

(async () => {
  const [phoneRaw, name] = process.argv.slice(2);
  if (!phoneRaw) throw new Error("Usage: npm run admin:create -- <phone> [name]");
  const phone = normalizePhone(phoneRaw);
  const existing = await db.user.findUnique({ where: { phone } });
  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { isPlatformAdmin: true } });
    console.log(`Promoted ${phone} to platform admin.`);
  } else {
    const pw = process.env.ADMIN_PASSWORD ?? "";
    checkPasswordStrength(pw);
    await db.user.create({ data: { phone, name: name || "Platform admin", passwordHash: await hashPassword(pw), isPlatformAdmin: true } });
    console.log(`Created platform admin ${phone}.`);
  }
  await db.auditEvent.create({ data: { action: "admin.bootstrap", entityType: "User", entityId: phone } });
  await db.$disconnect();
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
