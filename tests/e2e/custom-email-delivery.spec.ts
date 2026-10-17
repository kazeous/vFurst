import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHmac, randomBytes } from "node:crypto";
import { createPortalAccountFixture, portalOrigin } from "./support/portal";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "CustomEmailPass123!";
const ownerEmail = `custom-email-owner-${runId}@example.com`;
const attendeeEmail = `custom-email-attendee-${runId}@example.com`;
const volunteerEmail = `custom-email-volunteer-${runId}@example.com`;
const vendorEmail = `custom-email-vendor-${runId}@example.com`;
const recipientEmail = `custom-email-recipient-${runId}@example.com`;
const orgSlug = `custom-email-org-${runId}`;
const sepaySecret = process.env.SEPAY_WEBHOOK_SECRET ?? "e2e-sepay-webhook-secret";

const markers = {
  registration: `CUSTOM-REG-${runId}`,
  receipt: `CUSTOM-RECEIPT-${runId}`,
  volunteer: `CUSTOM-VOLUNTEER-${runId}`,
  vendor: `CUSTOM-VENDOR-${runId}`,
  transfer: `CUSTOM-TRANSFER-${runId}`
};

let ownerId: string;
let orgId: string;
let eventId: string;
let registrationId: string;
let orderId: string;
let paymentCode: string;
let volunteerApplicationId: string;
let vendorApplicationId: string;

type MailpitMessage = {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
};

type MailpitMessageDetail = MailpitMessage & {
  HTML: string;
  Text: string;
};

test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);
test.use({ serviceWorkers: "block" });

async function latestMail(marker: string, recipient: string) {
  const response = await fetch("http://127.0.0.1:8025/api/v1/messages");
  if (!response.ok) return null;
  const body = (await response.json()) as { messages?: MailpitMessage[] };
  return body.messages?.find(
    (message) => message.Subject.includes(marker) && message.To.some((entry) => entry.Address === recipient)
  ) ?? null;
}

async function waitForMail(marker: string, recipient: string) {
  await expect.poll(async () => Boolean(await latestMail(marker, recipient)), { timeout: 20_000 }).toBe(true);
  const message = await latestMail(marker, recipient);
  if (!message) throw new Error(`Expected ${marker} email for ${recipient}.`);
  const response = await fetch(`http://127.0.0.1:8025/api/v1/message/${message.ID}`);
  expect(response.ok).toBe(true);
  return (await response.json()) as MailpitMessageDetail;
}

async function login(page: Page) {
  await loginAsStaffEmail(page, ownerEmail);
}

