-- CreateEnum
CREATE TYPE "VendorApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED_UNPAID', 'APPROVED_PAID', 'REJECTED', 'WAITLISTED');

-- CreateTable
CREATE TABLE "VendorApplication" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "productsServices" TEXT NOT NULL,
    "requestedTableProductId" TEXT,
    "status" "VendorApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "seatingNotes" TEXT,
    "adminNote" TEXT,
    "approvedOrderId" TEXT,
    "reviewedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAmenity" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorAmenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAssistant" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorAssistant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorSeatingPreference" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorSeatingPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorApplication_approvedOrderId_key" ON "VendorApplication"("approvedOrderId");

-- CreateIndex
CREATE INDEX "VendorApplication_eventId_status_idx" ON "VendorApplication"("eventId", "status");

-- CreateIndex
CREATE INDEX "VendorApplication_userId_createdAt_idx" ON "VendorApplication"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorApplication_requestedTableProductId_idx" ON "VendorApplication"("requestedTableProductId");

-- CreateIndex
CREATE INDEX "VendorAmenity_applicationId_idx" ON "VendorAmenity"("applicationId");

-- CreateIndex
CREATE INDEX "VendorAssistant_applicationId_idx" ON "VendorAssistant"("applicationId");

-- CreateIndex
CREATE INDEX "VendorSeatingPreference_applicationId_idx" ON "VendorSeatingPreference"("applicationId");

-- AddForeignKey
ALTER TABLE "VendorApplication" ADD CONSTRAINT "VendorApplication_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorApplication" ADD CONSTRAINT "VendorApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorApplication" ADD CONSTRAINT "VendorApplication_requestedTableProductId_fkey" FOREIGN KEY ("requestedTableProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorApplication" ADD CONSTRAINT "VendorApplication_approvedOrderId_fkey" FOREIGN KEY ("approvedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorApplication" ADD CONSTRAINT "VendorApplication_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAmenity" ADD CONSTRAINT "VendorAmenity_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VendorApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssistant" ADD CONSTRAINT "VendorAssistant_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VendorApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSeatingPreference" ADD CONSTRAINT "VendorSeatingPreference_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VendorApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
