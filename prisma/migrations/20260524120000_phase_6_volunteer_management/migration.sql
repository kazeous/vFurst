-- CreateEnum
CREATE TYPE "VolunteerApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'DECLINED', 'WAITLISTED');

-- CreateEnum
CREATE TYPE "VolunteerPreferredContactMethod" AS ENUM ('EMAIL', 'PHONE', 'SMS', 'DISCORD', 'OTHER');

-- CreateEnum
CREATE TYPE "VolunteerAssignmentState" AS ENUM ('INTERESTED', 'PREVIOUS_EXPERIENCE', 'AVOID', 'REQUESTED_BY_LEAD', 'ASSIGNED');

-- CreateTable
CREATE TABLE "VolunteerApplication" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "preferredContactMethod" "VolunteerPreferredContactMethod" NOT NULL DEFAULT 'EMAIL',
    "availability" TEXT NOT NULL,
    "departmentInterests" TEXT NOT NULL,
    "priorExperience" TEXT,
    "status" "VolunteerApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "adminNote" TEXT,
    "reviewedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerDepartment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "leadUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerAssignment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "state" "VolunteerAssignmentState" NOT NULL DEFAULT 'INTERESTED',
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VolunteerApplication_eventId_status_idx" ON "VolunteerApplication"("eventId", "status");

-- CreateIndex
CREATE INDEX "VolunteerApplication_userId_createdAt_idx" ON "VolunteerApplication"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VolunteerApplication_email_idx" ON "VolunteerApplication"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerDepartment_eventId_name_key" ON "VolunteerDepartment"("eventId", "name");

-- CreateIndex
CREATE INDEX "VolunteerDepartment_eventId_idx" ON "VolunteerDepartment"("eventId");

-- CreateIndex
CREATE INDEX "VolunteerDepartment_leadUserId_idx" ON "VolunteerDepartment"("leadUserId");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerAssignment_applicationId_departmentId_key" ON "VolunteerAssignment"("applicationId", "departmentId");

-- CreateIndex
CREATE INDEX "VolunteerAssignment_departmentId_state_idx" ON "VolunteerAssignment"("departmentId", "state");

-- CreateIndex
CREATE INDEX "VolunteerAssignment_createdByUserId_idx" ON "VolunteerAssignment"("createdByUserId");

-- AddForeignKey
ALTER TABLE "VolunteerApplication" ADD CONSTRAINT "VolunteerApplication_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerApplication" ADD CONSTRAINT "VolunteerApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerApplication" ADD CONSTRAINT "VolunteerApplication_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerDepartment" ADD CONSTRAINT "VolunteerDepartment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerDepartment" ADD CONSTRAINT "VolunteerDepartment_leadUserId_fkey" FOREIGN KEY ("leadUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VolunteerApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "VolunteerDepartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
