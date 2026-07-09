# vFurst — Convention Management SaaS Platform

A full-featured convention/event management SaaS platform inspired by [ConCat](https://concat.app), built with **Next.js App Router** and **shadcn/ui-style local components**.

> [!NOTE]
> **Product Name**: "vFurst" (from the workspace name). This can be changed at any time.
> **Tagline**: "Manage your event, not a spreadsheet."

---

## Decisions (Resolved)

| Question | Decision |
|----------|----------|
| **Multi-tenancy** | **Subdomain-based** — each org gets `{slug}.vfurst.app`. Custom domains (CNAME) added in Phase 6. |
| **UI theme** | **shadcn/ui CSS-variable tokens** - local, editable component code with a clean SaaS aesthetic. |
| **Mobile app** | **React Native companion app** — planned for Phase 5+, covering ticket scanning, check-in, and sales monitoring. |
| **Email provider** | **Dual support**: AWS SES (production scale) + SMTP manual setup (self-hosted/dev). Configurable per-org. |

---

## Revenue Model

Adopted from [convention_saas_roadmap.md](file:///D:/GitHub/vFurst/convention_saas_roadmap.md):

| Trigger | Fee |
|---------|-----|
| Per registered attendee | **$1.00** |
| Per hotel room booked | **$1.00** |
| Store / vendor transactions | **1%** |

Payments processed via **Stripe Connect** using **destination charges** — the PaymentIntent is created on the vFurst platform account with `transfer_data.destination` set to the convention's connected Stripe account. This gives vFurst control of the charge (refunds, disputes) while funds are automatically transferred to the convention minus the platform fee.

> [!IMPORTANT]
> **Stripe Connect charge type: Destination charges** (not direct charges or separate charges and transfers).
> - PaymentIntent created on vFurst's platform account
> - `transfer_data: { destination: convention_stripe_account_id }`
> - `application_fee_amount`: platform fee in cents ($1.00 = `100`, 1% = calculated)
> - vFurst owns the charge → can issue refunds, handle disputes
> - Convention receives funds minus fee automatically

> [!IMPORTANT]
> **Fee collection is single-path**: all platform fees are collected at checkout time via `application_fee_amount`. There is **no secondary billing job** that invoices conventions separately. The Phase 6 `reconcile-fees.ts` job is **read-only** — it audits that fees were collected correctly, generates usage reports for the billing dashboard, and flags discrepancies, but never charges conventions again.

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Monorepo** | Turborepo | Shared packages between web, API, mobile |
| **Frontend** | Next.js 15 (App Router) | SSR, API routes, middleware, subdomain routing |
| **UI Library** | shadcn/ui-style local components (`apps/web/src/components/ui`) | Editable, accessible React primitives owned by the app |
| **Theme** | shadcn/ui CSS variables in `apps/web/src/app/globals.css` | Clean SaaS aesthetic with light/dark token support |
| **Database** | PostgreSQL + Prisma ORM | Relational data, type-safe queries, row-level isolation |
| **Auth** | NextAuth.js v5 (Auth.js) | Multi-provider auth, session management, RBAC |
| **Payments** | Stripe Connect | Convention Stripe onboarding, `application_fee_amount` |
| **File Storage** | AWS S3 (`@aws-sdk/client-s3`) | Badge templates, product images, event assets, vendor uploads. Uses presigned URLs for direct client-to-S3 uploads. |
| **Email** | AWS SES + SMTP (configurable) | Transactional emails, per-org provider choice |
| **Background Jobs** | BullMQ + Redis | Email queues, badge generation, billing calculations |
| **Validation** | Zod | Schema validation for forms and API |
| **State** | React Server Components + `nuqs` | URL state for filters/search, minimal client state |
| **Charts** | Recharts | Dashboard analytics visualization |
| **Barcode/QR** | `bwip-js` (generation) + `@zxing/browser` (scanning) | `bwip-js` generates barcode/QR images for badges. `@zxing/browser` decodes QR codes from device camera in check-in/express pages. |
| **Badge Rendering** | `pdf-lib` (PDF) + ZPL string gen (thermal) | Pure-JS server-side badge rendering. No native bindings, runs on Railway/Vercel without issues. `pdf-lib` for PDF output, custom ZPL string builder for Zebra thermal printers. |
| **Badge Designer** | `react-konva` | Canvas-based drag-and-drop badge template editor. Renders `BadgeTemplate.layout` elements on an HTML5 Canvas via React declarative API. |
| **Drag & Drop** | `@dnd-kit/core` + `@dnd-kit/sortable` | Accessible DnD for tier reordering (Phase 2), form builder field ordering (Phase 4), shift schedule assignment (Phase 4). |
| **Printing** | WebUSB API | Direct browser-to-Zebra thermal printer (Chrome/Edge only — see compat note in `webusb-printer.ts`) |
| **Real-time** | Server-Sent Events | Live check-in counters, dashboard updates |
| **Mobile** | React Native (Expo) | Companion app for scanning + monitoring |
| **CI/CD** | GitHub Actions | Lint, test, build, deploy pipeline |
| **Hosting** | Local Docker Compose for Phases 0–7; Vercel (web) + Railway (Redis/workers) at deployment time only | See "Local Development" below. Vercel/Railway aren't set up until the project deploys — every phase builds and verifies against local containers. |

---

## Local Development

> [!IMPORTANT]
> **Every phase (0 through 7) builds and verifies against this local stack. No cloud accounts — Vercel, Railway, real AWS — are needed until deployment, which happens as its own step after Phase 7.**

`docker-compose.yml` at the repo root runs four services:

| Service | Image | Replaces (in production) | Notes |
|---|---|---|---|
| `postgres` | `postgres:16` | Managed Postgres (e.g. Railway/Neon) | `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vfurst` |
| `redis` | `redis:7` | Railway Redis | Used by BullMQ (`apps/worker`) exactly as in production — no code difference |
| `minio` | `minio/minio` | AWS S3 | S3-API-compatible object storage. `apps/web/src/lib/s3.ts` must read `S3_ENDPOINT` from env — when set (e.g. `http://localhost:9000`), the AWS SDK v3 client points at MinIO instead of AWS; when unset, it defaults to real AWS S3. This is a config-only difference, not a code branch. |
| `mailpit` | `axllent/mailpit` | AWS SES | A local SMTP catcher with a web UI (`http://localhost:8025`) to view sent emails. Configure the dev org's email provider as SMTP pointing at `localhost:1025` — this uses the SMTP provider path that's already in the plan (`packages/email/src/providers/smtp.ts`), so no email-provider code is local-only special-cased. |

**Stripe** has no local emulator — it isn't in Docker Compose. Instead, use a free Stripe account in **test mode**: no business verification is required, and Connect onboarding (Account Links) accepts `http://localhost:3000/...` as a return URL in test mode. The [Stripe CLI](https://stripe.com/docs/stripe-cli) forwards webhook events to `localhost` (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`) so the full payment + Connect + webhook flow is testable without deploying anything.

**Migration path to cloud (post-Phase 7):** swapping to production infrastructure should be an environment-variable change, not a code change — `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT` (removed to fall back to real AWS), and the org's email provider (switched from SMTP to SES) are the only things that differ. If a phase's implementation ever requires code branching on "are we local or cloud," that's a signal the abstraction is leaking and worth flagging in `PROGRESS.md` rather than working around silently.

---

## Data Model

```mermaid
erDiagram
    Organization ||--o{ Event : "hosts"
    Organization ||--o{ OrgMember : "has"
    Organization ||--o{ StripeConnect : "connected"
    User ||--o{ OrgMember : "belongs to"
    Event ||--o{ RegistrationType : "defines"
    Event ||--o{ Registration : "receives"
    Event ||--o{ Department : "has"
    Event ||--o{ VendorApplication : "receives"
    Event ||--o{ StoreProduct : "sells"
    Event ||--o{ Voucher : "offers"
    Event ||--o{ BadgeTemplate : "uses"
    Event ||--o{ Raffle : "runs"
    Event ||--o{ HotelBlock : "reserves"
    User ||--o{ Registration : "creates"
    User ||--o{ Cart : "owns"
    User ||--o{ AttendeeNote : "writes"
    User ||--o{ VolunteerApplication : "submits"
    RegistrationType ||--o{ AddOnDefinition : "offers"
    RegistrationType ||--o{ Registration : "categorizes"
    AddOnDefinition ||--o{ RegistrationAddOn : "instance of"
    Registration ||--o{ Badge : "generates"
    Registration ||--o{ OrderItem : "linked to"
    Registration ||--o{ RegistrationAddOn : "includes"
    Registration ||--o{ AttendeeNote : "has"
    User ||--o{ StaffAssignment : "works"
    Department ||--o{ StaffRole : "contains"
    Department ||--o{ VolunteerApplication : "applies to"
    StaffRole ||--o{ StaffAssignment : "fills"
    VolunteerApplication ||--o{ StaffAssignment : "accepted into"
    User ||--o{ VendorApplication : "submits"
    Cart ||--o{ CartItem : "contains"
    Order ||--o{ OrderItem : "contains"
    User ||--o{ Order : "places"
    Voucher ||--o{ Order : "applied to"
    StoreProduct ||--o{ OrderItem : "sold as"
    BadgeTemplate ||--o{ Badge : "renders"
    HotelBlock ||--o{ HotelBooking : "fulfilled by"
    User ||--o{ HotelBooking : "books"
    Raffle ||--o{ RaffleEntry : "has"
    User ||--o{ RaffleEntry : "enters"
```

### Core Entities (29)

| Entity | Key Fields | Purpose |
|--------|-----------|---------|
| **User** | id, email, name, avatar, emailVerified | Platform-wide user account |
| **Organization** | id, name, slug, subdomain, logo, contactEmail, customDomain | Convention organizing body |
| **OrgMember** | userId, orgId, role (OWNER/ADMIN/MEMBER) | Org membership + role |
| **StripeConnect** | orgId, stripeAccountId, onboardingComplete | Stripe Connect account link |
| **Event** | id, orgId, name, slug, startDate, endDate, venue, status, settings | A specific convention instance |
| **RegistrationType** | id, eventId, name, price, maxCapacity, scheduledPricing (JSON) | Attendance tiers (General, VIP, Sponsor) |
| **AddOnDefinition** | id, registrationTypeId, name, price, isComplimentary, maxQuantity, sortOrder | Defines an available add-on for a specific registration tier. Scoped to `RegistrationType` (not Event) so different tiers can offer different add-ons. `RegistrationAddOn` instances reference this. |
| **Registration** | id, eventId, userId, typeId, status, checkedInAt, badgeNumber, transferredFromId | An attendee's event registration |
| **RegistrationAddOn** | id, registrationId, addOnDefinitionId, price, quantity | An attendee's selected add-on. References `AddOnDefinition` for the catalog entry and `Registration` for the attendee. `price` is snapshotted at checkout time (in case the definition price changes later). |
| **Badge** | id, registrationId, templateId, barcodeData, nfcTag, printedAt | Physical/digital badge |
| **BadgeTemplate** | id, eventId, name, layout (JSON), dimensions | Badge design template |
| **Department** | id, eventId, name, leadUserId, formSchema (JSON) | Organizational department. `formSchema` stores the custom volunteer application form definition (field types, labels, required flags) built via the form builder UI. |
| **VolunteerApplication** | id, userId, departmentId, eventId, formResponses (JSON), availability (JSON), status (PENDING/APPROVED/REJECTED), reviewedBy, reviewedAt | Volunteer application with custom form data and approval workflow. Precedes StaffAssignment — approved applications become assignments. |
| **StaffRole** | id, departmentId, roleName, shifts (JSON), maxVolunteers | Staff position definitions |
| **StaffAssignment** | id, userId, roleId, volunteerApplicationId, shiftSlot, status | Volunteer shift assignment (links back to approved application) |
| **VendorApplication** | id, eventId, userId, businessName, status, boothAssignment, assistants (JSON) | Dealer booth application |
| **StoreProduct** | id, eventId, name, price, stock, images, category, surcharges | Merchandise for event store |
| **Cart** | id, userId, eventId, createdAt, updatedAt | Server-side shopping cart (DB-backed, survives device switches and avoids SSR hydration issues) |
| **CartItem** | id, cartId, itemType (REGISTRATION/ADDON/PRODUCT), refId, unitPrice, quantity | Line items in an active cart. Converted to OrderItems on checkout. Cleared after successful payment. |
| **Order** | id, userId, eventId, total, platformFee, status, stripePaymentIntentId, voucherId | Payment + fee record |
| **OrderItem** | id, orderId, itemType, refId, unitPrice, quantity | Line items in a completed order |
| **Voucher** | id, eventId, code, discountType, discountValue, maxUses, usedCount, expiresAt | Promo codes / comped registrations |
| **HotelBlock** | id, eventId, hotelName, roomTypes (JSON), cutoffDate | Hotel room block |
| **HotelBooking** | id, userId, blockId, roomType, checkIn, checkOut, confirmationCode | Hotel room booking |
| **Raffle** | id, eventId, name, prizes (JSON), drawDate | Event raffle/lottery |
| **RaffleEntry** | id, raffleId, userId, entryMethod (AUTO/MANUAL/PURCHASED), createdAt | Individual raffle entry. Prevents duplicates via unique(raffleId, userId) constraint. Used for random draw selection. |
| **AttendeeNote** | id, registrationId, authorId (→ User), content, createdAt | Internal staff notes. `authorId` is a foreign key to User (the staff member writing the note). |
| **ApiKey** | id, orgId, name, keyHash, scopes, lastUsedAt | Public API authentication |
| **WebhookEndpoint** | id, orgId, url, events, secret, active | Outbound webhook config |

---

## JSON Field Contracts

Several entities use JSON fields. To prevent ambiguity, their schemas are defined here:

| Entity.Field | JSON Schema | Example |
|-------------|-------------|----------|
| **RegistrationType.scheduledPricing** | `Array<{ startDate: ISO8601, endDate: ISO8601, price: number }>` | `[{ startDate: "2026-01-01", endDate: "2026-03-31", price: 4500 }, { startDate: "2026-04-01", endDate: "2026-06-30", price: 6000 }]` (prices in cents) |
| **Department.formSchema** | `Array<{ id: string, type: "text"\|"select"\|"checkbox"\|"textarea", label: string, required: boolean, options?: string[] }>` | `[{ id: "exp", type: "select", label: "Experience level", required: true, options: ["New", "1-2 cons", "3+"] }]` |
| **VolunteerApplication.formResponses** | `Record<string, string \| string[] \| boolean>` — keys match `formSchema[].id` | `{ "exp": "3+", "hasRadio": true }` |
| **VolunteerApplication.availability** | `Array<{ date: ISO8601, slots: string[] }>` | `[{ date: "2026-07-10", slots: ["morning", "afternoon"] }]` |
| **StaffRole.shifts** | `Array<{ date: ISO8601, startTime: HH:mm, endTime: HH:mm, label: string }>` | `[{ date: "2026-07-10", startTime: "09:00", endTime: "13:00", label: "Morning" }]` |
| **BadgeTemplate.layout** | `{ width: number, height: number, elements: Array<{ type: "text"\|"image"\|"barcode"\|"qr", x: number, y: number, w: number, h: number, field?: string, value?: string }> }` | Canvas layout definition |
| **HotelBlock.roomTypes** | `Array<{ name: string, rate: number, totalRooms: number, bookedRooms: number }>` | `[{ name: "Double", rate: 15900, totalRooms: 50, bookedRooms: 12 }]` (rate in cents) |
| **Raffle.prizes** | `Array<{ name: string, description: string, quantity: number }>` | `[{ name: "VIP Pass", description: "Free upgrade", quantity: 3 }]` |
| **VendorApplication.assistants** | `Array<{ name: string, email: string }>` | `[{ name: "Jane Doe", email: "jane@example.com" }]` |
| **StoreProduct.surcharges** | `Array<{ name: string, amount: number }>` | `[{ name: "Shipping", amount: 500 }]` (in cents) |
| **Event.settings** | `{ requireApproval: boolean, allowTransfers: boolean, maxRegistrationsPerUser: number, emailProviderId?: string }` | Event-level configuration flags |

> [!NOTE]
> All monetary values in JSON fields use **cents** (integer) to avoid floating-point precision issues. The Zod validators in `packages/validators/` enforce these schemas at runtime.

---

## Project Structure (Monorepo — High-Level)

> [!IMPORTANT]
> **This is a directory overview only, not a scaffolding guide.** Do NOT pre-create all files in Phase 0. Each phase's `[NEW]` file tags are the authoritative source for what gets created and when. This overview exists for orientation — to understand where code lives, not what files exist.

```
d:\GitHub\vFurst\
├── turbo.json                         # Turborepo workspace config
├── package.json                       # Root workspace (apps/*, packages/*)
├── .github/workflows/                 # CI/CD pipelines
├── docs/                              # API contracts, OpenAPI specs
├── packages/
│   ├── db/                            # Prisma schema + client singleton
│   ├── email/                         # Email service abstraction (SES + SMTP)
│   ├── validators/                    # Shared Zod schemas
│   └── types/                         # Shared TypeScript types + enums
├── apps/
│   ├── web/                           # Next.js 15 frontend + API
│   │   ├── middleware.ts              # Subdomain routing
│   │   ├── next.config.ts             # Includes @serwist/next for SW compilation
│   │   ├── public/                    # Static assets + compiled SW (sw.js)
│   │   └── src/
│   │       ├── app/                   # Next.js App Router pages
│   │       │   ├── (auth)/            # Login, register
│   │       │   ├── (marketing)/       # Landing, pricing, features, legal
│   │       │   ├── (convention)/      # Convention subdomain pages (public)
│   │       │   ├── dashboard/         # Admin dashboard (local shell + sidebar)
│   │       │   └── api/               # API routes (auth, webhooks, v1 public)
│   │       ├── components/            # Reusable UI components
│   │       ├── hooks/                 # Client hooks (e.g., useServiceWorker)
│   │       ├── lib/                   # Utilities (auth, stripe, barcode, etc.)
│   │       ├── actions/               # Server Actions
│   │       └── sw/                    # Service Worker source (compiled → public/sw.js)
│   └── worker/                        # BullMQ background job processor
│       └── src/jobs/                  # Email, badge gen, fee reconciliation
```

> [!NOTE]
> **Why no full file tree?** A detailed file tree always drifts from the phase descriptions as the plan evolves. Files listed in the tree but not described in any phase cause the coding agent to generate empty/wrong stubs. Files described in phases but missing from the tree get skipped. The `[NEW]` tags in each phase section are the single source of truth.

---

## Key shadcn/ui Components by Feature Area

| Feature Area | Local shadcn/ui Components |
|-------------|----------------------------|
| **Dashboard Shell** | Local dashboard shell, sidebar links, `Button` |
| **Data Tables** | `Table`, `PowerSearch`, `Badge` |
| **Forms** | `FormLayout`, `TextInput`, native inputs/selects/textareas styled by tokens |
| **Cards & Stats** | `Card`, `ProgressBar`, semantic headings/text |
| **Overlays** | Add shadcn/Radix primitives in `components/ui` as flows require |
| **Navigation** | Local sidebar, `SegmentedControl`, `Button` links |
| **Feedback** | `Badge`, `EmptyState`, token-styled banners |
| **Buttons/Actions** | `Button`, `buttonVariants` |
| **Layout** | App `vf-*` layout classes backed by shadcn CSS variables |
| **Content** | Native semantic HTML plus local UI primitives |
| **Check-in/Kiosk** | Native controls and local buttons/cards |