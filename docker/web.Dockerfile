# syntax=docker/dockerfile:1.7
# Image for @vfurst/web. Builds the Next.js standalone bundle produced by
# `next build` (with output: "standalone" set in apps/web/next.config.ts) and
# ships only the runtime artefacts. The runtime user is `nextjs` (uid 1001)
# for least privilege.
#
# Build from the repository root:
#   docker build -f docker/web.Dockerfile -t vfurst-web:staging \
#     --build-arg SOURCE_COMMIT=$(git rev-parse HEAD) .

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
 && apt-get install --yes --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /repo
COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/email/package.json packages/email/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/tenant-context/package.json packages/tenant-context/package.json
RUN npm ci --no-audit --fund=false

FROM base AS builder
ARG SOURCE_COMMIT=unknown
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1 \
    COOLIFY_GIT_COMMIT_SHA=${SOURCE_COMMIT}
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages
COPY . .
RUN npm run build --workspace @vfurst/contracts \
 && npm run build --workspace @vfurst/email \
 && npm run build --workspace @vfurst/db \
 && npm run build --workspace @vfurst/web

FROM base AS runner
ARG SOURCE_COMMIT=unknown
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    COOLIFY_GIT_COMMIT_SHA=${SOURCE_COMMIT}
WORKDIR /app

# Create a non-root user. Node 24-bookworm ships the `node` user at uid 1000;
# we keep that uid to align with the host's typical Coolify volume mapping.
RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs --create-home --shell /sbin/nologin nextjs

# Standalone bundle plus the static and public assets that standalone does not copy.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
# Next.js standalone tracing includes sharp itself and the platform binding but
# omits sharp 0.35's separate libvips package. Keep the Linux native packages
# installed by the builder together so image optimization can load at runtime.
COPY --from=builder --chown=nextjs:nodejs /repo/node_modules/@img ./node_modules/@img
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static  ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public        ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/package.json ./apps/web/package.json
COPY --from=builder --chown=nextjs:nodejs /repo/scripts/check-app-env.mjs ./scripts/check-app-env.mjs
COPY --from=builder --chown=nextjs:nodejs /repo/scripts/lib/env-file.mjs ./scripts/lib/env-file.mjs

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The standalone bundle writes the entrypoint at apps/web/server.js. Validate
# the same runtime contract as `npm start` before accepting traffic.
CMD ["sh", "-c", "node scripts/check-app-env.mjs web && exec node apps/web/server.js"]
