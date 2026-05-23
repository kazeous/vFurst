"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmailTemplatePanel } from "@/features/email/email-template-panel";

type EventDetail = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  venueName: string | null;
  contactEmail: string | null;
  description: string | null;
};

type Member = {
  id: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
};

type Invite = {
  id: string;
  email: string;
  role: string;
  token: string;
  status: string;
};

type AuditItem = {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  actor: {
    email: string | null;
  } | null;
};

type Product = {
  id: string;
  category: string;
  displayName: string;
  basePriceCents: number;
  stockLimit: number | null;
  publicVisible: boolean;
  archivedAt: string | null;
  registrationCount: number;
};

type RegistrationQuestion = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  sortOrder: number;
};

type AdminOrder = {
  id: string;
  status: string;
  totalCents: number;
  user: {
    name: string | null;
    email: string | null;
  };
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
  }>;
  payments: Array<{
    id: string;
    status: string;
    provider: string;
  }>;
  refunds: Array<{
    id: string;
    status: string;
    amountCents: number;
  }>;
};

type VendorApplication = {
  id: string;
  status: string;
  businessName: string;
  contactName: string;
  contactEmail: string;
  description: string;
  productsServices: string;
  seatingNotes: string | null;
  adminNote: string | null;
  requestedTableProduct: {
    id: string;
    displayName: string;
    basePriceCents: number;
  } | null;
  approvedOrder: {
    id: string;
    status: string;
    totalCents: number;
  } | null;
  user: {
    name: string | null;
    email: string | null;
  };
  amenities: Array<{
    id: string;
    name: string;
    details: string | null;
  }>;
  assistants: Array<{
    id: string;
    name: string;
    email: string | null;
  }>;
  seatingPreferences: Array<{
    id: string;
    note: string;
  }>;
};

type VolunteerDepartment = {
  id: string;
  name: string;
  description: string | null;
  leadUserId: string | null;
  leadUser: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  _count: {
    assignments: number;
  };
};

type VolunteerApplication = {
  id: string;
  status: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  preferredContactMethod: string;
  availability: string;
  departmentInterests: string;
  priorExperience: string | null;
  adminNote: string | null;
  assignments: Array<{
    id: string;
    state: string;
    note: string | null;
    department: {
      id: string;
      name: string;
      leadUser: {
        name: string | null;
        email: string | null;
      } | null;
    };
  }>;
};

type EventDetailClientProps = {
  eventId: string;
};

