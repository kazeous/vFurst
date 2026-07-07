import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

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
const password = process.env.VFURST_STAFF_PASSWORD ?? "LoadPass123!";
const adminEmail = process.env.VFURST_STAFF_EMAIL ?? `load-admin-${runId}@example.com`;
const attendeeDomain = `load-${runId}.example.com`;

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
      passwordHash: await bcrypt.hash(password, 12)
    },
    create: {
      email: adminEmail,
      name: "Load Test Admin",
      passwordHash: await bcrypt.hash(password, 12)
    }
  });

  const org = await prisma.organization.create({
    data: {
      name: "Load Test Convention",
      slug,
      subdomain: slug,
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
      settings: {
        requireApproval: false,
        allowTransfers: true,
        maxRegistrationsPerUser: 1
      }
    }
  });

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

  const users = Array.from({ length: registrationCount }, (_, index) => ({
    id: randomUUID(),
    email: `attendee-${index + 1}@${attendeeDomain}`,
    name: `Load Attendee ${index + 1}`
  }));
  const registrations = users.map((user, index) => ({
    id: randomUUID(),
    orgId: org.id,
    eventId: event.id,
    userId: user.id,
    typeId: registrationType.id,
    status: "CONFIRMED",
    badgeNumber: `LOAD-${String(index + 1).padStart(5, "0")}`
  }));
  const orders = users.map((user) => ({
    id: randomUUID(),
    orgId: org.id,
    eventId: event.id,
    userId: user.id,
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

  await prisma.user.createMany({ data: users });
  await prisma.registration.createMany({ data: registrations });
  await prisma.order.createMany({ data: orders });
  await prisma.orderItem.createMany({ data: orderItems });
  await prisma.badge.createMany({ data: badges });

  console.log(`Seeded ${registrationCount} confirmed registrations for ${org.name}.`);
  console.log("");
  console.log("PowerShell environment:");
  console.log(`$env:VFURST_BASE_URL="http://127.0.0.1:3000"`);
  console.log(`$env:VFURST_LOAD_ORG_SLUG="${org.subdomain}"`);
  console.log(`$env:VFURST_LOAD_EVENT_ID="${event.id}"`);
  console.log(`$env:VFURST_STAFF_EMAIL="${admin.email}"`);
  console.log(`$env:VFURST_STAFF_PASSWORD="${password}"`);
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
