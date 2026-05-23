-- CreateEnum
CREATE TYPE "EmailTemplateScope" AS ENUM ('SYSTEM', 'ORGANIZATION', 'EVENT');

-- CreateEnum
CREATE TYPE "EmailTemplateKey" AS ENUM ('ORGANIZATION_INVITE', 'EVENT_INVITE', 'REGISTRATION_CONFIRMATION', 'VENDOR_APPLICATION_RECEIVED', 'VOLUNTEER_APPLICATION_RECEIVED', 'ORDER_RECEIPT');

-- CreateEnum
CREATE TYPE "EmailLogStatus" AS ENUM ('SKIPPED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('RESEND');

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "scope" "EmailTemplateScope" NOT NULL,
    "key" "EmailTemplateKey" NOT NULL,
    "organizationId" TEXT,
    "eventId" TEXT,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nonCritical" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "eventId" TEXT,
    "templateId" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailLogStatus" NOT NULL,
    "provider" "EmailProvider",
    "providerMessageId" TEXT,
    "error" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailTemplate_scope_key_idx" ON "EmailTemplate"("scope", "key");

-- CreateIndex
CREATE INDEX "EmailTemplate_organizationId_key_idx" ON "EmailTemplate"("organizationId", "key");

-- CreateIndex
CREATE INDEX "EmailTemplate_eventId_key_idx" ON "EmailTemplate"("eventId", "key");

-- CreateIndex
CREATE INDEX "EmailLog_organizationId_createdAt_idx" ON "EmailLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_eventId_createdAt_idx" ON "EmailLog"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_templateId_idx" ON "EmailLog"("templateId");

-- CreateIndex
CREATE INDEX "EmailLog_status_createdAt_idx" ON "EmailLog"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
