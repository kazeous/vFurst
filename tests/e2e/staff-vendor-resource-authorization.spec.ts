import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createPortalAccountFixture, loginAsAttendee, portalOrigin } from "./support/portal";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "StaffVendorResourcePass123!";
const ownerAEmail = `staff-vendor-owner-a-${runId}@example.com`;
const ownerBEmail = `staff-vendor-owner-b-${runId}@example.com`;
const volunteerAEmail = `staff-volunteer-a-${runId}@example.com`;
const volunteerBEmail = `staff-volunteer-b-${runId}@example.com`;
const vendorAEmail = `resource-vendor-a-${runId}@example.com`;
const vendorBEmail = `resource-vendor-b-${runId}@example.com`;
const tamperedVolunteerEmail = `tampered-volunteer-${runId}@example.com`;
const invalidVendorEmail = `invalid-vendor-${runId}@example.com`;
const forgedVendorEmail = `forged-vendor-${runId}@example.com`;
const orgASlug = `staff-vendor-org-a-${runId}`;
const orgBSlug = `staff-vendor-org-b-${runId}`;
const departmentAName = `Department A ${runId}`;
const departmentBName = `Department B ${runId}`;
const roleAName = `Role A ${runId}`;
const roleBName = `Role B ${runId}`;
const vendorAName = `Vendor A ${runId}`;
const vendorBName = `Vendor B ${runId}`;
const invalidVendorName = `Invalid upload vendor ${runId}`;
const forgedVendorName = `Forged upload vendor ${runId}`;

