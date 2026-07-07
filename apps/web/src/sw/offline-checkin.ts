import { BackgroundSyncQueue, Serwist, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: Array<string | PrecacheEntry>;
  }
}

declare const self: WorkerGlobalScope & SerwistGlobalConfig;

const checkInQueue = new BackgroundSyncQueue("offline-check-in", {
  maxRetentionTime: 24 * 60
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => url.pathname.includes("/dashboard/events/") && url.pathname.includes("/check-in"),
      handler: new NetworkFirst({
        cacheName: "check-in-pages",
        networkTimeoutSeconds: 3
      })
    },
    {
      matcher: ({ url }) => url.pathname.includes("/dashboard/events/") && url.pathname.includes("/registrations"),
      handler: new StaleWhileRevalidate({
        cacheName: "attendee-lookup"
      })
    },
    {
      matcher: ({ request, url }) => request.method === "POST" && url.pathname.includes("/check-in"),
      handler: new NetworkOnly({
        plugins: [
          {
            fetchDidFail: async ({ request }) => {
              await checkInQueue.pushRequest({ request });
            }
          }
        ]
      })
    }
  ]
});

serwist.addEventListeners();
