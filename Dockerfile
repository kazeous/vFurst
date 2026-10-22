# syntax=docker/dockerfile:1.7
# Build targets: web, worker, migrate.
# Local check: docker buildx build --target <web|worker|migrate> --output type=cacheonly .

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
 && apt-get install --yes --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/*

FROM base AS manifests
WORKDIR /repo
COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/email/package.json packages/email/package.json
COPY packages/tenant-context/package.json packages/tenant-context/package.json

# Full install, dev tooling included, for the build stage only.
FROM manifests AS deps
RUN npm ci --no-audit --fund=false

# Runtime installs for the worker and migrate images. Each is filtered to one
# workspace, so lint, type-check and test tooling never reaches them.
# --legacy-peer-deps stops npm pulling in @prisma/client's optional peers (the
# Prisma CLI and TypeScript); `npm ls` fails the build if the flag ever drops a
# required peer. @prisma/client's postinstall writes a placeholder client, which
# is deleted because each runtime image copies the one the build stage generated.
FROM manifests AS worker-deps
RUN npm ci --omit=dev --legacy-peer-deps --workspace @vfurst/worker --no-audit --fund=false \
 && npm ls --omit=dev --all --workspace @vfurst/worker > /dev/null \
 && rm -rf node_modules/.prisma

# Migrate runs `prisma db push`, so it keeps @vfurst/db's one devDependency,
# the Prisma CLI, and nothing from the other workspaces.
FROM manifests AS migrate-deps
RUN npm ci --legacy-peer-deps --workspace @vfurst/db --no-audit --fund=false \
 && npm ls --all --workspace @vfurst/db > /dev/null \
 && rm -rf node_modules/.prisma

FROM base AS build
ARG SOURCE_COMMIT=unknown
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_MANAGER_URL
ARG NEXT_PUBLIC_CONSOLE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ROOT_DOMAIN
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
ARG NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE
ARG NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1 \
    COOLIFY_GIT_COMMIT_SHA=${SOURCE_COMMIT}
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages
COPY . .
RUN npm run build --workspace @vfurst/contracts \
 && npm run build --workspace @vfurst/email \
 && npm run build --workspace @vfurst/db \
 && npm run build --workspace @vfurst/web \
 && npm run build --workspace @vfurst/worker

FROM base AS web
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
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
# Next.js standalone tracing includes sharp itself and the platform binding but
# omits sharp 0.35's separate libvips package. Keep the Linux native packages
# installed by the builder together so image optimization can load at runtime.
COPY --from=build --chown=nextjs:nodejs /repo/node_modules/@img ./node_modules/@img
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static  ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/public        ./apps/web/public
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/package.json ./apps/web/package.json
COPY --from=build --chown=nextjs:nodejs /repo/scripts/check-app-env.mjs ./scripts/check-app-env.mjs
COPY --from=build --chown=nextjs:nodejs /repo/scripts/lib/env-file.mjs ./scripts/lib/env-file.mjs
COPY --from=build --chown=nextjs:nodejs /repo/scripts/web-cluster.mjs ./scripts/web-cluster.mjs

USER nextjs
EXPOSE 3000

# Validate the runtime contract, then launch VFURST_WEB_REPLICAS server processes.
# exec keeps the launcher as PID 1 so it receives Docker's shutdown signal.
CMD ["sh", "-c", "node scripts/check-app-env.mjs web && exec node scripts/web-cluster.mjs apps/web/server.js"]

FROM base AS worker
ARG SOURCE_COMMIT=unknown
ENV NODE_ENV=production \
    WORKER_HEALTH_PORT=3100 \
    COOLIFY_GIT_COMMIT_SHA=${SOURCE_COMMIT}
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs --create-home --shell /sbin/nologin worker

COPY --from=build --chown=worker:nodejs /repo/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=worker:nodejs /repo/apps/worker/assets ./apps/worker/assets
COPY --from=build --chown=worker:nodejs /repo/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=worker:nodejs /repo/packages ./packages

# Production dependencies of @vfurst/worker only, plus the generated Prisma
# client and its query engine from the build stage.
COPY --from=worker-deps --chown=worker:nodejs /repo/node_modules ./node_modules
COPY --from=build --chown=worker:nodejs /repo/node_modules/.prisma ./node_modules/.prisma

USER worker
EXPOSE 3100

CMD ["node", "apps/worker/dist/index.js"]

FROM base AS migrate
ARG SOURCE_COMMIT=unknown
ENV NODE_ENV=production \
    COOLIFY_GIT_COMMIT_SHA=${SOURCE_COMMIT}
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs --create-home --shell /sbin/nologin migrate
COPY --from=build --chown=migrate:nodejs /repo/package.json ./package.json
COPY --from=migrate-deps --chown=migrate:nodejs /repo/node_modules ./node_modules
COPY --from=build --chown=migrate:nodejs /repo/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=migrate:nodejs /repo/packages/db ./packages/db
USER migrate
CMD ["npm", "run", "sync", "--workspace", "@vfurst/db"]
