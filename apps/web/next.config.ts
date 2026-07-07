import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },
  reactStrictMode: true
};

const withSerwist = withSerwistInit({
  swSrc: "src/sw/offline-checkin.ts",
  swDest: "public/sw.js"
});

export default withSerwist(nextConfig);
