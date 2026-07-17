import { safeLocalReturnPath } from "@vfurst/auth";
import { prisma } from "@vfurst/db";
import type { HostPolicy } from "@vfurst/tenant-context";
import type { TenantIdentity } from "./tenant-session";
import { evaluateTenantWebShellHost } from "./tenant-host-policy";

const ORGANIZER_ROLES = new Set(["OWNER", "ADMIN"]);

export type OrganizerMembershipRecord = Readonly<{
  role: "OWNER" | "ADMIN" | "MEMBER";
  org: Readonly<{
    id: string;
    name: string;
    slug: string;
    status: "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "RETIRED";
    events: readonly Readonly<{
      id: string;
      name: string;
      slug: string;
      status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
      startDate: Date;
      endDate: Date;
    }>[];
  }>;
}>;

export type OrganizerWorkspace = Readonly<{
  organizations: readonly Readonly<{
    id: string;
    name: string;
    slug: string;
    status: OrganizerMembershipRecord["org"]["status"];
    role: "OWNER" | "ADMIN";
    events: readonly Readonly<{
      id: string;
      name: string;
      slug: string;
      status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
      startDate: string;
      endDate: string;
    }>[];
  }>[];
  eventCount: number;
  isEmpty: boolean;
}>;

export type OrganizerAuthoritySource = Readonly<{
  findMembershipsForUser(userId: string): Promise<readonly OrganizerMembershipRecord[]>;
}>;

export type OrganizerDashboardHostDecision =
  | Readonly<{ kind: "allow"; hostname: string }>
  | Readonly<{ kind: "reject"; hostname: string; reason: "api" | "tenant" | "platform" }>;

export type OrganizerDashboardAuthDecision =
  | Readonly<{ kind: "allow"; identity: TenantIdentity }>
  | Readonly<{ kind: "redirect"; location: string }>;

const prismaOrganizerAuthority: OrganizerAuthoritySource = {
  async findMembershipsForUser(userId) {
    return prisma.orgMember.findMany({
      where: { userId },
      orderBy: { org: { name: "asc" } },
      select: {
        role: true,
        org: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            events: {
              orderBy: [{ startDate: "asc" }, { name: "asc" }],
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                startDate: true,
                endDate: true
              }
            }
          }
        }
      }
    });
  }
};

export function decideOrganizerDashboardHost(host: string, policy: HostPolicy): OrganizerDashboardHostDecision {
  const decision = evaluateTenantWebShellHost(host, policy);
  if (decision.kind === "allow-shell" && decision.surface === "console") {
    return Object.freeze({ kind: "allow", hostname: decision.hostname });
  }

  const reason =
    decision.kind === "allow-shell"
      ? "api"
      : decision.kind === "allow-tenant-candidate"
        ? "tenant"
        : "platform";
  return Object.freeze({ kind: "reject", hostname: decision.hostname, reason });
}

export function decideOrganizerDashboardAuth(
  identity: TenantIdentity | null,
  requestedReturnTo = "/dashboard"
): OrganizerDashboardAuthDecision {
  if (identity) return Object.freeze({ kind: "allow", identity });

  const returnTo = safeLocalReturnPath(requestedReturnTo, "/dashboard");
  const params = new URLSearchParams({ returnTo });
  return Object.freeze({ kind: "redirect", location: `/auth/start?${params.toString()}` });
}

export function projectOrganizerMemberships(
  memberships: readonly OrganizerMembershipRecord[]
): OrganizerWorkspace {
  const organizations = memberships
    .filter(
      (membership): membership is OrganizerMembershipRecord & { role: "OWNER" | "ADMIN" } =>
        ORGANIZER_ROLES.has(membership.role)
    )
    .map((membership) => ({
      id: membership.org.id,
      name: membership.org.name,
      slug: membership.org.slug,
      status: membership.org.status,
      role: membership.role,
      events: membership.org.events.map((event) => ({
        id: event.id,
        name: event.name,
        slug: event.slug,
        status: event.status,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString()
      }))
    }));

  return Object.freeze({
    organizations: Object.freeze(organizations),
    eventCount: organizations.reduce((total, organization) => total + organization.events.length, 0),
    isEmpty: organizations.length === 0
  });
}

export async function loadOrganizerWorkspace(
  userId: string,
  source: OrganizerAuthoritySource = prismaOrganizerAuthority
) {
  return projectOrganizerMemberships(await source.findMembershipsForUser(userId));
}