let eventAId: string;
let eventBId: string;
let departmentAId: string;
let departmentBId: string;
let roleAId: string;
let roleBId: string;
let volunteerApplicationAId: string;
let volunteerApplicationBId: string;
let assignmentAId: string;
let assignmentBId: string;
let vendorApplicationAId: string;
let vendorApplicationBId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const [ownerA, ownerB] = await Promise.all([
    prisma.user.create({ data: { email: ownerAEmail, name: "Staff Vendor Owner A", ...staffIdentityData() } }),
    prisma.user.create({ data: { email: ownerBEmail, name: "Staff Vendor Owner B", ...staffIdentityData() } })
  ]);

  const [orgA, orgB] = await Promise.all([
    prisma.organization.create({
      data: {
        name: "Staff Vendor Organization A",
        slug: orgASlug,
        subdomain: orgASlug,
        contactEmail: ownerAEmail,
        status: "ACTIVE",
        members: {
          create: {
            userId: ownerA.id,
            role: "OWNER"
          }
        },
        events: {
          create: {
            name: "Staff Vendor Event A",
            slug: "staff-vendor-event-a",
            startDate: new Date("2030-01-10T09:00:00Z"),
            endDate: new Date("2030-01-11T17:00:00Z"),
            status: "PUBLISHED",
            currency: "VND",
            settings: {
              vendorConfig: {
                tableTypes: [{ id: "table-standard", name: "Standard table", price: 200_000 }],
                amenities: [{ id: "amenity-power", name: "Power", price: 50_000 }],
                booths: [{ id: "booth-a-01", label: "A-01", status: "AVAILABLE" }]
              }
            }
          }
        }
      },
      include: {
        events: true
      }
    }),
    prisma.organization.create({
      data: {
        name: "Staff Vendor Organization B",
        slug: orgBSlug,
        subdomain: orgBSlug,
        contactEmail: ownerBEmail,
        status: "ACTIVE",
        members: {
          create: {
            userId: ownerB.id,
            role: "OWNER"
          }
        },
        events: {
          create: {
            name: "Staff Vendor Event B",
            slug: "staff-vendor-event-b",
            startDate: new Date("2030-02-10T09:00:00Z"),
            endDate: new Date("2030-02-11T17:00:00Z"),
            status: "PUBLISHED",
            currency: "USD",
            settings: {
              vendorConfig: {
                tableTypes: [{ id: "table-foreign", name: "Foreign table", price: 3_000 }],
                amenities: [],
                booths: [{ id: "booth-b-01", label: "B-01", status: "AVAILABLE" }]
              }
            }
          }
        }
      },
      include: {
        events: true
      }
    })
  ]);

  eventAId = orgA.events[0]!.id;

  const volunteerA = await createPortalAccountFixture(prisma, { orgId: orgA.id, email: volunteerAEmail, name: "Volunteer A", password });
  const volunteerB = await createPortalAccountFixture(prisma, { orgId: orgB.id, email: volunteerBEmail, name: "Volunteer B", password });
  const vendorA = await createPortalAccountFixture(prisma, { orgId: orgA.id, email: vendorAEmail, name: "Vendor Contact A", password });
  const vendorB = await createPortalAccountFixture(prisma, { orgId: orgB.id, email: vendorBEmail, name: "Vendor Contact B", password });

  eventBId = orgB.events[0]!.id;

  const [departmentA, departmentB] = await Promise.all([
    prisma.department.create({
      data: {
        orgId: orgA.id,
        eventId: eventAId,
        name: departmentAName,
        formSchema: []
      }
    }),
    prisma.department.create({
      data: {
        orgId: orgB.id,
        eventId: eventBId,
        name: departmentBName,
        formSchema: []
      }
    })
  ]);

  departmentAId = departmentA.id;
  departmentBId = departmentB.id;

  const [roleA, roleB] = await Promise.all([
    prisma.staffRole.create({
      data: {
        orgId: orgA.id,
        departmentId: departmentA.id,
        roleName: roleAName,
        shifts: [{ date: "2030-01-10", startTime: "09:00", endTime: "13:00", label: "Morning A" }]
      }
    }),
    prisma.staffRole.create({
      data: {
        orgId: orgB.id,
        departmentId: departmentB.id,
        roleName: roleBName,
        shifts: [{ date: "2030-02-10", startTime: "09:00", endTime: "13:00", label: "Morning B" }]
      }
    })
  ]);

  roleAId = roleA.id;
  roleBId = roleB.id;

  const [volunteerApplicationA, volunteerApplicationB] = await Promise.all([
    prisma.volunteerApplication.create({
      data: {
        orgId: orgA.id,
        eventId: eventAId,
        departmentId: departmentA.id,
        portalAccountId: volunteerA.id,
        status: "APPROVED",
        availability: [],
        formResponses: {}
      }
    }),
    prisma.volunteerApplication.create({
      data: {
        orgId: orgB.id,
        eventId: eventBId,
        departmentId: departmentB.id,
        portalAccountId: volunteerB.id,
        status: "APPROVED",
        availability: [],
        formResponses: {}
      }
    })
  ]);

  volunteerApplicationAId = volunteerApplicationA.id;
  volunteerApplicationBId = volunteerApplicationB.id;

  const [assignmentA, assignmentB] = await Promise.all([
    prisma.staffAssignment.create({
      data: {
        orgId: orgA.id,
        portalAccountId: volunteerA.id,
        roleId: roleA.id,
        volunteerApplicationId: volunteerApplicationA.id,
        shiftSlot: { date: "2030-01-10", startTime: "09:00", endTime: "13:00", label: "Morning A" }
      }
    }),
    prisma.staffAssignment.create({
      data: {
        orgId: orgB.id,
        portalAccountId: volunteerB.id,
        roleId: roleB.id,
        volunteerApplicationId: volunteerApplicationB.id,
        shiftSlot: { date: "2030-02-10", startTime: "09:00", endTime: "13:00", label: "Morning B" }
      }
    })
  ]);

  assignmentAId = assignmentA.id;
  assignmentBId = assignmentB.id;

  const [vendorApplicationA, vendorApplicationB] = await Promise.all([
    prisma.vendorApplication.create({
      data: {
        orgId: orgA.id,
        eventId: eventAId,
        portalAccountId: vendorA.id,
        contactName: "Vendor Contact A",
        contactEmail: vendorA.email,
        businessName: vendorAName,
        boothPrice: 125_000,
        status: "APPROVED",
        assistants: [],
        amenities: [],
        files: []
      }
    }),
    prisma.vendorApplication.create({
      data: {
        orgId: orgB.id,
        eventId: eventBId,
        portalAccountId: vendorB.id,
        contactName: "Vendor Contact B",
        contactEmail: vendorB.email,
        businessName: vendorBName,
        boothPrice: 3_000,
        status: "APPROVED",
        assistants: [],
        amenities: [],
        files: []
      }
    })
  ]);

  vendorApplicationAId = vendorApplicationA.id;
  vendorApplicationBId = vendorApplicationB.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({
    where: {
      slug: {
        in: [orgASlug, orgBSlug]
      }
    }
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          ownerAEmail,
          ownerBEmail,
          volunteerAEmail,
          volunteerBEmail,
          vendorAEmail,
          vendorBEmail,
          tamperedVolunteerEmail,
          invalidVendorEmail,
          forgedVendorEmail
        ]
      }
    }
  });
  await prisma.$disconnect();
});

