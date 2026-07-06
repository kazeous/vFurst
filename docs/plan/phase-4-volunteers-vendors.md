# Phase 4 — Volunteers & Vendors (Weeks 20–25)

> **Goal**: Volunteer application builder, department management, approval workflows, dealer applications, booth/table management, assistants.

---

#### Volunteer System

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/staff/page.tsx`
Staff overview: department list, total volunteers, unfilled shifts, pending applications count.

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/staff/departments/page.tsx`
Department management:
- Create departments (Registration, Security, Panels, AV, etc.)
- Assign department leads
- **Form builder**: configure custom volunteer application questions per department (stored as JSON schema on Department)

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/staff/applications/page.tsx`
Volunteer application management:
- Applications list with status filters (PENDING/APPROVED/REJECTED)
- Review individual applications: view form responses, availability, preferences
- Approve → creates `StaffAssignment` linked to the `VolunteerApplication`
- Reject with optional reason (sent via email)
- Bulk approve/reject

##### [NEW] `apps/web/src/app/(convention)/volunteer/page.tsx`
Public volunteer application form (convention subdomain):
- Renders dynamic form fields from department's JSON schema
- Availability calendar picker (which days/shifts the volunteer is available)
- Department preference selection (1st/2nd/3rd choice)
- Creates a `VolunteerApplication` record with status PENDING

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/staff/schedule/page.tsx`
Shift schedule:
- Calendar/grid view of shifts by department
- Drag-and-drop volunteer assignment
- **Availability matching**: auto-suggest based on volunteer's `VolunteerApplication.availability`
- Conflict detection (double-booking)
- **Mass email**: email all volunteers in a department

##### [NEW] `apps/web/src/components/forms/volunteer-form-builder.tsx`
Dynamic form builder for volunteer applications:
- Drag-and-drop field types (text, select, checkbox, textarea)
- Required/optional toggle
- Preview mode
- Outputs JSON schema stored on `Department.formSchema`

##### [NEW] `apps/web/src/actions/staff-actions.ts`
Server Actions: `submitVolunteerApplication`, `approveApplication`, `rejectApplication`, `assignShift`, `removeAssignment`.

---

#### Vendor/Dealer System

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/vendors/page.tsx`
Vendor application management:
- Application list with status (PENDING/APPROVED/REJECTED/WAITLISTED)
- Bulk approve/reject
- Application detail: business info, product description, uploaded files
- **Dealer assistants**: view/manage listed assistants per vendor

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/vendors/booths/page.tsx`
Booth/table management:
- Booth layout grid/map
- **Table type + amenity products**: define table sizes with different prices + optional amenities
- Assign vendors to booths
- Track booth status (available, assigned, paid)

##### [NEW] `apps/web/src/app/(convention)/vendor-apply/page.tsx`
Public vendor application (convention subdomain):
- Business info, product description
- Table type selection + amenity add-ons
- **Dealer assistants**: add assistant names + badges
- **Seating preferences**: neighbor/location preferences
- File uploads (product photos, business license)
- Payment for booth upon approval

##### [NEW] `apps/web/src/actions/vendor-actions.ts`
Server Actions: `submitApplication`, `approveVendor`, `rejectVendor`, `waitlistVendor`, `assignBooth`, `addAssistant`.

---
