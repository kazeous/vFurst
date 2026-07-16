"use client";

import { checkInRegistration } from "@/actions/phase5-actions";
import { BadgePrintControls } from "@/components/badges/badge-print-controls";
import { useServiceWorker } from "@/hooks/use-service-worker";
import { Button } from "@/components/ui/button";
import { BrowserQRCodeReader } from "@zxing/browser";
import { useMemo, useState } from "react";

type CheckInRow = {
  id: string;
  attendee: string;
  email: string;
  type: string;
  status: string;
  approvalStatus: "APPROVED" | "PENDING" | "REJECTED";
  badgeNumber: string | null;
  paid: boolean;
  checkedInAt: string | null;
  badge: {
    id: string;
    barcodeData: string;
    pdfUrl: string | null;
    zplData: string | null;
    generatedAt: string | null;
    printedAt: string | null;
  } | null;
  addOns: string[];
};

export function CheckInPanel({
  rows,
  initialQuery,
  pageSize,
  resultCount,
  totalCount
}: {
  rows: CheckInRow[];
  initialQuery: string;
  pageSize: number;
  resultCount: number;
  totalCount: number;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [scannerMessage, setScannerMessage] = useState("Ready for camera or USB scanner input.");
  const { online, registrationState } = useServiceWorker();
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return rows;
    }

    return rows.filter((row) =>
      [row.attendee, row.email, row.badgeNumber, row.id, row.badge?.barcodeData]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    );
  }, [query, rows]);

  async function startCameraScan() {
    try {
      const reader = new BrowserQRCodeReader();
      const result = await reader.decodeOnceFromVideoDevice(undefined, "vf-checkin-video");
      setQuery(result.getText());
      setScannerMessage("QR code captured.");
    } catch (error) {
      setScannerMessage(error instanceof Error ? error.message : "Unable to start camera scanner.");
    }
  }

  return (
    <div className="vf-checkin">
      <div className={online ? "vf-banner vf-banner-success" : "vf-banner vf-banner-warning"}>
        <strong>{online ? "Online" : "Offline mode"}</strong>
        <span>
          Service worker: {registrationState}. {online ? "Check-ins sync immediately." : "Check-ins are queued and replayed when the network returns."}
        </span>
      </div>

      <section className="vf-section">
        <form method="get" className="vf-form-grid">
          <label>
            Search or scan
            <input
              autoFocus
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, email, badge number, QR code, or registration ID"
            />
          </label>
          <div className="vf-scanner-control">
            <Button label="Search" type="submit" variant="primary" />
            <Button label="Start camera scan" type="button" onClick={startCameraScan} />
            <small className="vf-muted">{scannerMessage}</small>
          </div>
        </form>
        <video id="vf-checkin-video" className="vf-scan-video" muted playsInline />
      </section>

      <section className="vf-section">
        <h2>Attendees</h2>
        <p className="vf-muted">
          Loaded {rows.length} of {initialQuery ? resultCount : totalCount} attendee records
          {totalCount > pageSize ? ` (${totalCount} total)` : ""}.
        </p>
        <div className="vf-checkin-list">
          {filtered.map((row) => (
            <article key={row.id} className="vf-checkin-row">
              <div>
                <h3>{row.attendee}</h3>
                <p className="vf-muted">
                  {row.email} - {row.type} - {row.status} - approval {row.approvalStatus}
                </p>
                <p className="vf-muted">
                  Payment {row.paid ? "paid" : "unpaid"} - Badge{" "}
                  {row.badge?.printedAt
                    ? "printed"
                    : row.badge?.generatedAt
                      ? "output ready"
                      : row.badge
                        ? "render queued"
                        : "not generated"}
                </p>
                {row.addOns.length > 0 ? <p className="vf-muted">Add-ons: {row.addOns.join(", ")}</p> : null}
              </div>
              <div className="vf-inline-forms">
                <form action={checkInRegistration}>
                  <input type="hidden" name="registrationId" value={row.id} />
                  <Button label={row.checkedInAt ? "Checked in" : row.approvalStatus === "APPROVED" ? "Check in" : "Approval required"} type="submit" disabled={row.approvalStatus !== "APPROVED"} variant={row.checkedInAt ? "secondary" : "primary"} />
                </form>
                {row.badge ? (
                  <BadgePrintControls
                    badgeId={row.badge.id}
                    label={row.attendee}
                    pdfUrl={row.badge.pdfUrl}
                    zplData={row.badge.zplData}
                    generatedAt={row.badge.generatedAt}
                    printedAt={row.badge.printedAt}
                  />
                ) : null}
              </div>
            </article>
          ))}
          {filtered.length === 0 ? <p className="vf-empty">No attendee matches that lookup.</p> : null}
        </div>
      </section>
    </div>
  );
}