test.beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: ownerEmail, name: "Custom Email Owner", ...staffIdentityData() } });
  ownerId = owner.id;

  const org = await prisma.organization.create({
    data: {
      name: "Custom Email Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: ownerEmail,
      status: "ACTIVE",
      members: { create: { userId: owner.id, role: "OWNER" } },
      events: {
        create: {
          name: "Custom Email Event <2028>",
          slug: "custom-email-event",
          status: "PUBLISHED",
          startDate: new Date("2028-08-01T09:00:00Z"),
          endDate: new Date("2028-08-03T17:00:00Z"),
          currency: "VND",
          settings: {
            requireApproval: false,
            allowTransfers: true,
            maxRegistrationsPerUser: 2,
            emailTemplates: {
              "registration-confirmation": {
                subject: `${markers.registration} {{event.name}}`,
                html: "<p>Registered: {{attendee.name}} at {{event.name}}</p>",
                text: "Registered: {{attendee.name}} at {{event.name}}"
              },
              "payment-receipt": {
                subject: `${markers.receipt} {{event.name}}`,
                html: "<p>Paid {{order.total}} {{order.currency}} by {{attendee.name}}</p>",
                text: "Paid {{order.total}} {{order.currency}} by {{attendee.name}}"
              },
              "volunteer-approval": {
                subject: `${markers.volunteer} {{volunteer.status}}`,
                html: "<p>{{attendee.name}}: {{volunteer.status}} / {{volunteer.reason}}</p>",
                text: "{{attendee.name}}: {{volunteer.status}} / {{volunteer.reason}}"
              },
              "vendor-status": {
                subject: `${markers.vendor} {{vendor.status}}`,
                html: "<p>{{vendor.business}}: {{vendor.status}} / {{vendor.note}}</p>",
                text: "{{vendor.business}}: {{vendor.status}} / {{vendor.note}}"
              },
              "transfer-request": {
                subject: `${markers.transfer} {{event.name}}`,
                html: "<p>{{transfer.source}}</p><a href=\"{{transfer.url}}\">Review</a><p>{{transfer.expiresAt}}</p>",
                text: "{{transfer.source}}\n{{transfer.url}}\n{{transfer.expiresAt}}"
              }
            }
          }
        }
      }
    },
    include: { events: true }
  });
  orgId = org.id;
  eventId = org.events[0]!.id;

  const attendee = await createPortalAccountFixture(prisma, { orgId: org.id, email: attendeeEmail, name: "Attendee <One> & Co", password });
  const volunteer = await createPortalAccountFixture(prisma, { orgId: org.id, email: volunteerEmail, name: "Volunteer <Unsafe>", password });
  const vendor = await createPortalAccountFixture(prisma, { orgId: org.id, email: vendorEmail, name: "Vendor Contact", password });

  const [tier, department] = await Promise.all([
    prisma.registrationType.create({ data: { orgId, eventId, name: "Email Delivery Tier", price: 75_000 } }),
    prisma.department.create({ data: { orgId, eventId, name: "Email Delivery Volunteers" } })
  ]);

  const registration = await prisma.registration.create({
    data: {
      orgId,
      eventId,
      portalAccountId: attendee.id,
      typeId: tier.id,
      status: "PENDING",
      approvalStatus: "APPROVED"
    }
  });
  registrationId = registration.id;

  const order = await prisma.order.create({
    data: {
      orgId,
      eventId,
      portalAccountId: attendee.id,
      total: 75_000,
      platformFee: 25_000,
      currency: "VND",
      items: {
        create: {
          orgId,
          itemType: "REGISTRATION",
          refId: registration.id,
          registrationId: registration.id,
          unitPrice: 75_000,
          quantity: 1
        }
      }
    }
  });
  orderId = order.id;
  paymentCode = `VF${randomBytes(6).toString("hex").toUpperCase()}`;
  await prisma.paymentAttempt.create({
    data: {
      orderId: order.id,
      activeOrderId: order.id,
      provider: "SEPAY",
      amount: order.total,
      currency: "VND",
      paymentCode,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });

  const [volunteerApplication, vendorApplication] = await Promise.all([
    prisma.volunteerApplication.create({
      data: { orgId, eventId, portalAccountId: volunteer.id, departmentId: department.id }
    }),
    prisma.vendorApplication.create({
      data: {
        orgId,
        eventId,
        portalAccountId: vendor.id,
        businessName: "Vendor <Studio> & Co",
        contactName: "Vendor Contact",
        contactEmail: vendor.email
      }
    })
  ]);
  volunteerApplicationId = volunteerApplication.id;
  vendorApplicationId = vendorApplication.id;

  await prisma.paymentProviderConfig.upsert({
    where: { provider: "SEPAY" },
    update: {
      enabled: true,
      updatedById: owner.id,
      settings: {
        bankCode: "VCB",
        accountNumber: "123456789",
        accountHolder: "VFURST PLATFORM",
        bankAccountId: "custom-email-bank",
        memoPrefix: "VFURST",
        registrationFeeVnd: 25_000,
        hotelFeeVnd: 25_000
      }
    },
    create: {
      provider: "SEPAY",
      enabled: true,
      updatedById: owner.id,
      settings: {
        bankCode: "VCB",
        accountNumber: "123456789",
        accountHolder: "VFURST PLATFORM",
        bankAccountId: "custom-email-bank",
        memoPrefix: "VFURST",
        registrationFeeVnd: 25_000,
        hotelFeeVnd: 25_000
      }
    }
  });
});

test.afterAll(async () => {
  await prisma.paymentProviderConfig.updateMany({ where: { provider: "SEPAY", updatedById: ownerId }, data: { updatedById: null } });
  await prisma.emailDelivery.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({
    where: { email: { in: [ownerEmail, attendeeEmail, volunteerEmail, vendorEmail, recipientEmail] } }
  });
  await prisma.$disconnect();
});