async function loginAsOwnerA(page: Page) {
  await loginAsStaffEmail(page, ownerAEmail);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible({ timeout: 30_000 });
}

async function loginAs(page: Page, email: string) {
  await loginAsAttendee(page, { subdomain: orgASlug }, email, { password });
}

/**
 * Opens pathname after a tampered action has been rejected. The action throws
 * on the server, so its POST answers 500 and the route error boundary
 * replaces the page; nothing navigates. Waiting for the boundary asserts the
 * rejection the user sees, and the goto starts only after the page has
 * finished handling the action.
 */
async function navigateAfterRejectedAction(page: Page, pathname: string) {
  await expect(page.getByTestId("route-error")).toBeVisible();
  await page.goto(pathname);
}

async function submitAction(page: Page, pathname: string, form: Locator, buttonName: string) {
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === new URL(pathname, "http://localhost:3000").pathname && response.request().method() === "POST"
  );
  await form.evaluate((formElement, name) => {
    const form = formElement as HTMLFormElement;
    const button = Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(
      (candidate) => candidate.textContent?.trim() === name
    );
    if (!button) throw new Error("Expected mutation submit button was not found.");
    form.requestSubmit(button);
  }, buttonName);
  await responsePromise;
}

async function submitTamperedAction(
  page: Page,
  pathname: string,
  form: Locator,
  buttonName: string,
  fieldName: string,
  fieldValue: string
) {
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === new URL(pathname, "http://localhost:3000").pathname && response.request().method() === "POST"
  );
  await form.evaluate(
    (formElement, tamper) => {
      const form = formElement as HTMLFormElement;
      const control = form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${tamper.fieldName}"]`);
      const button = Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(
        (candidate) => candidate.textContent?.trim() === tamper.buttonName
      );
      if (!control || !button) throw new Error("Expected mutation form controls were not found.");
      if (control instanceof HTMLSelectElement && !Array.from(control.options).some((option) => option.value === tamper.fieldValue)) {
        control.add(new Option("Tampered resource", tamper.fieldValue));
      }
      control.value = tamper.fieldValue;
      form.requestSubmit(button);
    },
    { buttonName, fieldName, fieldValue }
  );
  await responsePromise;
}

async function submitWithInjectedValue(
  page: Page,
  pathname: string,
  form: Locator,
  buttonName: string,
  fieldName: string,
  fieldValue: string
) {
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === new URL(pathname, "http://localhost:3000").pathname && response.request().method() === "POST"
  );
  await form.evaluate(
    (formElement, injected) => {
      const form = formElement as HTMLFormElement;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = injected.fieldName;
      input.value = injected.fieldValue;
      form.append(input);
      const button = Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(
        (candidate) => candidate.textContent?.trim() === injected.buttonName
      );
      if (!button) throw new Error("Expected mutation submit button was not found.");
      form.requestSubmit(button);
    },
    { buttonName, fieldName, fieldValue }
  );
  await responsePromise;
}

