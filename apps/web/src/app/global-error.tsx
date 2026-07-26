"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Renders in place of the root layout, so globals.css is unavailable — styles are inline.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#faf8f5", color: "#1f2933" }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div role="alert" style={{ maxWidth: 520, background: "#fff", border: "1px solid #e3ddd3", borderRadius: 12, padding: 32 }}>
            <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>vFurst hit an unexpected error</h1>
            <p style={{ margin: "0 0 16px", lineHeight: 1.5 }}>
              The page could not recover on its own. Trying again usually works; if it keeps failing, contact support
              {error.digest ? (
                <> and mention reference <code style={{ background: "#f4f0ea", padding: "1px 5px", borderRadius: 4 }}>{error.digest}</code></>
              ) : null}
              .
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => reset()}
                style={{ background: "#0f766e", color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer" }}
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.assign("/")}
                style={{ background: "none", border: 0, padding: "10px 4px", color: "#0f766e", fontSize: 14, cursor: "pointer", textDecoration: "underline" }}
              >
                Back to home
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
