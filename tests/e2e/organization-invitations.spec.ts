import { expect, test, type Page } from "@playwright/test";
import { PrismaClient, type OrgRole } from "@prisma/client";
import { createHash } from "node:crypto";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "InvitationPass123!";
const ownerEmail = `invitation-owner-${runId}@example.com`;
const inviteeEmail = `invitation-recipient-${runId}@example.com`;
const wrongEmail = `invitation-wrong-${runId}@example.com`;
const platformEmail = `invitation-platform-${runId}@example.com`;
const memberInviteEmail = `invitation-member-${runId}@example.com`;
const provisionedOwnerEmail = `invitation-provisioned-owner-${runId}@example.com`;
const orgSlug = `invitation-org-${runId}`;
const provisionedOrgSlug = `invitation-provisioned-${runId}`;
const acceptanceToken = `accept_${createHash("sha256").update(`${runId}:accept`).digest("base64url")}`;
const wrongEmailToken = `wrong_${createHash("sha256").update(`${runId}:wrong`).digest("base64url")}`;
const expiredToken = `expired_${createHash("sha256").update(`${runId}:expired`).digest("base64url")}`;
const revokedToken = `revoked_${createHash("sha256").update(`${runId}:revoked`).digest("base64url")}`;
const revokableToken = `revokable_${createHash("sha256").update(`${runId}:revokable`).digest("base64url")}`;

let orgId: string;
let ownerId: string;
let inviteeId: string;
let platformId: string;
let revokableInvitationId: string;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function seedInvitation(input: {
  token: string;
  email: string;
  role?: OrgRole;
  expiresAt?: Date;
  revokedAt?: Date;
}) {
  return prisma.orgInvitation.create({
    data: {
      orgId,
      email: input.email.toLowerCase(),
      role: input.role ?? "MEMBER",
      tokenHash: tokenHash(input.token),
      invitedById: ownerId,
      expiresAt: input.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      revokedAt: input.revokedAt,
      revokedById: input.revokedAt ? ownerId : undefined
    }
  });
}

async function loginAs(page: Page, email: string, returnTo = "/dashboard") {
  await loginAsStaffEmail(page, email, { returnTo });
}

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const [owner, invitee, wrongUser, platformAdmin] = await Promise.all([
    prisma.user.create({ data: { email: ownerEmail, name: "Invitation Owner", ...staffIdentityData() } }),
    prisma.user.create({ data: { email: inviteeEmail, name: "Invitation Recipient", ...staffIdentityData() } }),
    prisma.user.create({ data: { email: wrongEmail, name: "Wrong Recipient", ...staffIdentityData() } }),
    prisma.user.create({
      data: { email: platformEmail, name: "Invitation Platform Admin", ...staffIdentityData(), platformRole: "PLATFORM_ADMIN" }
    })
  ]);
  const org = await prisma.organization.create({
    data: {
      name: "Invitation Test Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: ownerEmail,
      status: "ACTIVE",
      statusUpdatedAt: new Date(),
      members: {
        create: {
          userId: owner.id,
          role: "OWNER"
        }
      }
    }
  });

  orgId = org.id;
  ownerId = owner.id;
  inviteeId = invitee.id;
  platformId = platformAdmin.id;

  await seedInvitation({ token: acceptanceToken, email: inviteeEmail, role: "ADMIN" });
  await seedInvitation({ token: wrongEmailToken, email: inviteeEmail });
  await seedInvitation({ token: expiredToken, email: inviteeEmail, expiresAt: new Date(Date.now() - 1000) });
  await seedInvitation({ token: revokedToken, email: inviteeEmail, revokedAt: new Date() });
  const revokable = await seedInvitation({ token: revokableToken, email: `revokable-${runId}@example.com` });
  revokableInvitationId = revokable.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({
    where: {
      slug: {
        in: [orgSlug, provisionedOrgSlug]
      }
    }
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [ownerEmail, inviteeEmail, wrongEmail, platformEmail]
      }
    }
  });
  await prisma.$disconnect();
});