function sectionForHeading(page: Page, heading: string) {
  return page
    .getByRole("heading", { name: heading })
    .last()
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' vf-section ')][1]");
}

test("public volunteer and vendor forms bind submissions and success lookups to the portal tenant", async ({ page }) => {
  await loginAs(page, volunteerAEmail);
  const volunteerPath = `${portalOrigin(orgASlug)}/volunteer`;
  await page.goto(volunteerPath);
  const volunteerForm = page.getByRole("heading", { name: "Volunteer application" }).locator("xpath=ancestor::form");
  await expect(volunteerForm.locator('input[name="orgId"], input[name="eventId"]')).toHaveCount(0);
  await volunteerForm.getByLabel("Full name").fill("Tampered Volunteer");
  await expect(volunteerForm.getByLabel("Email")).toHaveValue(volunteerAEmail);
  await submitTamperedAction(page, volunteerPath, volunteerForm, "Submit application", "departmentId", departmentBId);
  expect(await prisma.volunteerApplication.count({ where: { portalAccount: { email: tamperedVolunteerEmail } } })).toBe(0);

  const vendorPath = `${portalOrigin(orgASlug)}/vendor-apply`;
  await navigateAfterRejectedAction(page, `${vendorPath}?success=${vendorApplicationBId}`);
  await expect(page.getByRole("heading", { name: vendorBName })).toHaveCount(0);
  const vendorForm = page.getByRole("heading", { name: "Apply for dealer space" }).locator("xpath=ancestor::form");
  await expect(vendorForm.locator('input[name="orgId"], input[name="eventId"]')).toHaveCount(0);
});

test("a vendor booth payment race renders inline and keeps the payment action usable", async ({ page }) => {
  await prisma.vendorApplication.update({
    where: { id: vendorApplicationAId },
    data: { status: "APPROVED", boothAssignment: "A-01" }
  });

  try {
    await loginAs(page, vendorAEmail);
    await page.goto(`${portalOrigin(orgASlug)}/vendor-apply?success=${vendorApplicationAId}`);
    await expect(page.getByRole("button", { name: "Pay booth invoice" })).toBeVisible();

    await prisma.vendorApplication.update({
      where: { id: vendorApplicationAId },
      data: { status: "WAITLISTED" }
    });
    await page.getByRole("button", { name: "Pay booth invoice" }).click();

    await expect(page.getByTestId("vendor-booth-payment-error")).toContainText(
      "This vendor application is not approved for payment yet."
    );
    await expect(page.getByRole("button", { name: "Pay booth invoice" })).toBeEnabled();
    await expect(page.getByTestId("route-error")).toHaveCount(0);
    expect(
      (await prisma.vendorApplication.findUniqueOrThrow({ where: { id: vendorApplicationAId } })).paymentOrderId
    ).toBeNull();
  } finally {
    await prisma.vendorApplication.update({
      where: { id: vendorApplicationAId },
      data: { status: "APPROVED", boothAssignment: null }
    });
  }
});

