-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_system_key_unique" ON "EmailTemplate"("key") WHERE "scope" = 'SYSTEM' AND "organizationId" IS NULL AND "eventId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_organization_key_unique" ON "EmailTemplate"("organizationId", "key") WHERE "scope" = 'ORGANIZATION' AND "organizationId" IS NOT NULL AND "eventId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_event_key_unique" ON "EmailTemplate"("eventId", "key") WHERE "scope" = 'EVENT' AND "eventId" IS NOT NULL;
