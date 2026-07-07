"use client";

import { checkInRegistration } from "@/actions/phase5-actions";
import { useServiceWorker } from "@/hooks/use-service-worker";
import { Button } from "@astryxdesign/core/Button";
import { BrowserQRCodeReader } from "@zxing/browser";
import { useMemo, useState } from "react";

type ExpressRow = {
  id: string;
  orgId: string;
  eventId: string;
  attendee: string;
  email: string;
  code: string;
  status: string;
  badgePrinted: boolean;
};

export function ExpressKiosk({ rows }: { rows: ExpressRow[] }) {
  const [scan, setScan] = useState("");
  const [message, setMessage] = useState("Scan the QR code from the confirmation email.");
  const { online } = useServiceWorker();
  const match = useMemo(() => {
    const normalized = scan.trim().toLowerCase();
    return rows.find((row) => [row.id, row.code, row.email].some((value) => value.toLowerCase().includes(normalized)));
  }, [rows, scan]);

  async function startScan() {
    try {
      const reader = new BrowserQRCodeReader();
      const result = await reader.decodeOnceFromVideoDevice(undefined, "vf-express-video");
      setScan(result.getText());
      setMessage("Identity verified. Check-in is ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Camera scanner is unavailable.");
    }
  }

  return (
    <div className="vf-kiosk">
      <div className={online ? "vf-banner vf-banner-success" : "vf-banner vf-banner-warning"}>
        <strong>{online ? "Online kiosk" : "Offline kiosk"}</strong>
        <span>{online ? "Check-ins will post immediately." : "The service worker queues check-ins until the network returns."}</span>
      </div>
      <section className="vf-kiosk-panel">
        <h2>Express check-in</h2>
        <video id="vf-express-video" className="vf-kiosk-video" muted playsInline />
        <label>
          QR / registration code
          <input value={scan} onChange={(event) => setScan(event.target.value)} autoFocus placeholder="Scan or paste code" />
        </label>
        <Button label="Use camera" type="button" onClick={startScan} variant="primary" />
        <p className="vf-muted">{message}</p>
      </section>

      {match ? (
        <section className="vf-kiosk-result">
          <h2>{match.attendee}</h2>
          <p>{match.email}</p>
          <p className="vf-muted">
            Badge {match.badgePrinted ? "ready to print" : "not printed yet"} - {match.status}
          </p>
          <form action={checkInRegistration}>
            <input type="hidden" name="orgId" value={match.orgId} />
            <input type="hidden" name="eventId" value={match.eventId} />
            <input type="hidden" name="registrationId" value={match.id} />
            <Button label="Check in and print badge" type="submit" variant="primary" />
          </form>
        </section>
      ) : (
        <section className="vf-kiosk-result">
          <h2>Waiting for scan</h2>
          <p className="vf-muted">A matched attendee will appear here for confirmation and automatic badge printing.</p>
        </section>
      )}
    </div>
  );
}
