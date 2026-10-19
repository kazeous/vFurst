import * as Sentry from "@sentry/nextjs";
import { filterExpectedNextHttpAccessFallback } from "./lib/sentry-event-filter";
import { isPortalTokenPage } from "./lib/portal-token-telemetry";
import { scrubSentryEventUrls } from "./lib/sentry-url-scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
let telemetryExcluded = false;

function excludePortalTokenPage(href: string): boolean {
  if (telemetryExcluded) return true;
  if (!isPortalTokenPage(href, window.location.href)) return false;

  // Latch before stop(): Replay.stop() can asynchronously flush its buffer
  // directly through the transport, bypassing beforeSend and client.enabled.
  // Never reopen in this document, even after navigating away: queued events
  // can still contain the credential. A full document load starts afresh.
  telemetryExcluded = true;
  const client = Sentry.getClient();
  if (client) client.getOptions().enabled = false;
  void Sentry.getReplay()?.stop();
  return true;
}

if (!excludePortalTokenPage(window.location.href)) {
  // Register before SDK listeners so native back/forward closes the boundary
  // before their popstate handlers see the token-bearing location.
  window.addEventListener("popstate", () => excludePortalTokenPage(window.location.href));

  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    replaysSessionSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? 0.02),
    replaysOnErrorSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? 1),
    sendDefaultPii: false,
    beforeSend: (event, hint) => {
      const kept = filterExpectedNextHttpAccessFallback(event, hint);
      return kept ? scrubSentryEventUrls(kept) : null;
    },
    beforeSendTransaction: (event) => scrubSentryEventUrls(event),
    transport: (options: Parameters<typeof Sentry.makeFetchTransport>[0]) => {
      const transport = Sentry.makeFetchTransport(options);
      return {
        ...transport,
        send: (envelope: Parameters<typeof transport.send>[0]) => excludePortalTokenPage(window.location.href)
          ? Promise.resolve({})
          : transport.send(envelope)
      };
    },
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true
      })
    ]
  });

  // Wrap after init: Sentry's installed history wrapper triggers handlers
  // BEFORE calling its original method. Our outer wrapper must close the
  // boundary first, rather than allowing those handlers to see the token.
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method];
    window.history[method] = function (data, unused, url) {
      if (url != null) excludePortalTokenPage(String(url));
      return original.call(this, data, unused, url);
    };
  }
}

export const onRouterTransitionStart: typeof Sentry.captureRouterTransitionStart = (href, ...args) => {
  // Next invokes this before dispatching navigation (and its network work).
  if (!excludePortalTokenPage(href)) Sentry.captureRouterTransitionStart(href, ...args);
};
