"use client";

import { confirmBadgePrinted, queueBadgeRender } from "@/actions/phase5-actions";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/i18n";
import { badgeOutputMessage } from "@/lib/badge-output-status";
import { getWebUsbSupport, printZplQueue, type PrintJob } from "@/lib/webusb-printer";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type BadgePrintControlsProps = {
  badgeId: string;
  label: string;
  pdfUrl: string | null;
  zplData: string | null;
  generatedAt: string | null;
  printedAt: string | null;
  renderIssue: string | null;
};

export function BadgePrintControls({
  badgeId,
  label,
  pdfUrl,
  zplData,
  generatedAt,
  printedAt,
  renderIssue
}: BadgePrintControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [usbSupported, setUsbSupported] = useState(false);
  const [message, setMessage] = useState(
    badgeOutputMessage({ generatedAt, printedAt, renderIssue })
  );

  useEffect(() => {
    const support = getWebUsbSupport();
    setUsbSupported(support.supported);

    if (!support.supported && zplData && !pdfUrl) {
      setMessage(support.message);
    }
  }, [pdfUrl, zplData]);

  function recordPrinted() {
    const formData = new FormData();
    formData.set("badgeId", badgeId);

    startTransition(async () => {
      try {
        await confirmBadgePrinted(formData);
        setMessage("Print confirmed.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to confirm this print.");
      }
    });
  }

  async function printWithZebra() {
    if (!zplData) {
      setMessage("Generate ZPL output before direct printing.");
      return;
    }

    let latest: PrintJob | undefined;
    try {
      await printZplQueue(
        [{ id: badgeId, label, zpl: zplData, status: "queued" }],
        (jobs) => {
          latest = jobs[0];
          if (latest?.status === "printing") setMessage("Sending badge to the Zebra printer...");
          if (latest?.status === "failed" || latest?.status === "fallback") {
            setMessage(latest.error ?? "Direct printing failed. Use the PDF fallback.");
          }
        }
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to connect to the selected printer.");
      return;
    }

    if (latest?.status === "printed") {
      recordPrinted();
    }
  }

  return (
    <div className="vf-inline-forms">
      {zplData ? (
        <Button
          label="Print with Zebra"
          type="button"
          size="sm"
          onClick={printWithZebra}
          disabled={!usbSupported || isPending}
        />
      ) : null}
      {pdfUrl ? (
        <Button
          label="Open PDF"
          href={pdfUrl}
          size="sm"
          linkProps={{ target: "_blank", rel: "noreferrer" }}
        />
      ) : null}
      {pdfUrl ? (
        <form action={confirmBadgePrinted}>
          <input type="hidden" name="badgeId" value={badgeId} />
          <Button label="Confirm PDF printed" type="submit" size="sm" disabled={isPending} />
        </form>
      ) : null}
      <form action={queueBadgeRender}>
        <input type="hidden" name="badgeId" value={badgeId} />
        <Button label={generatedAt ? "Regenerate output" : "Generate output"} type="submit" size="sm" />
      </form>
      <small className="vf-muted" aria-live="polite">
        {printedAt ? `Printed ${formatDate(printedAt, { dateStyle: "medium", timeStyle: "short" })}. ` : ""}
        {message}
      </small>
    </div>
  );
}
