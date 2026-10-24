import { prisma } from "@vfurst/db";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCachedRequestPortalOrg } from "@/lib/portal-request";

const MAX_VERSION_IDS = 50;
const notFoundHeaders = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
// Published versions never change, so the registration wizard can load them once and keep them.
const immutableHeaders = { "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" };
const idsSchema = z.string().transform((value) => [...new Set(value.split(",").filter(Boolean))])
  .pipe(z.array(z.string().uuid()).min(1).max(MAX_VERSION_IDS));

/** Policy text for the registration wizard's Review step, kept out of the cached registration page. */
export async function GET(request: NextRequest) {
  const org = await getCachedRequestPortalOrg();
  const ids = idsSchema.safeParse(request.nextUrl.searchParams.get("ids") ?? "");
  if (!org || !ids.success) return NextResponse.json({ versions: null }, { status: 404, headers: notFoundHeaders });
  const versions = await prisma.policyDocumentVersion.findMany({
    where: { id: { in: ids.data }, orgId: org.id, document: { orgId: org.id, event: { orgId: org.id, status: "PUBLISHED" } } },
    select: { id: true, title: true, body: true }
  });
  if (versions.length !== ids.data.length) return NextResponse.json({ versions: null }, { status: 404, headers: notFoundHeaders });
  return NextResponse.json({ versions }, { headers: immutableHeaders });
}