test("a public visitor can inspect an invitation without receiving membership", async ({ page }) => {
  await page.goto(`/invitations/${acceptanceToken}`);

  await expect(page.getByRole("heading", { name: "Join Invitation Test Organization" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in with your Reyuu Games account" })).toHaveAttribute(
    "href",
    `/login?returnTo=${encodeURIComponent(`/invitations/${acceptanceToken}`)}`
  );
  await expect(page.getByRole("link", { name: "Create account" })).toHaveCount(0);
  await expect.poll(() => prisma.orgMember.count({ where: { userId: inviteeId, orgId } })).toBe(0);
});

test("acceptance is bound to the invited email", async ({ page }) => {
  const returnTo = `/invitations/${wrongEmailToken}`;
  await loginAs(page, wrongEmail, returnTo);

  await expect(page.getByText(`You are signed in as ${wrongEmail}.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  await expect.poll(() => prisma.orgMember.count({ where: { userId: inviteeId, orgId } })).toBe(0);
});

test("expired and revoked links cannot be accepted", async ({ page }) => {
  await page.goto(`/invitations/${expiredToken}`);
  await expect(page.getByText("This invitation has expired. Ask an organization owner to send a new one.")).toBeVisible();

  await page.goto(`/invitations/${revokedToken}`);
  await expect(page.getByText("This invitation has been revoked.")).toBeVisible();
});

test("an owner can revoke a pending invitation", async ({ page }) => {
  await loginAs(page, ownerEmail);
  await page.goto(`/dashboard/organizations/${orgId}/members`);
  const row = page.locator(".vf-list-row", { hasText: `revokable-${runId}@example.com` });
  await row.getByRole("button", { name: "Revoke" }).click();

  await expect.poll(
    async () => (await prisma.orgInvitation.findUnique({ where: { id: revokableInvitationId } }))?.revokedAt,
    { timeout: 30_000 }
  ).not.toBeNull();
});

test("member invitation stores a hash but creates neither a user nor a membership", async ({ page }) => {
  await loginAs(page, ownerEmail);
  await page.goto(`/dashboard/organizations/${orgId}/members`);
  await page.getByLabel("Email").fill(memberInviteEmail);
  await page.getByLabel("Role").selectOption("MEMBER");
  await page.getByRole("button", { name: "Send invitation" }).click();

  await expect.poll(() => prisma.orgInvitation.count({ where: { orgId, email: memberInviteEmail } }), { timeout: 30_000 }).toBe(1);
  const invitation = await prisma.orgInvitation.findFirstOrThrow({ where: { orgId, email: memberInviteEmail } });
  expect(invitation.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  expect(await prisma.user.count({ where: { email: memberInviteEmail } })).toBe(0);
  expect(await prisma.orgMember.count({ where: { user: { email: memberInviteEmail }, orgId } })).toBe(0);
});

test("acceptance creates one membership transactionally and cannot be replayed", async ({ page }) => {
  const returnTo = `/invitations/${acceptanceToken}`;
  await loginAs(page, inviteeEmail, returnTo);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page).toHaveURL(`/dashboard/organizations/${orgId}`, { timeout: 30_000 });

  const [invitation, memberships] = await Promise.all([
    prisma.orgInvitation.findUniqueOrThrow({ where: { tokenHash: tokenHash(acceptanceToken) } }),
    prisma.orgMember.findMany({ where: { userId: inviteeId, orgId } })
  ]);
  expect(invitation.acceptedAt).not.toBeNull();
  expect(invitation.acceptedById).toBe(inviteeId);
  expect(memberships).toHaveLength(1);
  expect(memberships[0]?.role).toBe("ADMIN");

  await page.goto(returnTo);
  await expect(page.getByText("This invitation has already been accepted.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  expect(await prisma.orgMember.count({ where: { userId: inviteeId, orgId } })).toBe(1);
});

test("platform provisioning creates a provisioning tenant and an owner invitation without implicit membership", async ({ page }) => {
  await loginAs(page, platformEmail, "/platform");
  await page.goto("/platform/organizations/new");
  await page.getByLabel("Name").fill("Reserved Slug Organization");
  await page.getByLabel("Subdomain slug").fill("www");
  await page.getByLabel("Contact email").fill(platformEmail);
  await page.getByLabel("Initial owner email").fill(provisionedOwnerEmail);
  await page.getByRole("button", { name: "Provision organization" }).click();
  await expect(page.getByTestId("create-organization-error")).toContainText("This slug is reserved by the platform.");
  await expect(page.getByLabel("Name")).toHaveValue("Reserved Slug Organization");
  await expect(page.getByLabel("Subdomain slug")).toHaveValue("www");
  await expect(page.getByRole("button", { name: "Provision organization" })).toBeEnabled();
  await expect(page.getByTestId("route-error")).toHaveCount(0);
  expect(await prisma.organization.count({ where: { slug: "www" } })).toBe(0);

  await page.getByLabel("Name").fill("Provisioned Invitation Organization");
  await page.getByLabel("Subdomain slug").fill(provisionedOrgSlug);
  await page.getByLabel("Contact email").fill(platformEmail);
  await page.getByLabel("Initial owner email").fill(provisionedOwnerEmail);
  await page.getByRole("button", { name: "Provision organization" }).click();

  await expect.poll(() => prisma.organization.count({ where: { slug: provisionedOrgSlug } }), { timeout: 30_000 }).toBe(1);
  const provisioned = await prisma.organization.findUniqueOrThrow({
    where: { slug: provisionedOrgSlug },
    include: { invitations: true, members: true }
  });
  expect(provisioned.status).toBe("PROVISIONING");
  expect(provisioned.statusUpdatedById).toBe(platformId);
  expect(provisioned.statusUpdatedAt).not.toBeNull();
  expect(provisioned.members).toHaveLength(0);
  expect(provisioned.invitations).toEqual([
    expect.objectContaining({
      email: provisionedOwnerEmail,
      role: "OWNER",
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      acceptedAt: null,
      revokedAt: null
    })
  ]);
});
