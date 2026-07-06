# Phase 5 — Advanced Features (Weeks 26–30)

> **Goal**: Badge designer, print queue, cashier UI, express check-in, offline fallback, registration transfers, raffle system, custom email templates, staff notes.

---

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/badges/designer/page.tsx`
Visual badge template designer:
- **`react-konva`** canvas editor — renders `BadgeTemplate.layout` elements as Konva nodes (Rect, Text, Image, Group) on an HTML5 Canvas via React declarative API
- Add: text fields, images, barcodes, QR codes, attendee data placeholders
- Drag-and-drop positioning and resizing via Konva's built-in `Transformer`
- Layer management (z-order) via Konva layer ordering
- Preview with sample registration data
- Save/load templates, set as default for registration types
- Output: saves element positions/sizes to `BadgeTemplate.layout` JSON (same schema used by `generate-badges.ts` for server-side rendering via `pdf-lib`)

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/badges/page.tsx`
Badge management:
- Batch generate badges for all confirmed registrations
- Print queue (sorted by registration order)
- Reprint individual badges
- Print statistics

##### [NEW] `apps/web/src/lib/webusb-printer.ts`
WebUSB thermal printer driver (inspired by ConCat's [WebZLP](https://github.com/ConventionCatCorp/WebZLP)):
- Detect connected Zebra LP-series printers via WebUSB
- Send ZPL (Zebra Programming Language) commands
- Print queue with status tracking
- **Browser compatibility guard**: checks `navigator.usb` availability at init. WebUSB is supported in Chrome/Edge only — if unavailable (Safari, Firefox), shows a banner explaining the requirement and falls back to PDF download for manual printing

##### [NEW] `apps/worker/src/jobs/generate-badges.ts`
BullMQ job processor for `badgeQueue`:
- Processes batch badge generation requests (triggered from badges/page.tsx)
- **Dual output format**:
  - **PDF** (`pdf-lib`): reads `BadgeTemplate.layout` JSON, creates a PDF page per badge, positions text/images/barcodes according to layout coordinates. Pure JS — no native Canvas/Cairo bindings, runs on Railway without platform issues.
  - **ZPL** (string generation): converts the same layout JSON into ZPL command strings for Zebra thermal printers. Sent directly to printer via WebUSB on the client side.
- **Barcode/QR rendering** (`bwip-js`): generates barcode/QR PNG buffers which are embedded into the PDF via `pdf-lib`'s image embedding, or converted to ZPL `^BQ`/`^BC` commands for thermal output
- Uploads generated PDF badge sheets to S3 via `lib/s3.ts`
- Updates `Badge` record with `barcodeData` and generation status
- Supports partial batch retries (skip already-generated badges)

> [!NOTE]
> **Why pdf-lib + ZPL, not node-canvas or Puppeteer?**
> - `node-canvas` requires native Cairo bindings — known build failures on some platforms, needs extra Railway/Docker config
> - Puppeteer uses headless Chrome (~400MB, high memory) — overkill for structured badge layouts
> - `pdf-lib` is pure JavaScript, zero native dependencies, and `BadgeTemplate.layout` is already structured as positioned elements — a perfect fit for programmatic PDF generation
> - ZPL strings are generated directly from the same layout data — no rendering library needed for thermal output

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/check-in/page.tsx`
**Staff check-in interface** — the primary check-in page for event staff:
- Search attendees by name, email, badge number, or registration ID
- Camera/USB barcode scanner input for QR code scanning
- Show attendee details: registration type, payment status (paid/unpaid), badge status (printed/not), add-ons
- One-click check-in button with confirmation
- Trigger badge reprint from this page
- Registers offline SW via `useServiceWorker()` for offline fallback
- Visual indicator for online/offline status

> [!NOTE]
> This is the parent page for the check-in section. `cashier/page.tsx` and `express/page.tsx` are specialized sub-pages. This page is the standard staff workflow.

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/check-in/cashier/page.tsx`
**Cashier UI** — dedicated in-person registration desk:
- Walk-in registration flow (create + pay + print badge in one flow)
- Cash/card toggle
- Badge print on completion
- Optimized for speed (keyboard shortcuts)

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/check-in/express/page.tsx`
**Express Mode**:
- Self-service kiosk interface
- Attendee scans own QR code (from confirmation email)
- Auto-verify identity
- Auto-print badge via WebUSB
- No staff intervention needed

##### Service Worker: Offline Check-In

> [!IMPORTANT]
> **Service Workers must be served from a public URL.** Next.js only serves static files from `public/`. A `.ts` file in `src/workers/` would never be compiled or reachable by `navigator.serviceWorker.register()`, causing silent runtime failure.

The offline check-in system uses **3 files**:

##### [NEW] `apps/web/next.config.ts` (MODIFY)
Add `@serwist/next` plugin to the Next.js config. This compiles the SW source from `src/sw/` and outputs the compiled JS to `public/sw.js` at build time:
```ts
import withSerwist from '@serwist/next';
export default withSerwist({
  swSrc: 'src/sw/offline-checkin.ts',  // Source (TypeScript)
  swDest: 'public/sw.js',              // Output (served at /sw.js)
})({ /* existing next config */ });
```

##### [NEW] `apps/web/src/sw/offline-checkin.ts`
The Service Worker **source** (compiled to `public/sw.js` by `@serwist/next`):
- Uses Serwist's `BackgroundSyncQueue` to queue check-in API calls when offline
- Caches the check-in page shell + attendee lookup data for offline access
- On reconnect: drains the queue and syncs all queued check-ins to the server
- This file is TypeScript and gets compiled — it is NOT served directly

##### [NEW] `apps/web/src/hooks/use-service-worker.ts`
Client-side registration hook (used in check-in pages):
```ts
'use client';
import { useEffect } from 'react';
export function useServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js'); // ← serves from public/
    }
  }, []);
}
```
The check-in and express mode pages call `useServiceWorker()` to register the compiled SW.

**Offline fallback behavior:**
- Cache check-in page + attendee data for offline use
- Queue check-ins locally (IndexedDB via Serwist BackgroundSyncQueue) when offline
- Sync to server when connectivity restored
- Visual indicator for offline mode (banner component reads `navigator.onLine`)

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/registrations/transfers/page.tsx`
**Registration transfer flow**:
- Initiator requests transfer, enters recipient email
- Recipient receives email with accept/decline link
- On accept: registration ownership transfers, new badge generated
- Admin can view/approve/deny transfers

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/raffle/page.tsx`
**Raffle system**:
- Create raffle: name, prizes, draw date, eligibility rules
- Entry methods (auto-enter on registration, manual entry, ticket purchase)
- Random draw with winner notification
- Winner history

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/settings/emails/page.tsx`
**Custom email template engine**:
- Edit templates for: registration confirmation, payment receipt, volunteer approval, vendor status, transfer request
- Variable placeholders (`{{attendee.name}}`, `{{event.name}}`, etc.)
- Preview with sample data
- HTML + plain text versions

---
