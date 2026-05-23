import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";

type AuditInput = {
  organizationId?: string | null;
  eventId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function writeAuditLog(input: AuditInput) {
  await db.auditLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      eventId: input.eventId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata
    }
  });
}
