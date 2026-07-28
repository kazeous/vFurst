# syntax=docker/dockerfile:1.7
# Image for @vfurst/worker. Runs the compiled `dist/index.js` produced by
# `npm run build --workspace @vfurst/worker`.
#
# Build from the repository root:
#   docker build -f docker/worker.Dockerfile -t vfurst-worker:staging \
#     --build-arg SOURCE_COMMIT=$(git rev-parse HEAD) .

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
 && apt-get install --yes --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /repo
COPY package.json package-lock.json turbo.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/email/package.json packages/email/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --no-audit --fund=false

FROM base AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages
COPY . .
RUN npm run build --workspace @vfurst/contracts \
 && npm run build --workspace @vfurst/email \
 && npm run build --workspace @vfurst/db \
 && npm run build --workspace @vfurst/worker

FROM base AS runner
ARG SOURCE_COMMIT=unknown
ENV NODE_ENV=production \
    WORKER_HEALTH_PORT=3100 \
    COOLIFY_GIT_COMMIT_SHA=${SOURCE_COMMIT}
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs --create-home --shell /sbin/nologin worker

COPY --from=builder --chown=worker:nodejs /repo/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=worker:nodejs /repo/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder --chown=worker:nodejs /repo/packages ./packages
# Reuse the already-installed node_modules from the builder stage so the
# runtime image only ships what `node apps/worker/dist/index.js` resolves.
COPY --from=builder --chown=worker:nodejs /repo/node_modules ./node_modules

USER worker
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.WORKER_HEALTH_PORT+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/worker/dist/index.js"]
