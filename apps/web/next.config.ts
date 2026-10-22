import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

const sentryRelease =
  process.env.SENTRY_RELEASE || process.env.COOLIFY_GIT_COMMIT_SHA || process.env.NIXPACKS_GIT_COMMIT_SHA;

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    authInterrupts: true,
    // Each process keeps ISR/data cache in memory: plain writeFile writes could expose partly written pages in shared .next.
    isrFlushToDisk: false
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        {
          // The middleware sets this header (after scrubbing every client-sent
          // x-vfurst-* header) on tenant-host page requests; see PORTAL_SLUG_HEADER
          // in src/middleware.ts. Rewriting here keeps portal pages in the ISR cache.
          source: "/:path*",
          has: [{ type: "header", key: "x-vfurst-portal-slug", value: "(?<portalSlug>[a-z0-9][a-z0-9.-]*)" }],
          destination: "/:portalSlug/:path*"
        }
      ],
      afterFiles: [],
      fallback: []
    };
  },
  async headers() {
    return [
      {
        source: "/set-password",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }]
      },
      {
        source: "/:orgSlug/set-password",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }]
      }
    ];
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"]
    };

    return config;
  }
};

const withSerwist = withSerwistInit({
  disable: process.env.NODE_ENV === "development",
  register: false,
  swSrc: "src/sw/offline-checkin.ts",
  swDest: "public/sw.js"
});

export default withSentryConfig(withSerwist(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  ...(sentryRelease ? { release: { name: sentryRelease } } : {}),
  silent: !process.env.CI,
  errorHandler(error) {
    console.warn(`[sentry] Source map upload failed: ${error.message}`);
  },
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  webpack: {
    autoInstrumentServerFunctions: false,
    autoInstrumentMiddleware: false,
    autoInstrumentAppDirectory: false,
    treeshake: {
      removeDebugLogging: true
    }
  }
});
