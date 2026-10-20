import * as Sentry from "@sentry/nextjs";
import { filterExpectedNextHttpAccessFallback } from "./lib/sentry-event-filter";
import { scrubSentryEventUrls } from "./lib/sentry-url-scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,
    beforeSend: (event, hint) => {
      const kept = filterExpectedNextHttpAccessFallback(event, hint);
      return kept ? scrubSentryEventUrls(kept) : null;
    },
    beforeSendTransaction: (event) => scrubSentryEventUrls(event)
  });
}
