# syntax=docker/dockerfile:1.7
# Image for @vfurst/web. Builds the Next.js standalone bundle produced by
# `next build` (with output: "standalone" set in apps/web/next.config.ts) and
# ships only the runtime artefacts. The runtime user is `nextjs` (uid 1001)
# for least privilege.
#
# Build from the repository root:
#   docker build -f docker/web.Dockerfile -t vfurst-web:staging \
#     --build-arg GIT_SHA=$(git rev-parse --short HEAD) .

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /repo
# .npmrc lives at the repository root and tells npm 11+ to run install
# scripts for the packages that need them (Prisma, sentry-cli, sharp,
# esbuild). Without this, `npm ci` skips Prisma's client generation and
# the build breaks downstream.
COPY .npmrc package.json package-lock.json turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/email/package.json packages/email/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/tenant-context/package.json packages/tenant-context/package.json
RUN npm ci --no-audit --fund=false

FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages
COPY . .
RUN npm run build --workspace @vfurst/contracts \
 && npm run build --workspace @vfurst/email \
 && npm run build --workspace @vfurst/db \
 && npm run build --workspace @vfurst/web

FROM node:${NODE_VERSION}-bookworm-slim AS runner
ARG GIT_SHA=unknown
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    COOLIFY_GIT_COMMIT_SHA=${GIT_SHA}
WORKDIR /app

# Create a non-root user. Node 24-bookworm ships the `node` user at uid 1000;
# we keep that uid to align with the host's typical Coolify volume mapping.
RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs --create-home --shell /sbin/nologin nextjs

# Standalone bundle plus the static and public assets that standalone does not copy.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static  ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public        ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/package.json ./apps/web/package.json

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The standalone bundle writes the entrypoint at apps/web/server.js.
CMD ["node", "apps/web/server.js"]