test("department, role, application, and assignment mutations reject foreign resources", async ({ page }) => {
  await loginAsOwnerA(page);

  const departmentsPath = `/dashboard/events/${eventAId}/staff/departments`;
  await page.goto(departmentsPath);
  const departmentForm = sectionForHeading(page, departmentAName)
    .getByRole("button", { name: "Save department form" })
    .locator("xpath=ancestor::form");
  await expect(departmentForm.locator('input[name="orgId"], input[name="eventId"]')).toHaveCount(0);
  await departmentForm.getByLabel("Name").fill("Rejected department overwrite");
  await submitTamperedAction(page, departmentsPath, departmentForm, "Save department form", "departmentId", departmentBId);
  expect((await prisma.department.findUniqueOrThrow({ where: { id: departmentAId } })).name).toBe(departmentAName);
  expect((await prisma.department.findUniqueOrThrow({ where: { id: departmentBId } })).name).toBe(departmentBName);

  const applicationsPath = `/dashboard/events/${eventAId}/staff/applications`;
  await navigateAfterRejectedAction(page, applicationsPath);
  const applicationSection = sectionForHeading(page, "Volunteer A");
  const approveForm = applicationSection.getByRole("button", { name: "Approve and assign" }).locator("xpath=ancestor::form");
  await expect(approveForm.locator('input[name="orgId"], input[name="eventId"]')).toHaveCount(0);
  await submitTamperedAction(page, applicationsPath, approveForm, "Approve and assign", "roleId", roleBId);
  expect(await prisma.staffAssignment.count({ where: { volunteerApplicationId: volunteerApplicationAId } })).toBe(1);

  await navigateAfterRejectedAction(page, applicationsPath);
  const rejectForm = sectionForHeading(page, "Volunteer A").getByRole("button", { name: "Reject" }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, applicationsPath, rejectForm, "Reject", "applicationId", volunteerApplicationBId);
  expect((await prisma.volunteerApplication.findUniqueOrThrow({ where: { id: volunteerApplicationBId } })).status).toBe("APPROVED");

  const schedulePath = `/dashboard/events/${eventAId}/staff/schedule`;
  await navigateAfterRejectedAction(page, schedulePath);
  const assignmentForm = page.getByText("Volunteer A").locator("xpath=ancestor::div[contains(@class, 'vf-list-row')][1]")
    .getByRole("button", { name: "Remove" })
    .locator("xpath=ancestor::form");
  await expect(assignmentForm.locator('input[name="orgId"], input[name="eventId"]')).toHaveCount(0);
  await submitTamperedAction(page, schedulePath, assignmentForm, "Remove", "assignmentId", assignmentBId);
  expect((await prisma.staffAssignment.findUniqueOrThrow({ where: { id: assignmentAId } })).status).toBe("ASSIGNED");
  expect((await prisma.staffAssignment.findUniqueOrThrow({ where: { id: assignmentBId } })).status).toBe("ASSIGNED");

  await navigateAfterRejectedAction(page, schedulePath);
  const roleForm = page.getByRole("heading", { name: roleAName }).locator("xpath=ancestor::div[contains(@class, 'vf-schedule-role')][1]")
    .getByRole("button", { name: "Delete" })
    .locator("xpath=ancestor::form");
  await submitTamperedAction(page, schedulePath, roleForm, "Delete", "roleId", roleBId);
  expect(await prisma.staffRole.count({ where: { id: { in: [roleAId, roleBId] } } })).toBe(2);
});

test("vendor review, booth assignment, and bulk review reject foreign applications", async ({ page }) => {
  await loginAsOwnerA(page);
  const vendorsPath = `/dashboard/events/${eventAId}/vendors`;
  await page.goto(vendorsPath);

  const vendorSection = sectionForHeading(page, vendorAName);
  const approveForm = vendorSection.getByRole("button", { name: "Approve" }).locator("xpath=ancestor::form");
  await expect(approveForm.locator('input[name="orgId"], input[name="eventId"]')).toHaveCount(0);
  await expect(approveForm.locator('input[name="boothPrice"]')).toHaveValue("125000");
  await submitTamperedAction(page, vendorsPath, approveForm, "Approve", "applicationId", vendorApplicationBId);
  expect((await prisma.vendorApplication.findUniqueOrThrow({ where: { id: vendorApplicationBId } })).boothPrice).toBe(3_000);

  await navigateAfterRejectedAction(page, vendorsPath);
  const bulkForm = page.getByRole("button", { name: "Reject selected" }).locator("xpath=ancestor::form");
  await expect(bulkForm.locator('input[name="orgId"]')).toHaveCount(0);
  await submitWithInjectedValue(page, vendorsPath, bulkForm, "Reject selected", "applicationId", vendorApplicationBId);
  expect((await prisma.vendorApplication.findUniqueOrThrow({ where: { id: vendorApplicationBId } })).status).toBe("APPROVED");

  const boothsPath = `/dashboard/events/${eventAId}/vendors/booths`;
  await navigateAfterRejectedAction(page, boothsPath);
  const boothForm = page.getByRole("heading", { name: "A-01" }).locator("xpath=ancestor::div[contains(@class, 'vf-booth-cell')][1]")
    .getByRole("button", { name: "Assign booth" })
    .locator("xpath=ancestor::form");
  await expect(boothForm.locator('input[name="orgId"], input[name="eventId"]')).toHaveCount(0);
  await submitTamperedAction(page, boothsPath, boothForm, "Assign booth", "applicationId", vendorApplicationBId);
  expect((await prisma.vendorApplication.findUniqueOrThrow({ where: { id: vendorApplicationAId } })).boothAssignment).toBeNull();
  expect((await prisma.vendorApplication.findUniqueOrThrow({ where: { id: vendorApplicationBId } })).boothAssignment).toBeNull();
});

