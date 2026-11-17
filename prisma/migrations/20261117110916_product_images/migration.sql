-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StoredFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '',
    "originalName" TEXT NOT NULL,
    "storageName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "jobId" TEXT,
    "productId" TEXT,
    "lotId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoredFile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StoredFile" ("createdAt", "id", "jobId", "kind", "mime", "originalName", "purpose", "size", "storageName", "tenantId", "uploadedById") SELECT "createdAt", "id", "jobId", "kind", "mime", "originalName", "purpose", "size", "storageName", "tenantId", "uploadedById" FROM "StoredFile";
DROP TABLE "StoredFile";
ALTER TABLE "new_StoredFile" RENAME TO "StoredFile";
CREATE UNIQUE INDEX "StoredFile_storageName_key" ON "StoredFile"("storageName");
CREATE INDEX "StoredFile_productId_idx" ON "StoredFile"("productId");
CREATE INDEX "StoredFile_lotId_idx" ON "StoredFile"("lotId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
