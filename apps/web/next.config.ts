import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

const sentryRelease =
  process.env.SENTRY_RELEASE || process.env.COOLIFY_GIT_COMMIT_SHA || process.env.NIXPACKS_GIT_COMMIT_SHA;

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },
  reactStrictMode: true,
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
    treeshake: {
      removeDebugLogging: true
    }
  }
});