test("vendor file policy rejects unsupported and forged uploads before persistence", async ({ page }) => {
  await loginAs(page, vendorAEmail);
  const vendorPath = `${portalOrigin(orgASlug)}/vendor-apply`;
  await page.goto(vendorPath);
  let form = page.getByRole("heading", { name: "Apply for dealer space" }).locator("xpath=ancestor::form");
  await expect(form.getByLabel("Contact email")).toHaveValue(vendorAEmail);
  await form.getByLabel("Contact name").fill("Invalid Vendor");
  await form.getByLabel("Business name").fill(invalidVendorName);
  await form.getByLabel("Product description").fill("Unsafe vendor upload test");
  await form.getByLabel("Upload file").setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
  });
  await submitAction(page, vendorPath, form, "Submit vendor application");
  expect(await prisma.vendorApplication.count({ where: { businessName: invalidVendorName } })).toBe(0);

  // The file policy rejects the upload inline and the form stays on the page.
  await expect(page.getByTestId("vendor-error")).toContainText("Vendor files must be PDF, PNG, JPEG, or WebP files.");
  await page.goto(vendorPath);
  form = page.getByRole("heading", { name: "Apply for dealer space" }).locator("xpath=ancestor::form");
  await form.getByLabel("Contact name").fill("Forged Vendor");
  await expect(form.getByLabel("Contact email")).toHaveValue(vendorAEmail);
  await form.getByLabel("Business name").fill(forgedVendorName);
  await form.getByLabel("Product description").fill("Forged vendor upload test");
  await form.getByLabel("Upload file").setInputFiles({
    name: "forged.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("this is not a PDF")
  });
  await submitAction(page, vendorPath, form, "Submit vendor application");
  expect(await prisma.vendorApplication.count({ where: { businessName: forgedVendorName } })).toBe(0);
});

test("VND booth configuration keeps whole-dong values", async ({ page }) => {
  await loginAsOwnerA(page);
  const boothsPath = `/dashboard/events/${eventAId}/vendors/booths`;
  await page.goto(boothsPath);
  const configForm = page.getByRole("button", { name: "Save booth setup" }).locator("xpath=ancestor::form");
  const tablePrice = configForm.locator('input[name="tablePrice"]').first();
  const amenityPrice = configForm.locator('input[name="amenityPrice"]').first();
  await expect(configForm.locator('input[name="orgId"]')).toHaveCount(0);
  await expect(tablePrice).toHaveAttribute("step", "1");
  await expect(tablePrice).toHaveValue("200000");
  await expect(amenityPrice).toHaveValue("50000");
  await tablePrice.fill("250000");
  await amenityPrice.fill("75000");
  await submitAction(page, boothsPath, configForm, "Save booth setup");

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventAId } });
  const settings = event.settings as { vendorConfig?: { tableTypes?: Array<{ price?: number }>; amenities?: Array<{ price?: number }> } };
  expect(settings.vendorConfig?.tableTypes?.[0]?.price).toBe(250_000);
  expect(settings.vendorConfig?.amenities?.[0]?.price).toBe(75_000);
});
