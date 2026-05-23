-- CreateEnum
CREATE TYPE "BadgeStatus" AS ENUM ('NOT_PRINTED', 'PRINT_READY', 'PRINTED', 'VOID');

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN "checkedInAt" TIMESTAMP(3);
ALTER TABLE "Registration" ADD COLUMN "checkedInByUserId" TEXT;
ALTER TABLE "Registration" ADD COLUMN "badgeStatus" "BadgeStatus" NOT NULL DEFAULT 'NOT_PRINTED';
ALTER TABLE "Registration" ADD COLUMN "cashierNote" TEXT;

-- CreateIndex
CREATE INDEX "Registration_checkedInByUserId_idx" ON "Registration"("checkedInByUserId");

-- CreateIndex
CREATE INDEX "Registration_eventId_checkedInAt_idx" ON "Registration"("eventId", "checkedInAt");

-- CreateIndex
CREATE INDEX "Registration_badgeStatus_idx" ON "Registration"("badgeStatus");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_checkedInByUserId_fkey" FOREIGN KEY ("checkedInByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
