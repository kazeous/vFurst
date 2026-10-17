import { PrismaClient } from "@prisma/client";
import { log } from "node:console";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { resolveAppEnv } from "../../../scripts/lib/env-file.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function isFixtureOrganizationSlug(slug) {
  return (
    /^load-.+$/i.test(slug) ||
    /^phase.*-smoke-.+$/i.test(slug) ||
    /^.+-org-a-.+$/i.test(slug) ||
    /^.+-org-b-.+$/i.test(slug)
  );
}

export function isFixtureUserEmail(email) {
  return (
    /^load-admin-[^@]+@example[.]com$/i.test(email) ||
    /^[^@]+@load-[a-z0-9-]+[.]example[.]com$/i.test(email)
  );
}

function isSyntheticLinkedUserEmail(email) {
  return email.toLowerCase().endsWith("@example.com");
}

function uniqueById(rows) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

export async function inspectTestFixtures(client) {
  const [organizations, loadUsers] = await Promise.all([
    client.organization.findMany({
      select: {
        id: true,
        slug: true,
        controlPlaneOutboxEvents: { select: { id: true } }
      }
    }),
    client.user.findMany({
      where: {
        OR: [{ email: { startsWith: "load-admin-" } }, { email: { contains: "@load-" } }]
      },
      select: { id: true, email: true }
    })
  ]);
  const fixtureOrganizations = organizations.filter(({ slug }) => isFixtureOrganizationSlug(slug));
  const organizationIds = fixtureOrganizations.map(({ id }) => id);
  const linkedUsers =
    organizationIds.length === 0
      ? []
      : await client.user.findMany({
          where: {
            OR: [{ orgMemberships: { some: { orgId: { in: organizationIds } } } }]
          },
          select: { id: true, email: true }
        });
  const users = uniqueById([
    ...loadUsers.filter(({ email }) => isFixtureUserEmail(email)),
    ...linkedUsers.filter(({ email }) => isSyntheticLinkedUserEmail(email))
  ]);

  return {
    organizations: fixtureOrganizations,
    users,
    outboxEventIds: fixtureOrganizations.flatMap(({ controlPlaneOutboxEvents }) =>
      controlPlaneOutboxEvents.map(({ id }) => id)
    )
  };
}

export async function cleanupTestFixtures(client, { apply = false } = {}) {
  const fixtures = await inspectTestFixtures(client);
  const preview = {
    organizations: fixtures.organizations.length,
    users: fixtures.users.length,
    outboxEvents: fixtures.outboxEventIds.length,
    slugs: fixtures.organizations.map(({ slug }) => slug).sort()
  };

  if (!apply) {
    return { applied: false, ...preview };
  }

  const organizationIds = fixtures.organizations.map(({ id }) => id);
  const userIds = fixtures.users.map(({ id }) => id);

  const deleted = await client.$transaction(async (tx) => {
    const organizations =
      organizationIds.length === 0
        ? { count: 0 }
        : await tx.organization.deleteMany({ where: { id: { in: organizationIds } } });

    if (fixtures.outboxEventIds.length > 0) {
      const detachedOutboxEvents = await tx.controlPlaneOutboxEvent.count({
        where: {
          id: { in: fixtures.outboxEventIds },
          organizationId: null
        }
      });

      if (detachedOutboxEvents !== fixtures.outboxEventIds.length) {
        throw new Error("Fixture organizations were deleted without preserving every outbox event as detached history.");
      }
    }

    const outboxEvents =
      fixtures.outboxEventIds.length === 0
        ? { count: 0 }
        : await tx.controlPlaneOutboxEvent.deleteMany({
            where: { id: { in: fixtures.outboxEventIds } }
          });
    const users =
      userIds.length === 0 ? { count: 0 } : await tx.user.deleteMany({ where: { id: { in: userIds } } });

    return {
      organizations: organizations.count,
      users: users.count,
      outboxEvents: outboxEvents.count
    };
  });

  return { applied: true, matched: preview, deleted };
}

function localDatabaseUrl() {
  const env = resolveAppEnv(
    [
      join(repositoryRoot, ".env.local"),
      join(repositoryRoot, ".env"),
      join(repositoryRoot, "packages", "db", ".env")
    ],
    process.env
  );
  const value = env.DIRECT_DATABASE_URL?.trim() || env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error("DIRECT_DATABASE_URL or DATABASE_URL is required for fixture cleanup.");
  }

  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`Fixture cleanup only runs against a local database host; received ${url.hostname}.`);
  }

  return value;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const unknownOptions = process.argv.slice(2).filter((value) => value !== "--apply");
  if (unknownOptions.length > 0) {
    throw new Error(`Unknown fixture-cleanup option(s): ${unknownOptions.join(", ")}`);
  }

  const apply = process.argv.includes("--apply");
  const prisma = new PrismaClient({ datasourceUrl: localDatabaseUrl() });

  try {
    const result = await cleanupTestFixtures(prisma, { apply });
    log(JSON.stringify(result, null, 2));
    if (!apply) log("Dry run only. Re-run with --apply to delete the matched local fixtures.");
  } finally {
    await prisma.$disconnect();
  }
}