test("paid registration delivers saved registration confirmation and payment receipt templates", async ({ page }) => {
  const body = JSON.stringify({
    id: `custom-email-payment-${runId}`,
    accountNumber: "123456789",
    code: paymentCode,
    content: `VFURST ${paymentCode}`,
    transferType: "in",
    transferAmount: 75_000
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `sha256=${createHmac("sha256", sepaySecret).update(`${timestamp}.${body}`).digest("hex")}`;
  const response = await page.request.post("/api/webhooks/sepay", {
    data: body,
    headers: { "content-type": "application/json", "x-sepay-timestamp": timestamp, "x-sepay-signature": signature }
  });
  expect(response.status()).toBe(200);
  await expect.poll(async () => (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PAID");

  const registrationMail = await waitForMail(markers.registration, attendeeEmail);
  expect(registrationMail.HTML).toContain("Attendee &lt;One&gt; &amp; Co");
  expect(registrationMail.Text).toContain("Attendee <One> & Co");

  const receiptMail = await waitForMail(markers.receipt, attendeeEmail);
  expect(receiptMail.Text).toContain("VND");
  expect(receiptMail.Text).toContain("Attendee <One> & Co");
});

test("volunteer and vendor decisions deliver their saved event templates", async ({ page }) => {
  await login(page);
  await page.goto(`/dashboard/events/${eventId}/staff/applications`);
  const volunteerSection = page
    .getByRole("heading", { name: "Volunteer <Unsafe>" })
    .locator("xpath=ancestor::div[contains(@class,'vf-section')][1]");
  await volunteerSection.getByLabel("Rejection reason").fill("Unsafe <reason> & detail");
  await volunteerSection.getByRole("button", { name: "Reject" }).click({ noWaitAfter: true });
  await expect.poll(async () => (await prisma.volunteerApplication.findUniqueOrThrow({ where: { id: volunteerApplicationId } })).status).toBe("REJECTED");

  const volunteerMail = await waitForMail(markers.volunteer, volunteerEmail);
  expect(volunteerMail.HTML).toContain("Volunteer &lt;Unsafe&gt;");
  expect(volunteerMail.HTML).toContain("Unsafe &lt;reason&gt; &amp; detail");
  expect(volunteerMail.Text).toContain("Volunteer <Unsafe>");

  await page.goto(`/dashboard/events/${eventId}/vendors`);
  const vendorSection = page
    .getByRole("heading", { name: "Vendor <Studio> & Co" })
    .locator("xpath=ancestor::div[contains(@class,'vf-section')][1]");
  const rejectForm = vendorSection.getByRole("button", { name: "Reject" }).locator("xpath=ancestor::form");
  await rejectForm.getByPlaceholder("Optional note").fill("Vendor <note> & detail");
  await rejectForm.getByRole("button", { name: "Reject" }).click({ noWaitAfter: true });
  await expect.poll(async () => (await prisma.vendorApplication.findUniqueOrThrow({ where: { id: vendorApplicationId } })).status).toBe("REJECTED");

  const vendorMail = await waitForMail(markers.vendor, vendorEmail);
  expect(vendorMail.HTML).toContain("Vendor &lt;Studio&gt; &amp; Co");
  expect(vendorMail.HTML).toContain("Vendor &lt;note&gt; &amp; detail");
  expect(vendorMail.Text).toContain("Vendor <Studio> & Co");
});

test("transfer requests deliver the saved template with a safe single-use URL", async ({ page }) => {
  await login(page);
  await page.goto(`/dashboard/events/${eventId}/registrations/transfers`);
  const form = page.getByRole("heading", { name: "Request transfer" }).locator("xpath=ancestor::form");
  await form.getByLabel("Recipient email").fill(recipientEmail);
  await form.getByRole("button", { name: "Send transfer email" }).click({ noWaitAfter: true });
  await expect.poll(() => prisma.registrationTransferRequest.count({ where: { sourceRegistrationId: registrationId } })).toBe(1);

  const transferMail = await waitForMail(markers.transfer, recipientEmail);
  expect(transferMail.HTML).toContain("Attendee &lt;One&gt; &amp; Co");
  expect(transferMail.HTML).toContain(`href="${portalOrigin(orgSlug)}/account/transfers/`);
  expect(transferMail.Text).toContain(`${portalOrigin(orgSlug)}/account/transfers/`);
});