export function EventDetailClient({ eventId }: EventDetailClientProps) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [questions, setQuestions] = useState<RegistrationQuestion[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [vendorApplications, setVendorApplications] = useState<VendorApplication[]>([]);
  const [volunteerDepartments, setVolunteerDepartments] = useState<VolunteerDepartment[]>([]);
  const [volunteerApplications, setVolunteerApplications] = useState<VolunteerApplication[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    const [
      eventResponse,
      membersResponse,
      invitesResponse,
      auditResponse,
      productsResponse,
      questionsResponse,
      ordersResponse,
      vendorApplicationsResponse,
      volunteerDepartmentsResponse,
      volunteerApplicationsResponse
    ] = await Promise.all([
      fetch(`/api/events/${eventId}`),
      fetch(`/api/events/${eventId}/members`),
      fetch(`/api/events/${eventId}/invites`),
      fetch(`/api/events/${eventId}/audit?pageSize=10`),
      fetch(`/api/events/${eventId}/products`),
      fetch(`/api/events/${eventId}/registration-questions`),
      fetch(`/api/events/${eventId}/orders`),
      fetch(`/api/events/${eventId}/vendor-applications`),
      fetch(`/api/events/${eventId}/volunteer-departments`),
      fetch(`/api/events/${eventId}/volunteer-applications`)
    ]);

    const eventBody = (await eventResponse.json().catch(() => null)) as { event?: EventDetail; error?: string } | null;
    if (!eventResponse.ok || !eventBody?.event) {
      setError(eventBody?.error ?? "Unable to load event.");
      return;
    }

    const membersBody = (await membersResponse.json().catch(() => null)) as { members?: Member[] } | null;
    const invitesBody = (await invitesResponse.json().catch(() => null)) as { invites?: Invite[] } | null;
    const auditBody = (await auditResponse.json().catch(() => null)) as { items?: AuditItem[] } | null;
    const productsBody = (await productsResponse.json().catch(() => null)) as { products?: Product[] } | null;
    const questionsBody = (await questionsResponse.json().catch(() => null)) as { questions?: RegistrationQuestion[] } | null;
    const ordersBody = (await ordersResponse.json().catch(() => null)) as { orders?: AdminOrder[] } | null;
    const vendorApplicationsBody = (await vendorApplicationsResponse.json().catch(() => null)) as {
      applications?: VendorApplication[];
    } | null;
    const volunteerDepartmentsBody = (await volunteerDepartmentsResponse.json().catch(() => null)) as {
      departments?: VolunteerDepartment[];
    } | null;
    const volunteerApplicationsBody = (await volunteerApplicationsResponse.json().catch(() => null)) as {
      applications?: VolunteerApplication[];
    } | null;

    setEvent(eventBody.event);
    setMembers(membersBody?.members ?? []);
    setInvites(invitesBody?.invites ?? []);
    setAuditItems(auditBody?.items ?? []);
    setProducts(productsBody?.products ?? []);
    setQuestions(questionsBody?.questions ?? []);
    setOrders(ordersBody?.orders ?? []);
    setVendorApplications(vendorApplicationsBody?.applications ?? []);
    setVolunteerDepartments(volunteerDepartmentsBody?.departments ?? []);
    setVolunteerApplications(volunteerApplicationsBody?.applications ?? []);
  }, [eventId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function submitJson(url: string, method: string, payload?: unknown) {
    setMessage(null);
    setError(null);
    const response = await fetch(url, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(body?.error ?? "Request failed.");
      return false;
    }

    setMessage("Saved.");
    await loadAll();
    return true;
  }

  async function onUpdateEvent(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const formData = new FormData(formEvent.currentTarget);
    await submitJson(`/api/events/${eventId}`, "PATCH", {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      status: String(formData.get("status") ?? "DRAFT"),
      timezone: String(formData.get("timezone") ?? "UTC"),
      venueName: String(formData.get("venueName") ?? "") || undefined,
      contactEmail: String(formData.get("contactEmail") ?? "") || undefined,
      description: String(formData.get("description") ?? "") || undefined
    });
  }

  async function onCreateInvite(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const formData = new FormData(formEvent.currentTarget);
    const created = await submitJson(`/api/events/${eventId}/invites`, "POST", {
      email: String(formData.get("email") ?? ""),
      role: String(formData.get("role") ?? "VIEWER")
    });

    if (created) {
      form.reset();
    }
  }

  async function onCreateProduct(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const formData = new FormData(formEvent.currentTarget);
    const imageUrl = String(formData.get("imageUrl") ?? "");
    const created = await submitJson(`/api/events/${eventId}/products`, "POST", {
      category: String(formData.get("category") ?? "REGISTRATION"),
      name: String(formData.get("name") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      description: String(formData.get("description") ?? "") || undefined,
      basePriceCents: Number(formData.get("basePriceCents") ?? 0),
      stockLimit: String(formData.get("stockLimit") ?? "") || undefined,
      publicVisible: formData.get("publicVisible") === "on",
      minPurchaseAge: String(formData.get("minPurchaseAge") ?? "") || undefined,
      maxPurchaseAge: String(formData.get("maxPurchaseAge") ?? "") || undefined,
      images: imageUrl ? [{ url: imageUrl, altText: String(formData.get("displayName") ?? "") }] : []
    });

    if (created) {
      form.reset();
    }
  }

  async function onCreateQuestion(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const formData = new FormData(formEvent.currentTarget);
    const created = await submitJson(`/api/events/${eventId}/registration-questions`, "POST", {
      label: String(formData.get("label") ?? ""),
      helpText: String(formData.get("helpText") ?? "") || undefined,
      type: String(formData.get("type") ?? "SHORT_TEXT"),
      required: formData.get("required") === "on",
      sortOrder: Number(formData.get("sortOrder") ?? 0)
    });

    if (created) {
      form.reset();
    }
  }

  async function markOrderPaid(orderId: string) {
    await submitJson(`/api/orders/${orderId}/manual-payment`, "POST", {
      note: "Marked paid from event admin dashboard"
    });
  }

  async function recordRefund(order: AdminOrder) {
    await submitJson(`/api/orders/${order.id}/refunds`, "POST", {
      amountCents: order.totalCents,
      reason: "Manual refund record"
    });
  }

  async function reviewVendorApplication(applicationId: string, status: string) {
    await submitJson(`/api/events/${eventId}/vendor-applications/${applicationId}`, "PATCH", {
      status
    });
  }

  async function onCreateVolunteerDepartment(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const formData = new FormData(form);
    const created = await submitJson(`/api/events/${eventId}/volunteer-departments`, "POST", {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || undefined,
      leadUserId: String(formData.get("leadUserId") ?? "") || undefined
    });

    if (created) {
      form.reset();
    }
  }

  async function onUpdateVolunteerApplication(applicationId: string, formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const formData = new FormData(formEvent.currentTarget);
    await submitJson(`/api/events/${eventId}/volunteer-applications/${applicationId}`, "PATCH", {
      status: String(formData.get("status") ?? "UNDER_REVIEW"),
      departmentId: String(formData.get("departmentId") ?? "") || undefined,
      assignmentState: String(formData.get("assignmentState") ?? "") || undefined,
      assignmentNote: String(formData.get("assignmentNote") ?? "") || undefined,
      adminNote: String(formData.get("adminNote") ?? "") || undefined
    });
  }

  if (!event && !error) {
    return <p className="text-sm text-muted-foreground">Loading event...</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        {event ? (
          <Link className="text-sm font-medium text-primary" href={`/dashboard/orgs/${event.organizationId}`}>
            Back to organization
          </Link>
        ) : null}
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">{event?.name ?? "Event"}</h1>
        <p className="text-sm text-muted-foreground">/{event?.slug}</p>
        {event ? (
          <Link className="mt-2 inline-block text-sm font-medium text-primary" href={`/events/${event.slug}`}>
            View public page
          </Link>
        ) : null}
        {event ? (
          <Link className="ml-4 mt-2 inline-block text-sm font-medium text-primary" href={`/dashboard/events/${event.id}/check-in`}>
            Open check-in
          </Link>
        ) : null}
      </div>
      {message ? <p className="rounded-md border bg-secondary p-3 text-sm">{message}</p> : null}
      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p> : null}
      {event ? (
        <section className="rounded-md border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-normal">Event settings</h2>
          <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={onUpdateEvent}>
            <label className="block space-y-2 text-sm font-medium">
              <span>Name</span>
              <input className="w-full rounded-md border px-3 py-2" defaultValue={event.name} name="name" />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Slug</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                defaultValue={event.slug}
                name="slug"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Status</span>
              <select className="w-full rounded-md border px-3 py-2" defaultValue={event.status} name="status">
                <option value="DRAFT">DRAFT</option>
                <option value="REGISTRATION_OPEN">REGISTRATION_OPEN</option>
                <option value="LIVE">LIVE</option>
                <option value="CLOSED">CLOSED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Timezone</span>
              <input className="w-full rounded-md border px-3 py-2" defaultValue={event.timezone} name="timezone" />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Venue</span>
              <input className="w-full rounded-md border px-3 py-2" defaultValue={event.venueName ?? ""} name="venueName" />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Contact email</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                defaultValue={event.contactEmail ?? ""}
                name="contactEmail"
                type="email"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium md:col-span-2">
              <span>Description</span>
              <textarea
                className="min-h-28 w-full rounded-md border px-3 py-2"
                defaultValue={event.description ?? ""}
                name="description"
              />
            </label>
            <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground md:w-fit">Save</button>
          </form>
        </section>
      ) : null}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-normal">Registration tiers and products</h2>
          <form className="mt-4 grid gap-3" onSubmit={onCreateProduct}>
            <select className="rounded-md border px-3 py-2" defaultValue="REGISTRATION" name="category">
              <option value="REGISTRATION">Registration</option>
              <option value="MERCH">Merch</option>
              <option value="ADD_ON">Add-on</option>
              <option value="DONATION">Donation</option>
              <option value="SERVICE">Service</option>
              <option value="VENDOR_TABLE">Vendor table</option>
            </select>
            <input className="rounded-md border px-3 py-2" name="name" placeholder="Internal name" required />
            <input className="rounded-md border px-3 py-2" name="displayName" placeholder="Display name" required />
            <textarea className="min-h-20 rounded-md border px-3 py-2" name="description" placeholder="Description" />
            <input
              className="rounded-md border px-3 py-2"
              min={0}
              name="basePriceCents"
              placeholder="Base price in cents"
              required
              type="number"
            />
            <div className="grid gap-3 md:grid-cols-3">
              <input className="rounded-md border px-3 py-2" min={1} name="stockLimit" placeholder="Stock" type="number" />
              <input className="rounded-md border px-3 py-2" min={0} name="minPurchaseAge" placeholder="Min age" type="number" />
              <input className="rounded-md border px-3 py-2" min={0} name="maxPurchaseAge" placeholder="Max age" type="number" />
            </div>
            <input className="rounded-md border px-3 py-2" name="imageUrl" placeholder="Image URL" type="url" />
            <label className="flex items-center gap-2 text-sm">
              <input defaultChecked name="publicVisible" type="checkbox" />
              Public
            </label>
            <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Create product</button>
          </form>
          <div className="mt-5 space-y-3">
            {products.map((product) => (
              <div className="rounded-md border p-3 text-sm" key={product.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{product.displayName}</p>
                    <p className="text-muted-foreground">
                      {product.category} - ${(product.basePriceCents / 100).toFixed(2)} - {product.registrationCount}
                      registered
                    </p>
                  </div>
                  <button
                    className="rounded-md border px-2 py-1 text-sm"
                    disabled={Boolean(product.archivedAt)}
                    onClick={() => void submitJson(`/api/events/${eventId}/products/${product.id}`, "DELETE")}
                    type="button"
                  >
                    {product.archivedAt ? "Archived" : "Archive"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-normal">Registration questions</h2>
          <form className="mt-4 grid gap-3" onSubmit={onCreateQuestion}>
            <input className="rounded-md border px-3 py-2" name="label" placeholder="Question label" required />
            <input className="rounded-md border px-3 py-2" name="helpText" placeholder="Help text" />
            <select className="rounded-md border px-3 py-2" defaultValue="SHORT_TEXT" name="type">
              <option value="SHORT_TEXT">Short text</option>
              <option value="LONG_TEXT">Long text</option>
              <option value="CHECKBOX">Checkbox</option>
            </select>
            <input className="rounded-md border px-3 py-2" defaultValue={0} min={0} name="sortOrder" type="number" />
            <label className="flex items-center gap-2 text-sm">
              <input name="required" type="checkbox" />
              Required
            </label>
            <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Add question</button>
          </form>
          <div className="mt-5 space-y-3">
            {questions.map((question) => (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm" key={question.id}>
                <div>
                  <p className="font-medium">{question.label}</p>
                  <p className="text-muted-foreground">
                    {question.type} - {question.required ? "required" : "optional"} - sort {question.sortOrder}
                  </p>
                </div>
                <button
                  className="rounded-md border px-2 py-1 text-sm"
                  onClick={() => void submitJson(`/api/events/${eventId}/registration-questions/${question.id}`, "DELETE")}
                  type="button"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="rounded-md border bg-card p-5">
        <h2 className="text-lg font-semibold tracking-normal">Orders</h2>
        {orders.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No orders yet.</p> : null}
        <div className="mt-4 space-y-3">
          {orders.map((order) => (
            <div className="rounded-md border p-3 text-sm" key={order.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{order.user.name ?? order.user.email ?? "Attendee"}</p>
                  <p className="text-muted-foreground">
                    {order.status} - ${(order.totalCents / 100).toFixed(2)} - {order.items.length} items
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className="rounded-md border px-2 py-1" href={`/orders/${order.id}`}>
                    View
                  </Link>
                  <button
                    className="rounded-md border px-2 py-1"
                    disabled={order.status !== "UNPAID"}
                    onClick={() => void markOrderPaid(order.id)}
                    type="button"
                  >
                    Mark paid
                  </button>
                  <button
                    className="rounded-md border px-2 py-1"
                    disabled={order.status === "UNPAID"}
                    onClick={() => void recordRefund(order)}
                    type="button"
                  >
                    Record refund
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-md border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-normal">Vendor applications</h2>
          {event ? (
            <Link className="rounded-md border px-3 py-2 text-sm font-medium" href={`/events/${event.slug}/vendors/apply`}>
              Public application
            </Link>
          ) : null}
        </div>
        {vendorApplications.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No vendor applications yet.</p> : null}
        <div className="mt-4 space-y-4">
          {vendorApplications.map((application) => (
            <div className="rounded-md border p-4 text-sm" key={application.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <p className="font-medium">{application.businessName}</p>
                  <p className="text-muted-foreground">
                    {application.status} - {application.contactName} - {application.contactEmail}
                  </p>
                  <p className="mt-2 text-muted-foreground">{application.productsServices}</p>
                  {application.requestedTableProduct ? (
                    <p className="mt-2 text-muted-foreground">
                      Requested: {application.requestedTableProduct.displayName} - $
                      {(application.requestedTableProduct.basePriceCents / 100).toFixed(2)}
                    </p>
                  ) : null}
                  {application.amenities.length > 0 ? (
                    <p className="mt-2 text-muted-foreground">
                      Amenities: {application.amenities.map((amenity) => amenity.name).join(", ")}
                    </p>
                  ) : null}
                  {application.assistants.length > 0 ? (
                    <p className="mt-2 text-muted-foreground">
                      Assistants: {application.assistants.map((assistant) => assistant.name).join(", ")}
                    </p>
                  ) : null}
                  {application.seatingNotes ? <p className="mt-2 text-muted-foreground">Notes: {application.seatingNotes}</p> : null}
                  {application.approvedOrder ? (
                    <p className="mt-2 text-muted-foreground">
                      Order:{" "}
                      <Link className="text-primary" href={`/orders/${application.approvedOrder.id}`}>
                        {application.approvedOrder.status} - ${(application.approvedOrder.totalCents / 100).toFixed(2)}
                      </Link>
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-md border px-2 py-1"
                    disabled={application.status === "UNDER_REVIEW"}
                    onClick={() => void reviewVendorApplication(application.id, "UNDER_REVIEW")}
                    type="button"
                  >
                    Review
                  </button>
                  <button
                    className="rounded-md border px-2 py-1"
                    disabled={application.status === "APPROVED_UNPAID" || application.status === "APPROVED_PAID"}
                    onClick={() => void reviewVendorApplication(application.id, "APPROVED_UNPAID")}
                    type="button"
                  >
                    Approve
                  </button>
                  <button
                    className="rounded-md border px-2 py-1"
                    disabled={application.status === "WAITLISTED"}
                    onClick={() => void reviewVendorApplication(application.id, "WAITLISTED")}
                    type="button"
                  >
                    Waitlist
                  </button>
                  <button
                    className="rounded-md border px-2 py-1"
                    disabled={application.status === "REJECTED"}
                    onClick={() => void reviewVendorApplication(application.id, "REJECTED")}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-md border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-normal">Volunteer management</h2>
          {event ? (
            <Link className="rounded-md border px-3 py-2 text-sm font-medium" href={`/events/${event.slug}/volunteers/apply`}>
              Public application
            </Link>
          ) : null}
        </div>
        <div className="mt-4 grid gap-5 lg:grid-cols-[320px_1fr]">
          <div>
            <h3 className="font-medium">Departments</h3>
            <form className="mt-3 grid gap-3" onSubmit={onCreateVolunteerDepartment}>
              <input className="rounded-md border px-3 py-2" name="name" placeholder="Department name" required />
              <textarea className="min-h-20 rounded-md border px-3 py-2" name="description" placeholder="Description" />
              <select className="rounded-md border px-3 py-2" name="leadUserId" defaultValue="">
                <option value="">No lead</option>
                {members.map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.name ?? member.user.email ?? "Team member"}
                  </option>
                ))}
              </select>
              <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Create department</button>
            </form>
            <div className="mt-4 space-y-2">
              {volunteerDepartments.length === 0 ? <p className="text-sm text-muted-foreground">No departments yet.</p> : null}
              {volunteerDepartments.map((department) => (
                <div className="rounded-md border p-3 text-sm" key={department.id}>
                  <p className="font-medium">{department.name}</p>
                  {department.description ? <p className="text-muted-foreground">{department.description}</p> : null}
                  <p className="text-muted-foreground">
                    Lead: {department.leadUser?.name ?? department.leadUser?.email ?? "none"} - {department._count.assignments} assignments
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-medium">Applications</h3>
            {volunteerApplications.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No volunteer applications yet.</p> : null}
            <div className="mt-3 space-y-4">
              {volunteerApplications.map((application) => {
                const primaryAssignment = application.assignments[0] ?? null;
                return (
                  <div className="rounded-md border p-4 text-sm" key={application.id}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-2xl">
                        <p className="font-medium">
                          {application.firstName} {application.lastName}
                        </p>
                        <p className="text-muted-foreground">
                          {application.status} - {application.email}
                          {application.phone ? ` - ${application.phone}` : ""}
                        </p>
                        <p className="mt-2 text-muted-foreground">Contact: {application.preferredContactMethod}</p>
                        <p className="mt-2 text-muted-foreground">Availability: {application.availability}</p>
                        <p className="mt-2 text-muted-foreground">Interests: {application.departmentInterests}</p>
                        {application.priorExperience ? (
                          <p className="mt-2 text-muted-foreground">Experience: {application.priorExperience}</p>
                        ) : null}
                        {application.assignments.length > 0 ? (
                          <p className="mt-2 text-muted-foreground">
                            Assignments:{" "}
                            {application.assignments
                              .map((assignment) => `${assignment.department.name} (${assignment.state})`)
                              .join(", ")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(submitEvent) => void onUpdateVolunteerApplication(application.id, submitEvent)}>
                      <select className="rounded-md border px-3 py-2" name="status" defaultValue={application.status}>
                        <option value="SUBMITTED">Submitted</option>
                        <option value="UNDER_REVIEW">Under review</option>
                        <option value="ACCEPTED">Accepted</option>
                        <option value="DECLINED">Declined</option>
                        <option value="WAITLISTED">Waitlisted</option>
                      </select>
                      <select className="rounded-md border px-3 py-2" name="departmentId" defaultValue={primaryAssignment?.department.id ?? ""}>
                        <option value="">No department</option>
                        {volunteerDepartments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                      <select className="rounded-md border px-3 py-2" name="assignmentState" defaultValue={primaryAssignment?.state ?? "INTERESTED"}>
                        <option value="INTERESTED">Interested</option>
                        <option value="PREVIOUS_EXPERIENCE">Previous experience</option>
                        <option value="AVOID">Avoid</option>
                        <option value="REQUESTED_BY_LEAD">Requested by lead</option>
                        <option value="ASSIGNED">Assigned</option>
                      </select>
                      <input className="rounded-md border px-3 py-2" name="assignmentNote" placeholder="Assignment note" />
                      <input className="rounded-md border px-3 py-2 md:col-span-2" name="adminNote" placeholder="Admin note" />
                      <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground md:w-fit">
                        Save volunteer
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
      <EmailTemplatePanel endpointBase={`/api/events/${eventId}`} initialKey="EVENT_INVITE" title="Event email templates" />
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-normal">Event team</h2>
          <div className="mt-4 space-y-3">
            {members.map((member) => (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" key={member.id}>
                <div>
                  <p className="font-medium">{member.user.name ?? member.user.email}</p>
                  <p className="text-sm text-muted-foreground">{member.user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="rounded-md border px-2 py-1 text-sm"
                    defaultValue={member.role}
                    onChange={(changeEvent) =>
                      void submitJson(`/api/events/${eventId}/members/${member.id}`, "PATCH", {
                        role: changeEvent.currentTarget.value
                      })
                    }
                  >
                    <option value="EVENT_ADMIN">EVENT_ADMIN</option>
                    <option value="STAFF">STAFF</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                  <button
                    className="rounded-md border px-2 py-1 text-sm"
                    onClick={() => void submitJson(`/api/events/${eventId}/members/${member.id}`, "DELETE")}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border bg-card p-5">
          <h2 className="text-lg font-semibold tracking-normal">Event invites</h2>
          <form className="mt-4 grid gap-3" onSubmit={onCreateInvite}>
            <input className="rounded-md border px-3 py-2" name="email" placeholder="email@example.com" required type="email" />
            <select className="rounded-md border px-3 py-2" name="role" defaultValue="VIEWER">
              <option value="EVENT_ADMIN">EVENT_ADMIN</option>
              <option value="STAFF">STAFF</option>
              <option value="VIEWER">VIEWER</option>
            </select>
            <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Invite</button>
          </form>
          <div className="mt-4 space-y-3">
            {invites.map((invite) => (
              <div className="rounded-md border p-3 text-sm" key={invite.id}>
                <p className="font-medium">{invite.email}</p>
                <p className="text-muted-foreground">
                  {invite.role} · {invite.status}
                </p>
                <Link className="break-all text-primary" href={`/invites/${invite.token}`}>
                  /invites/{invite.token}
                </Link>
                <button
                  className="mt-2 block rounded-md border px-2 py-1 text-sm"
                  onClick={() => void submitJson(`/api/events/${eventId}/invites/${invite.id}`, "DELETE")}
                  type="button"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="rounded-md border bg-card p-5">
        <h2 className="text-lg font-semibold tracking-normal">Audit log</h2>
        <div className="mt-4 space-y-2">
          {auditItems.map((item) => (
            <p className="text-sm text-muted-foreground" key={item.id}>
              {item.action} · {item.entityType} · {new Date(item.createdAt).toLocaleString()} ·{" "}
              {item.actor?.email ?? "system"}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
