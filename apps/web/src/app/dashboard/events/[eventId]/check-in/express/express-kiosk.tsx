"use client";

import { checkInRegistration } from "@/actions/phase5-actions";
import { BadgePrintControls } from "@/components/badges/badge-print-controls";
import { useServiceWorker } from "@/hooks/use-service-worker";
import { Button } from "@/components/ui/button";
import { BrowserQRCodeReader } from "@zxing/browser";
import { useMemo, useState } from "react";

type ExpressRow = {
  id: string;
  attendee: string;
  email: string;
  code: string;
  status: string;
  badge: {
    id: string;
    pdfUrl: string | null;
    zplData: string | null;
    generatedAt: string | null;
    printedAt: string | null;
  } | null;
};

export function ExpressKiosk({ rows }: { rows: ExpressRow[] }) {
  const [scan, setScan] = useState("");
  const [message, setMessage] = useState("Scan the QR code from the confirmation email.");
  const { online } = useServiceWorker();
  const match = useMemo(() => {
    const normalized = scan.trim().toLowerCase();
    if (!normalized) return undefined;
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
            Badge {match.badge?.printedAt ? "printed" : match.badge?.generatedAt ? "output ready" : "not ready"} - {match.status}
          </p>
          <form action={checkInRegistration}>
            <input type="hidden" name="registrationId" value={match.id} />
            <Button label={match.status === "CHECKED_IN" ? "Checked in" : "Check in"} type="submit" variant="primary" />
          </form>
          {match.badge ? (
            <BadgePrintControls
              badgeId={match.badge.id}
              label={match.attendee}
              pdfUrl={match.badge.pdfUrl}
              zplData={match.badge.zplData}
              generatedAt={match.badge.generatedAt}
              printedAt={match.badge.printedAt}
            />
          ) : null}
        </section>
      ) : (
        <section className="vf-kiosk-result">
          <h2>Waiting for scan</h2>
          <p className="vf-muted">A matched attendee will appear here for check-in and verified printer output.</p>
        </section>
      )}
    </div>
  );
}
