import { PrismaClient } from "@prisma/client";
import { hashOpaqueToken, hashPassword } from "@vfurst/auth/core";
import { randomBytes, randomUUID } from "node:crypto";

const prisma = new PrismaClient();

function readOption(name, fallback) {
  const prefix = `${name}=`;
  const arg = process.argv.slice(2).find((value) => value === name || value.startsWith(prefix));

  if (!arg) {
    return fallback;
  }

  if (arg === name) {
    return "true";
  }

  return arg.slice(prefix.length);
}

const runId = Date.now();
const registrationCount = Number(process.env.VFURST_LOAD_SEED_REGISTRATIONS ?? readOption("--registrations", "1500"));
const slug = process.env.VFURST_LOAD_ORG_SLUG ?? readOption("--slug", `load-${runId}`);
const adminEmail = process.env.VFURST_STAFF_EMAIL ?? `load-admin-${runId}@example.com`;
const staffSub = `load-admin-${slug}`;
const portalPort = process.env.VFURST_LOAD_SERVER_PORT ?? "3000";
const attendeeDomain = `load-${runId}.example.com`;
const portalSessionMaxAgeMs = 24 * 60 * 60 * 1_000;

async function main() {
  if (!Number.isInteger(registrationCount) || registrationCount < 1) {
    throw new Error("--registrations must be a positive integer.");
  }

  await prisma.organization.deleteMany({
    where: {
      slug
    }
  });

  const admin = await prisma.user.upsert({
    where: {
      email: adminEmail
    },
    update: {
      name: "Load Test Admin",
      emailVerified: new Date()
    },
    create: {
      email: adminEmail,
      name: "Load Test Admin",
      emailVerified: new Date()
    }
  });

  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: "authentik",
        providerAccountId: staffSub
      }
    },
    update: {
      userId: admin.id
    },
    create: {
      userId: admin.id,
      type: "oidc",
      provider: "authentik",
      providerAccountId: staffSub
    }
  });

  const org = await prisma.organization.create({
    data: {
      name: "Load Test Convention",
      slug,
      subdomain: slug,
      status: "ACTIVE",
      statusUpdatedAt: new Date(),
      statusUpdatedById: admin.id,
      contactEmail: "load@example.com",
      members: {
        create: {
          userId: admin.id,
          role: "OWNER"
        }
      }
    }
  });

  const event = await prisma.event.create({
    data: {
      orgId: org.id,
      name: "Load Test 2027",
      slug: "load-test-2027",
      description: "Seeded Phase 7 load-test event.",
      venue: "Load Hall",
      startDate: new Date("2027-08-01T09:00:00Z"),
      endDate: new Date("2027-08-03T17:00:00Z"),
      status: "PUBLISHED",
      registrationForm: {
        emergencyContacts: { mode: "required", count: 2 },
        questions: [
          { id: randomUUID(), type: "select", label: "T-shirt size", required: true, options: ["S", "M", "L"] },
          { id: randomUUID(), type: "text", label: "Dietary needs", required: false }
        ]
      },
      settings: {
        requireApproval: false,
        allowTransfers: true,
        maxRegistrationsPerUser: 1
      }
    }
  });

  const sections = [];
  for (let section = 1; sections.join("\n\n").length < 30_000; section++) {
    sections.push(`## Section ${section}\n\nTreat every attendee with respect, follow staff instructions, and help keep the convention welcoming and safe for everyone.`);
  }
  for (const [sortOrder, title, body] of [
    [0, "Load Code of Conduct", sections.join("\n\n")],
    [1, "Load Refund Policy", "Contact the organizer before the event to request a refund."]
  ]) {
    const document = await prisma.policyDocument.create({ data: { orgId: org.id, eventId: event.id, sortOrder } });
    await prisma.policyDocumentVersion.create({ data: { orgId: org.id, documentId: document.id, version: 1,
      title, body, publishedByUserId: admin.id } });
  }

  const registrationType = await prisma.registrationType.create({
    data: {
      orgId: org.id,
      eventId: event.id,
      name: "Load General",
      price: 0,
      maxCapacity: registrationCount + 1000,
      sortOrder: 0
    }
  });

  const badgeTemplate = await prisma.badgeTemplate.create({
    data: {
      orgId: org.id,
      eventId: event.id,
      name: "Load Badge",
      dimensions: {
        width: 400,
        height: 250
      },
      layout: {
        width: 400,
        height: 250,
        elements: []
      }
    }
  });

  const portalAccounts = Array.from({ length: registrationCount }, (_, index) => ({
    id: randomUUID(),
    orgId: org.id,
    email: `attendee-${index + 1}@${attendeeDomain}`,
    name: `Load Attendee ${index + 1}`
  }));
  const attendeeProfiles = portalAccounts.map((account) => ({
    id: randomUUID(),
    orgId: org.id,
    portalAccountId: account.id,
    accountHolderOf: account.id,
    fullName: account.name,
    emergencyContacts: [{ name: "Load Contact", country: "VN", phone: "+84812205668" }]
  }));
  const registrations = portalAccounts.map((account, index) => ({
    id: randomUUID(),
    orgId: org.id,
    eventId: event.id,
    portalAccountId: account.id,
    attendeeProfileId: attendeeProfiles[index].id,
    typeId: registrationType.id,
    status: "CONFIRMED",
    badgeNumber: `LOAD-${String(index + 1).padStart(5, "0")}`
  }));
  const orders = portalAccounts.map((account) => ({
    id: randomUUID(),
    orgId: org.id,
    eventId: event.id,
    portalAccountId: account.id,
    total: 0,
    platformFee: 0,
    status: "PAID"
  }));
  const orderItems = registrations.map((registration, index) => ({
    id: randomUUID(),
    orgId: org.id,
    orderId: orders[index].id,
    itemType: "REGISTRATION",
    refId: registration.id,
    registrationId: registration.id,
    unitPrice: 0,
    quantity: 1
  }));
  const badges = registrations.map((registration) => ({
    id: randomUUID(),
    orgId: org.id,
    registrationId: registration.id,
    templateId: badgeTemplate.id,
    barcodeData: `LOAD-${registration.id}`
  }));

  // The session holder has finished account setup, as every real portal session's owner has.
  portalAccounts[0].passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
  portalAccounts[0].emailVerifiedAt = new Date();

  await prisma.portalAccount.createMany({ data: portalAccounts });
  await prisma.attendeeProfile.createMany({ data: attendeeProfiles });
  await prisma.registration.createMany({ data: registrations });
  await prisma.order.createMany({ data: orders });
  await prisma.orderItem.createMany({ data: orderItems });
  await prisma.badge.createMany({ data: badges });

  const portalSessionToken = randomBytes(32).toString("base64url");
  await prisma.portalSession.create({
    data: {
      orgId: org.id,
      portalAccountId: portalAccounts[0].id,
      tokenHash: hashOpaqueToken(portalSessionToken),
      authVersion: 0,
      expiresAt: new Date(Date.now() + portalSessionMaxAgeMs)
    }
  });

  console.log(`Seeded ${registrationCount} confirmed registrations for ${org.name}.`);
  console.log("");
  console.log("PowerShell environment:");
  console.log(`$env:VFURST_BASE_URL="http://127.0.0.1:3000"`);
  console.log(`$env:VFURST_LOAD_ORG_SLUG="${org.subdomain}"`);
  console.log(`$env:VFURST_LOAD_EVENT_ID="${event.id}"`);
  console.log(`$env:VFURST_STAFF_EMAIL="${admin.email}"`);
  console.log(`$env:VFURST_STAFF_SUB="${staffSub}"`);
  console.log(`$env:VFURST_PORTAL_HOST="${org.subdomain}.localhost:${portalPort}"`);
  console.log(`$env:VFURST_PORTAL_SESSION_COOKIE="vfurst-portal=${portalSessionToken}"`);
  console.log("");
  console.log("Sign the staff user in through the mock OIDC provider and set VFURST_STAFF_COOKIE,");
  console.log("or let npm run test:load:launch do both.");
  console.log("");
  console.log("Run the smoke profile first:");
  console.log("npm run test:load:smoke");
  console.log("");
  console.log("Then run the full Phase 7 profile:");
  console.log("npm run test:load");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
