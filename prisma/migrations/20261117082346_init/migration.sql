-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notifyPrefs" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeMembershipId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "publicSummary" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "serviceArea" TEXT NOT NULL DEFAULT '',
    "lat" REAL,
    "lng" REAL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "hours" TEXT NOT NULL DEFAULT '',
    "pocName" TEXT NOT NULL DEFAULT '',
    "pocRole" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "backupContact" TEXT NOT NULL DEFAULT '',
    "dailyCapacity" INTEGER,
    "beneficiaryInfo" TEXT NOT NULL DEFAULT '',
    "dietAccepted" TEXT NOT NULL DEFAULT '[]',
    "allergensOk" TEXT NOT NULL DEFAULT '[]',
    "exclusions" TEXT NOT NULL DEFAULT '[]',
    "programmeNotes" TEXT NOT NULL DEFAULT '',
    "hasKitchen" BOOLEAN NOT NULL DEFAULT false,
    "hasRefrigeration" BOOLEAN NOT NULL DEFAULT false,
    "storageCapacity" TEXT NOT NULL DEFAULT '',
    "hasVehicle" BOOLEAN NOT NULL DEFAULT false,
    "maxDistanceKm" REAL,
    "packingNeeds" TEXT NOT NULL DEFAULT '',
    "acceptsPartial" BOOLEAN NOT NULL DEFAULT true,
    "acceptsComponents" BOOLEAN NOT NULL DEFAULT true,
    "restrictedFoodTypes" TEXT NOT NULL DEFAULT '[]',
    "verificationStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "needsReReview" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "lat" REAL,
    "lng" REAL,
    "maxPlatesPerDay" INTEGER,
    "capacityReason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "usedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "declarationAccepted" BOOLEAN NOT NULL DEFAULT false,
    "declarationBy" TEXT,
    "registrationDetails" TEXT NOT NULL DEFAULT '',
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationReview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VerificationApplication" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '',
    "originalName" TEXT NOT NULL,
    "storageName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "jobId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoredFile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchCode" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "soldQty" INTEGER NOT NULL DEFAULT 0,
    "originalPriceMinor" INTEGER NOT NULL,
    "minOrder" INTEGER NOT NULL DEFAULT 1,
    "expiryDate" DATETIME NOT NULL,
    "bestBefore" DATETIME,
    "storage" TEXT NOT NULL DEFAULT 'AMBIENT',
    "pickupLocation" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscountRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "category" TEXT,
    "batchId" TEXT,
    "timeTiers" TEXT NOT NULL,
    "qtyTiers" TEXT NOT NULL,
    "maxPct" INTEGER NOT NULL,
    "floorMinor" INTEGER NOT NULL DEFAULT 0,
    "illustrative" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "DiscountRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IngredientWatchlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "category" TEXT,
    "quantity" INTEGER,
    "unit" TEXT,
    "requiredBy" DATETIME,
    "minShelfDays" INTEGER NOT NULL DEFAULT 0,
    "radiusKm" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IngredientWatchlist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "buyerTenantId" TEXT,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "seenPriceMinor" INTEGER NOT NULL,
    CONSTRAINT "CartItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CartItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroceryOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyerUserId" TEXT NOT NULL,
    "buyerTenantId" TEXT,
    "sellerTenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "totalMinor" INTEGER NOT NULL,
    "reservationExpiresAt" DATETIME NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "policySnapshot" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectedAt" DATETIME,
    CONSTRAINT "GroceryOrder_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroceryOrder_buyerTenantId_fkey" FOREIGN KEY ("buyerTenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GroceryOrder_sellerTenantId_fkey" FOREIGN KEY ("sellerTenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "originalPriceMinor" INTEGER NOT NULL,
    "pricingSnapshot" TEXT NOT NULL,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "GroceryOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "GroceryOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NeedTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "requesterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "mealSlot" TEXT NOT NULL,
    "needDate" DATETIME NOT NULL,
    "peopleCount" INTEGER NOT NULL,
    "foodCategory" TEXT NOT NULL,
    "dietPref" TEXT NOT NULL,
    "exclusions" TEXT NOT NULL DEFAULT '[]',
    "otherDietary" TEXT NOT NULL DEFAULT '',
    "receiveFrom" DATETIME NOT NULL,
    "latestDelivery" DATETIME NOT NULL,
    "servingTime" DATETIME NOT NULL,
    "partialOk" BOOLEAN NOT NULL DEFAULT true,
    "minUseful" INTEGER NOT NULL DEFAULT 1,
    "fulfilment" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL DEFAULT '',
    "lat" REAL,
    "lng" REAL,
    "maxDistanceKm" REAL,
    "receivingContact" TEXT NOT NULL DEFAULT '',
    "storageNotes" TEXT NOT NULL DEFAULT '',
    "containers" TEXT NOT NULL DEFAULT '',
    "unloading" TEXT NOT NULL DEFAULT '',
    "transportFunding" TEXT NOT NULL DEFAULT 'ORG',
    "urgency" TEXT NOT NULL DEFAULT 'NORMAL',
    "urgencyReason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "flags" TEXT NOT NULL DEFAULT '[]',
    "scheduleId" TEXT,
    "occurrenceKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    CONSTRAINT "NeedTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketRequirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "servingNote" TEXT NOT NULL DEFAULT '',
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TicketRequirement_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "NeedTicket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecurringSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "daysOfWeek" TEXT NOT NULL,
    "localTime" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "exceptions" TEXT NOT NULL DEFAULT '[]',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SurplusLot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "stage" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "expectedFrom" DATETIME,
    "expectedUntil" DATETIME,
    "dietCategory" TEXT NOT NULL DEFAULT 'VEG',
    "storage" TEXT NOT NULL DEFAULT '',
    "packaging" TEXT NOT NULL DEFAULT '',
    "preparedAt" DATETIME,
    "readyAt" DATETIME,
    "pickupDeadline" DATETIME,
    "consumeBy" DATETIME,
    "handlingDeclaration" BOOLEAN NOT NULL DEFAULT false,
    "declaredById" TEXT,
    "flags" TEXT NOT NULL DEFAULT '[]',
    "closeReason" TEXT,
    "lat" REAL,
    "lng" REAL,
    "alertLevel" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "SurplusLot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FoodItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "allocatedQty" INTEGER NOT NULL DEFAULT 0,
    "servingDesc" TEXT NOT NULL DEFAULT '',
    "ingredients" TEXT NOT NULL DEFAULT '',
    "allergens" TEXT NOT NULL DEFAULT '[]',
    "allergensUnknown" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "FoodItem_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "SurplusLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lotId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "expiresAt" DATETIME NOT NULL,
    "createdById" TEXT NOT NULL,
    "decidedById" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    CONSTRAINT "Offer_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "SurplusLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Offer_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "NeedTicket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfferLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offerId" TEXT NOT NULL,
    "foodItemId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "OfferLine_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OfferLine_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OfferLine_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "TicketRequirement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offerId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "foodItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "collectedQty" INTEGER NOT NULL DEFAULT 0,
    "acceptedQty" INTEGER NOT NULL DEFAULT 0,
    "rejectedQty" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "holdExpiresAt" DATETIME NOT NULL,
    "jobId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Allocation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "NeedTicket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Allocation_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "TicketRequirement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Allocation_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Allocation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeliveryJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "foodItemId" TEXT,
    "batchId" TEXT,
    "allocationId" TEXT,
    "orderId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "capacityKg" INTEGER NOT NULL,
    "refrigerated" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Vehicle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "mode" TEXT NOT NULL DEFAULT 'PLATFORM_DISPATCH',
    "collectorId" TEXT,
    "vehicleId" TEXT,
    "logisticsTenantId" TEXT,
    "quoteMinor" INTEGER NOT NULL DEFAULT 0,
    "handling" TEXT NOT NULL DEFAULT 'AMBIENT',
    "routeSuggestion" TEXT NOT NULL DEFAULT '[]',
    "routeApproved" BOOLEAN NOT NULL DEFAULT false,
    "handoverCodeHash" TEXT,
    "failureReason" TEXT,
    "resolution" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DeliveryStop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lotId" TEXT,
    "ticketId" TEXT,
    "seq" INTEGER NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "lat" REAL,
    "lng" REAL,
    "windowStart" DATETIME,
    "windowEnd" DATETIME,
    "plannedQty" INTEGER NOT NULL DEFAULT 0,
    "actualQty" INTEGER,
    "arrivedAt" DATETIME,
    "doneAt" DATETIME,
    CONSTRAINT "DeliveryStop_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeliveryJob" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HandoverEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "stopId" TEXT,
    "type" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "tenantId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "evidenceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HandoverEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeliveryJob" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FundingCommitment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "payerType" TEXT NOT NULL,
    "payerTenantId" TEXT,
    "sponsorName" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMMITTED',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FundingCommitment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeliveryJob" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "link" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "JobTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" DATETIME,
    "lastError" TEXT,
    "result" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "reporterId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PolicySetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "tenantId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Tenant_kind_verificationStatus_idx" ON "Tenant"("kind", "verificationStatus");

-- CreateIndex
CREATE INDEX "Branch_tenantId_idx" ON "Branch"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_tenantId_key" ON "Membership"("userId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationApplication_status_idx" ON "VerificationApplication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_storageName_key" ON "StoredFile"("storageName");

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE INDEX "ProductBatch_status_expiryDate_idx" ON "ProductBatch"("status", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBatch_tenantId_batchCode_key" ON "ProductBatch"("tenantId", "batchCode");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_userId_buyerTenantId_batchId_key" ON "CartItem"("userId", "buyerTenantId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryOrder_idempotencyKey_key" ON "GroceryOrder"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GroceryOrder_sellerTenantId_status_idx" ON "GroceryOrder"("sellerTenantId", "status");

-- CreateIndex
CREATE INDEX "GroceryOrder_buyerUserId_idx" ON "GroceryOrder"("buyerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "NeedTicket_occurrenceKey_key" ON "NeedTicket"("occurrenceKey");

-- CreateIndex
CREATE INDEX "NeedTicket_status_needDate_idx" ON "NeedTicket"("status", "needDate");

-- CreateIndex
CREATE INDEX "NeedTicket_tenantId_idx" ON "NeedTicket"("tenantId");

-- CreateIndex
CREATE INDEX "SurplusLot_stage_pickupDeadline_idx" ON "SurplusLot"("stage", "pickupDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_idempotencyKey_key" ON "Offer"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Offer_ticketId_status_idx" ON "Offer"("ticketId", "status");

-- CreateIndex
CREATE INDEX "Offer_lotId_status_idx" ON "Offer"("lotId", "status");

-- CreateIndex
CREATE INDEX "Allocation_status_holdExpiresAt_idx" ON "Allocation"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_foodItemId_idx" ON "InventoryMovement"("foodItemId");

-- CreateIndex
CREATE INDEX "InventoryMovement_batchId_idx" ON "InventoryMovement"("batchId");

-- CreateIndex
CREATE INDEX "DeliveryJob_status_idx" ON "DeliveryJob"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobTask_key_key" ON "JobTask"("key");

-- CreateIndex
CREATE INDEX "JobTask_status_runAt_idx" ON "JobTask"("status", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "PolicySetting_key_key" ON "PolicySetting"("key");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt");
