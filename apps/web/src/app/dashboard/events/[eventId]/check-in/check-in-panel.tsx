"use client";

import { checkInRegistration, reprintBadge } from "@/actions/phase5-actions";
import { useServiceWorker } from "@/hooks/use-service-worker";
import { Button } from "@astryxdesign/core/Button";
import { BrowserQRCodeReader } from "@zxing/browser";
import { useMemo, useState } from "react";

type CheckInRow = {
  id: string;
  orgId: string;
  eventId: string;
  attendee: string;
  email: string;
  type: string;
  status: string;
  badgeNumber: string | null;
  paid: boolean;
  checkedInAt: string | null;
  badge: {
    id: string;
    barcodeData: string;
    printedAt: string | null;
  } | null;
  addOns: string[];
};

export function CheckInPanel({ rows }: { rows: CheckInRow[] }) {
  const [query, setQuery] = useState("");
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
        <div className="vf-form-grid">
          <label>
            Search or scan
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, email, badge number, QR code, or registration ID"
            />
          </label>
          <div className="vf-scanner-control">
            <Button label="Start camera scan" type="button" onClick={startCameraScan} />
            <small className="vf-muted">{scannerMessage}</small>
          </div>
        </div>
        <video id="vf-checkin-video" className="vf-scan-video" muted playsInline />
      </section>

      <section className="vf-section">
        <h2>Attendees</h2>
        <div className="vf-checkin-list">
          {filtered.map((row) => (
            <article key={row.id} className="vf-checkin-row">
              <div>
                <h3>{row.attendee}</h3>
                <p className="vf-muted">
                  {row.email} - {row.type} - {row.status}
                </p>
                <p className="vf-muted">
                  Payment {row.paid ? "paid" : "unpaid"} - Badge {row.badge?.printedAt ? "printed" : row.badge ? "queued" : "not generated"}
                </p>
                {row.addOns.length > 0 ? <p className="vf-muted">Add-ons: {row.addOns.join(", ")}</p> : null}
              </div>
              <div className="vf-inline-forms">
                <form action={checkInRegistration}>
                  <input type="hidden" name="orgId" value={row.orgId} />
                  <input type="hidden" name="eventId" value={row.eventId} />
                  <input type="hidden" name="registrationId" value={row.id} />
                  <Button label={row.checkedInAt ? "Checked in" : "Check in"} type="submit" variant={row.checkedInAt ? "secondary" : "primary"} />
                </form>
                {row.badge ? (
                  <form action={reprintBadge}>
                    <input type="hidden" name="orgId" value={row.orgId} />
                    <input type="hidden" name="eventId" value={row.eventId} />
                    <input type="hidden" name="badgeId" value={row.badge.id} />
                    <Button label="Reprint badge" type="submit" />
                  </form>
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
