"use server";

import type { ActionFormState } from "@/lib/action-form-state";
import { runActionWithState } from "@/lib/action-state";
import { requireEventAccess, requirePolicyDocumentAccess } from "@/lib/dashboard-access";
import { parsePolicyVersionInput } from "@/lib/policy-documents";
import { ExpectedActionError } from "@/lib/public-action-error";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

function policiesPath(eventId: string) {
  return `/dashboard/events/${eventId}/settings/policies`;
}

export async function createPolicyDocument(_state: ActionFormState, formData: FormData): Promise<ActionFormState> {
  return runActionWithState(async () => {
    const eventId = z.string().uuid().parse(formData.get("eventId"));
    const { userId, event } = await requireEventAccess(eventId);
    const input = parsePolicyVersionInput(formData);
    const document = await prisma.$transaction(async (tx) => {
      // Serialize ordering even when the event has no policy rows to lock yet.
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${event.id}::uuid AND "orgId" = ${event.orgId}::uuid FOR UPDATE`;
      const { _max } = await tx.policyDocument.aggregate({
        where: { orgId: event.orgId, eventId: event.id }, _max: { sortOrder: true }
      });
      const created = await tx.policyDocument.create({
        data: { orgId: event.orgId, eventId: event.id, sortOrder: (_max.sortOrder ?? -1) + 1 }
      });
      await tx.policyDocumentVersion.create({
        data: { orgId: event.orgId, documentId: created.id, version: 1, ...input, publishedByUserId: userId }
      });
      return created;
    }, { isolationLevel: "ReadCommitted" });
    revalidatePath(policiesPath(event.id));
    redirect(`${policiesPath(event.id)}/${document.id}?published=1`);
  });
}

export async function publishPolicyVersion(_state: ActionFormState, formData: FormData): Promise<ActionFormState> {
  return runActionWithState(async () => {
    const documentId = z.string().uuid().parse(formData.get("documentId"));
    const { userId, document, event } = await requirePolicyDocumentAccess(documentId);
    const input = parsePolicyVersionInput(formData);
    let version: number;
    try {
      version = await prisma.$transaction(async (tx) => {
        const latest = await tx.policyDocumentVersion.findFirst({
          where: { orgId: document.orgId, documentId: document.id }, orderBy: { version: "desc" }
        });
        if (latest?.title === input.title && latest.body === input.body) {
          throw new ExpectedActionError("Nothing to publish.");
        }
        const nextVersion = (latest?.version ?? 0) + 1;
        await tx.policyDocumentVersion.create({
          data: { orgId: document.orgId, documentId: document.id, version: nextVersion, ...input, publishedByUserId: userId }
        });
        return nextVersion;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error.code === "P2002" || error.code === "P2034")) {
        throw new ExpectedActionError("Another version was just published. Reload the page and try again.");
      }
      throw error;
    }
    revalidatePath(policiesPath(event.id));
    revalidatePath(`${policiesPath(event.id)}/${document.id}`);
    redirect(`${policiesPath(event.id)}/${document.id}?published=${version}`);
  });
}

async function setArchived(formData: FormData, archivedAt: Date | null) {
  const documentId = z.string().uuid().parse(formData.get("documentId"));
  const { document, event } = await requirePolicyDocumentAccess(documentId);
  await prisma.policyDocument.update({ where: { id: document.id }, data: { archivedAt } });
  revalidatePath(policiesPath(event.id));
}

export async function archivePolicyDocument(_state: ActionFormState, formData: FormData): Promise<ActionFormState> {
  return runActionWithState(() => setArchived(formData, new Date()));
}

export async function restorePolicyDocument(_state: ActionFormState, formData: FormData): Promise<ActionFormState> {
  return runActionWithState(() => setArchived(formData, null));
}

export async function movePolicyDocument(_state: ActionFormState, formData: FormData): Promise<ActionFormState> {
  return runActionWithState(async () => {
    const documentId = z.string().uuid().parse(formData.get("documentId"));
    const { document, event } = await requirePolicyDocumentAccess(documentId);
    const direction = z.enum(["up", "down"]).parse(formData.get("direction"));
    await prisma.$transaction(async (tx) => {
      // Share creation's event lock so the neighbor read and swap stay atomic.
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${event.id}::uuid AND "orgId" = ${event.orgId}::uuid FOR UPDATE`;
      const documents = await tx.policyDocument.findMany({
        where: { orgId: event.orgId, eventId: event.id, archivedAt: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, sortOrder: true }
      });
      const index = documents.findIndex((item) => item.id === document.id);
      if (index === -1) return;
      const current = documents[index]!;
      const neighbor = documents[index + (direction === "up" ? -1 : 1)];
      if (!neighbor) return;
      await tx.policyDocument.update({ where: { id: current.id }, data: { sortOrder: neighbor.sortOrder } });
      await tx.policyDocument.update({ where: { id: neighbor.id }, data: { sortOrder: current.sortOrder } });
    }, { isolationLevel: "ReadCommitted" });
    revalidatePath(policiesPath(event.id));
  });
}
