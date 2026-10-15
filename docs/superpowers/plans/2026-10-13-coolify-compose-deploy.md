# Single Coolify Compose Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four staging Coolify resources with one Docker Compose resource built from a single multi-target `Dockerfile`, run the schema chain in a one-shot `migrate` service, and gate merges into `staging` with a native `linux/arm64` image build in CI.

**Architecture:**

- One root `Dockerfile` produces three images, `web`, `worker` and `migrate`, from shared `deps`/`build` stages.
- `compose.prod.yaml` runs them next to PostgreSQL and Redis on Compose's internal network.
- `scripts/validate-compose.mjs` makes the Coolify-specific file checkable by strict Docker Compose and enforces that every key in each app's `.env.example` reaches its container.
- CI adds a cache-only arm64 build job. Deployment is Coolify's GitHub App auto-deploy, gated by a `staging` ruleset that the user configures.

**Tech Stack:** Docker BuildKit and buildx, Docker Compose v2, GitHub Actions (`ubuntu-24.04`, `ubuntu-24.04-arm`), Node 24 (`node:test` for the validator), npm workspaces + Turborepo, Prisma 6 `db push`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-coolify-compose-deploy-design.md`. Read §4 and §5 before Tasks 3–4, and §7–§8 before Task 7.

## Global Constraints

- **Workspace:** work only in `D:\GitHub\vFurst\.claude\worktrees\coolify-compose-deploy` on branch `chore/coolify-compose-deploy`.
  - The branch is cut from `origin/staging` (`97bc517`) and has no upstream.
  - Never push, merge, rebase onto another branch, or open a pull request.
  - Never touch the checkout at `D:\GitHub\vFurst`; it is on `feat/identity-replatform`.
- **Pinned values (spec §4–§5):**
  - images `node:24-bookworm-slim`, `postgres:16-bookworm`, `redis:7-bookworm`;
  - web port `3000`, worker health port `3100`;
  - image names `vfurst-web`, `vfurst-worker` and `vfurst-migrate`, each tagged `${SOURCE_COMMIT}`.
- **Compose file rules:**
  - the only `exclude_from_hc: true` is on `migrate`;
  - no YAML anchors or merge keys;
  - no `ports:` on any service;
  - ASCII characters only.
- **Non-destructive schema:** never add `--accept-data-loss` or `--force-reset` to any script.
- **No registry, no emulation:** never run `docker push`, never reference GHCR, and never use `docker/setup-qemu-action`.
- **Secrets:** the smoke environment file holds synthetic values only and lives outside the repository. Never commit an `.env` file. Never print a real credential.
- **Shell:** run Docker, Compose and smoke commands in Git Bash (`bash`). Prefix `docker run` commands that mount the repository with `MSYS_NO_PATHCONV=1`.
- **Line endings:** this Windows checkout converts text files to CRLF (`core.autocrlf`). Every parser in this plan must accept CRLF.
- **Gates** run serially: `npx turbo run <task> --concurrency=1`.
- **Commits** use conventional messages, one per task. Do **not** add a `Co-Authored-By: Claude` trailer; the executor is the author.
- **Docker containers:**
  - This plan publishes no host port, so the user's pawket containers on 5432/6379 do not matter.
  - Do not start, stop or remove any container or volume outside the Compose project `vfurst-compose-smoke`.
- **Execution:**
  - Tasks run strictly in order (0 → 8), and each may be its own agent run.
  - Only Task 8 edits `PROGRESS.md`.
  - Wherever a step says **stop**, the agent stops, reports what it found, and does not improvise a workaround.

## Review Focus

1. **CRLF checkouts.** On this Windows worktree, `compose.prod.yaml` and every `.env.example` have CRLF line endings. The validator must still find the marker and the keys. Task 2 pins this with `projectForDocker keeps CRLF line endings`.
2. **Empty optional values.** `${VAR:-}` delivers `""`, not "unset". Checkout must fall back to `AUTH_SECRET`, and web must boot with every optional key empty. Task 1 tests the checkout fallback; Task 5 boots the stack with no optional key set.
3. **Every deployment after the first** re-runs `migrate` against an already-synchronized database, and it must exit 0. Task 5 runs `migrate` a second time.
4. **A failing `migrate`** must exit non-zero, otherwise `service_completed_successfully` would start web and worker on an unsynchronized schema. Task 5 runs `migrate` with a wrong password and expects a non-zero exit.
5. **Environment drift.** A key added to an app's `.env.example` but not to `compose.prod.yaml` never reaches the container. Task 2's contract tests pin the error messages, and CI runs `compose:validate` (Task 6).

---

### Task 0: Preflight

**Files:** none

- [x] **Step 1: Confirm the workspace**

  Run: `git branch --show-current; git status --short; git log --oneline -4`
  Expected:
  - branch `chore/coolify-compose-deploy`;
  - empty `git status`;
  - the spec and plan commits on top of `97bc517 fix(deps): resolve October 2026 security advisories (#22)`.

  Otherwise **stop**.

- [x] **Step 2: Install dependencies**

  Run: `npm ci`
  Expected: success. The worktree starts without `node_modules`.

- [x] **Step 3: Record the baseline**

  Run: `npx turbo run type-check lint test build --concurrency=1; npm run test:boot-config`
  Expected:
  - everything passes;
  - the known BullMQ dynamic-dependency warning is allowed.

  Write down the task counts and per-suite test counts for Task 8. If anything is red, **stop**.

- [x] **Step 4: Confirm Docker tooling**

  Run in bash: `docker version --format '{{.Server.Os}}/{{.Server.Arch}} {{.Server.Version}}'; docker compose version; docker buildx version`
  Expected: three version lines. On 2026-10-13 they were `linux/amd64`, Compose v5.5.1 and buildx v0.37.2. If the Docker daemon is not running, **stop** and ask the user to start Docker Desktop.

---

### Task 1: Treat empty optional values as unset in web (spec §5.4)

**Files:**
- Create: `apps/web/src/lib/payments/checkout-token.test.ts`
- Modify:
  - `apps/web/src/lib/payments/checkout-token.ts:4-10`
  - `apps/web/src/sentry.server.config.ts:4`
  - `apps/web/src/sentry.edge.config.ts:4`
  - `apps/web/src/lib/s3.ts:8`

**Interfaces:**
- Consumes: `hashCheckoutToken(token: string): string` (existing). It reads the environment on every call.
- Produces: no new interface.

- [x] **Step 1: Write the failing test**

  ```ts
  import { createHmac } from "node:crypto";
  import { afterEach, describe, expect, it, vi } from "vitest";
  import { hashCheckoutToken } from "./checkout-token";

  const hmac = (secret: string) => createHmac("sha256", secret).update("token").digest("hex");

  describe("checkout token secret", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("falls back to AUTH_SECRET when CHECKOUT_TOKEN_SECRET is empty", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("CHECKOUT_TOKEN_SECRET", "");
      vi.stubEnv("AUTH_SECRET", "auth-secret-for-test");
      expect(hashCheckoutToken("token")).toBe(hmac("auth-secret-for-test"));
    });

    it("prefers a non-empty CHECKOUT_TOKEN_SECRET", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("CHECKOUT_TOKEN_SECRET", "checkout-secret-for-test");
      vi.stubEnv("AUTH_SECRET", "auth-secret-for-test");
      expect(hashCheckoutToken("token")).toBe(hmac("checkout-secret-for-test"));
    });

    it("throws in production when both secrets are empty", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("CHECKOUT_TOKEN_SECRET", "");
      vi.stubEnv("AUTH_SECRET", "");
      expect(() => hashCheckoutToken("token")).toThrow("CHECKOUT_TOKEN_SECRET is not configured.");
    });

    it("uses the local development secret when both are empty outside production", () => {
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("CHECKOUT_TOKEN_SECRET", "");
      vi.stubEnv("AUTH_SECRET", "");
      expect(hashCheckoutToken("token")).toBe(hmac("vfurst-local-checkout-secret"));
    });
  });
  ```

- [x] **Step 2: Run it and see the first and last tests fail**

  Run: `cd apps/web && npx vitest run src/lib/payments/checkout-token.test.ts`
  Expected: FAIL.
  - "falls back to AUTH_SECRET…" throws `CHECKOUT_TOKEN_SECRET is not configured.`
  - "uses the local development secret…" hashes with `""`.

- [x] **Step 3: Change the four reads**

  - **`checkout-token.ts`:** in `checkoutSecret()`, replace both `??` with `||`. The fallback order and the production error stay the same.
  - **`sentry.server.config.ts` and `sentry.edge.config.ts`:** use `const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;`
  - **`s3.ts`:** use `endpoint: process.env.S3_ENDPOINT || undefined,`. Leave the `forcePathStyle` line unchanged.

- [x] **Step 4: Run the test and the web gates**

  Run: `cd apps/web && npx vitest run src/lib/payments/checkout-token.test.ts`. Then, from the root, run `npx turbo run type-check lint test --filter=@vfurst/web --concurrency=1`.
  Expected: 4/4 tests pass and the web tasks are green.

- [x] **Step 5: Confirm no `??` remains on these keys**

  Run: `git grep -n -E "process\.env\.(CHECKOUT_TOKEN_SECRET|NEXT_PUBLIC_SENTRY_DSN)[^;]*\?\?" -- apps/web/src`
  Expected: no output.

- [x] **Step 6: Commit**

  ```bash
  git add apps/web/src/lib/payments/checkout-token.ts apps/web/src/lib/payments/checkout-token.test.ts apps/web/src/sentry.server.config.ts apps/web/src/sentry.edge.config.ts apps/web/src/lib/s3.ts
  git commit -m "fix(web): treat empty optional env values as unset"
  ```

---

### Task 2: Compose validator and environment contract (spec §6.2)

**Files:**
- Create: `scripts/validate-compose.mjs`, `scripts/validate-compose.test.mjs`
- Modify: `package.json`, the `scripts` block

**Interfaces:**
- Produces, as named exports of `scripts/validate-compose.mjs`:
  - `CONTRACT_ADDITIONS = ["S3_PUBLIC_URL"]`
  - `CONTRACT_EXCLUSIONS = ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT", "VFURST_LAUNCH_URL"]`
  - `MIGRATE_ENVIRONMENT = ["NODE_ENV", "DATABASE_URL", "DIRECT_DATABASE_URL"]`
  - `projectForDocker(source: string): string`
    - Removes the single line that is exactly `exclude_from_hc: true` plus indentation and an optional trailing `\r`. Keeps every other line and its original line ending.
    - Throws an `Error` whose message contains `exactly one exclude_from_hc marker` when there are zero or several markers.
    - Throws an `Error` whose message contains `must belong to migrate` when the owning service is a different one. The owning service is the nearest preceding line that matches `/^  ([A-Za-z0-9_-]+):\s*$/`.
  - `placeholderEnvironment(source: string): Record<string, string>`
    - One entry per distinct name in `${NAME:?…}`, each with the value `"compose-validate-placeholder"`.
    - `${NAME:-…}` and `${NAME}` are not included.
  - `parseEnvExampleKeys(source: string): string[]`: the distinct `KEY` of every line matching `/^([A-Z][A-Z0-9_]*)=/`, in file order. Comments and blank lines are ignored, and CRLF is accepted.
  - `checkEnvironmentContract(config: { services: Record<string, { environment?: Record<string, string | null> }> }, contracts: { web: string[]; worker: string[] }): string[]`. It returns errors in this order:
    - for each of `web` and `worker`: `"<service> is missing <KEY>"` for every key of the contract plus `CONTRACT_ADDITIONS` minus `CONTRACT_EXCLUSIONS` that is absent from the environment, then `"<service> must not set <KEY>"` for every `CONTRACT_EXCLUSIONS` key that is present;
    - for `migrate`: `"migrate is missing <KEY>"` and `"migrate must not set <KEY>"` against exactly `MIGRATE_ENVIRONMENT`.
  - `main(argv: string[]): number`, the exit code. The module runs `process.exit(main(process.argv.slice(2)))` only when it is the entry point (`import.meta.url === pathToFileURL(process.argv[1]).href`). If that guard misfires on Windows, the CLI silently prints nothing and exits 0. That is why Task 4 Step 2 requires the success line, not just exit code 0.
    - **`--print`:** write `projectForDocker` of the repository-root `compose.prod.yaml` to stdout and return 0.
    - **Default:**
      1. Run `docker compose -p vfurst-compose-validate -f - config --format json` with `spawnSync`. Pass `input` = the projected source, `cwd` = the repository root, and `env` = `{ ...process.env, ...placeholderEnvironment(source) }`.
      2. On a non-zero exit, write its stderr and return 1.
      3. Otherwise parse the JSON, read both `apps/*/.env.example` files through `parseEnvExampleKeys`, write each error from `checkEnvironmentContract` to stderr, and return 1 if there are any.
      4. On success, print `compose.prod.yaml is valid: web <n> keys, worker <m> keys.` and return 0.

    Resolve the repository root from `import.meta.url`, not from `process.cwd()`. Nothing is written to disk.
- Produces root scripts `compose:validate` and `test:compose`.

- [x] **Step 1: Write the failing tests** in `scripts/validate-compose.test.mjs` (`node:test`, `node:assert/strict`):

  1. `projectForDocker removes the migrate marker`
     - Source: a `services:` block with `migrate:` (with `    exclude_from_hc: true` and `    restart: "no"`) and `web:`.
     - Result: no `exclude_from_hc` substring, and still contains `    restart: "no"`.
  2. `projectForDocker keeps CRLF line endings`
     - Source: the same text joined with `\r\n`.
     - Result: no marker, and every remaining line ends in `\r\n`. The test compares against the expected string directly.
  3. `projectForDocker rejects a file without a marker`: `assert.throws(…, /exactly one exclude_from_hc marker/)`.
  4. `projectForDocker rejects two markers`: the same regex.
  5. `projectForDocker rejects a marker on another service`: the marker under `web:` gives `assert.throws(…, /must belong to migrate/)`.
  6. `placeholderEnvironment lists each required variable once`
     - Source: `a: ${A:?x}\nb: ${B:?y}\nc: ${A:?z}\nd: ${C:-d}\ne: ${D}`.
     - Result: `deepEqual` with `{ A: "compose-validate-placeholder", B: "compose-validate-placeholder" }`.
  7. `parseEnvExampleKeys ignores comments and blank lines`
     - Source: `# c\r\n\r\nNODE_ENV=x\r\nREDIS_URL=redis://y\r\nNODE_ENV=z\r\n`.
     - Result: `["NODE_ENV", "REDIS_URL"]`.
  8. `checkEnvironmentContract accepts a complete config`
     - Contracts: web `["AUTH_URL", "SENTRY_ORG"]`, worker `["REDIS_URL"]`.
     - Environments:
       - web `{ AUTH_URL: "x", S3_PUBLIC_URL: "" }`;
       - worker `{ REDIS_URL: "x", S3_PUBLIC_URL: "" }`;
       - migrate `{ NODE_ENV: "production", DATABASE_URL: "x", DIRECT_DATABASE_URL: "x" }`.
     - Result: `[]`.
  9. `checkEnvironmentContract reports missing and forbidden keys`
     - The same contracts. Changes from the complete config:
       - web lacks `AUTH_URL` and sets `SENTRY_ORG`;
       - worker lacks `S3_PUBLIC_URL`;
       - migrate additionally sets `REDIS_URL`.
     - Result: `deepEqual` with `["web is missing AUTH_URL", "web must not set SENTRY_ORG", "worker is missing S3_PUBLIC_URL", "migrate must not set REDIS_URL"]`.

- [x] **Step 2: Run them and see them fail**

  Run: `node --test scripts/validate-compose.test.mjs`
  Expected: FAIL. The module does not exist.

- [x] **Step 3: Implement `scripts/validate-compose.mjs`** with the exports above. Use only Node built-ins (`node:child_process`, `node:fs`, `node:path`, `node:url`).

- [x] **Step 4: Add the root scripts**

  In `package.json` `scripts`, add `"compose:validate": "node scripts/validate-compose.mjs"` and `"test:compose": "node --test scripts/validate-compose.test.mjs"`.

- [x] **Step 5: Run the tests**

  Run: `npm run test:compose`
  Expected: 9/9 pass.

- [x] **Step 6: Commit**

  ```bash
  git add scripts/validate-compose.mjs scripts/validate-compose.test.mjs package.json
  git commit -m "feat(deploy): validate the Coolify Compose file and its env contract"
  ```

---

### Task 3: One multi-target `Dockerfile` and one schema chain (spec §5.1–§5.3, §5.5)

**Files:**
- Create: `Dockerfile`
- Delete: `docker/web.Dockerfile`, `docker/worker.Dockerfile`
- Modify: `packages/db/package.json` (`scripts`), `apps/web/package.json` (`scripts.prestart`), `.dockerignore`

**Interfaces:**
- Produces:
  - build targets `web`, `worker`, `migrate`;
  - build args `SOURCE_COMMIT` plus the ten `NEXT_PUBLIC_*` names listed in spec §5.2;
  - the npm script `sync` in `@vfurst/db`.

- [x] **Step 1: Define the schema chain once**

  - In `packages/db/package.json` add `"sync": "npm run prepare:payment-attempt-locks && npm run push && npm run backfill:managed-tenancy && npm run backfill:payment-attempt-locks"`.
  - In `apps/web/package.json` set `"prestart": "node ../../scripts/check-app-env.mjs web && npm run sync --workspace @vfurst/db"`.

  Run: `node -e "const s=require('./packages/db/package.json').scripts.sync, p=require('./apps/web/package.json').scripts.prestart; if (!s || s.includes('accept-data-loss') || !p.endsWith('npm run sync --workspace @vfurst/db')) process.exit(1); console.log('ok')"`
  Expected: `ok`.

- [x] **Step 2: Write `Dockerfile`**

  - **Header:**
    - `# syntax=docker/dockerfile:1.7`;
    - a comment naming the three targets and the local check command `docker buildx build --target <web|worker|migrate> --output type=cacheonly .`;
    - `ARG NODE_VERSION=24`.
  - **`base` and `deps`:** exactly today's stages. `deps` copies the `package.json` of `apps/web`, `apps/worker`, `packages/auth`, `packages/contracts`, `packages/db`, `packages/email` and `packages/tenant-context`.
  - **`build`** (new):

    ```dockerfile
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
    ```

  - **`web`:** today's web `runner` stage, with these changes:
    - rename it `web`;
    - every `--from=builder` becomes `--from=build`;
    - add `ARG SOURCE_COMMIT=unknown` before its `ENV`;
    - remove its `HEALTHCHECK`.
  - **`worker`:** the same changes, applied to today's worker `runner` stage.
  - **`migrate`** (new):

    ```dockerfile
    FROM base AS migrate
    ARG SOURCE_COMMIT=unknown
    ENV NODE_ENV=production \
        COOLIFY_GIT_COMMIT_SHA=${SOURCE_COMMIT}
    WORKDIR /app
    RUN groupadd --system --gid 1001 nodejs \
     && useradd  --system --uid 1001 --gid nodejs --create-home --shell /sbin/nologin migrate
    COPY --from=build --chown=migrate:nodejs /repo/package.json ./package.json
    COPY --from=build --chown=migrate:nodejs /repo/node_modules ./node_modules
    COPY --from=build --chown=migrate:nodejs /repo/packages/db ./packages/db
    USER migrate
    CMD ["npm", "run", "sync", "--workspace", "@vfurst/db"]
    ```

- [x] **Step 3: Narrow the build context**

  Append these lines to `.dockerignore`: `docs`, `apps/docs`, `tests`, `.superpowers`, `.hallmark`, `.backups`, `PROGRESS.md`.

- [x] **Step 4: Delete the old Dockerfiles**

  Run: `git rm docker/web.Dockerfile docker/worker.Dockerfile`
  Expected: the `docker/` directory no longer exists.

- [x] **Step 5: Build every target locally**

  Run in bash:

  ```bash
  for target in web worker migrate; do docker buildx build --target "$target" --build-arg SOURCE_COMMIT=local-check --output type=cacheonly . || exit 1; done
  ```

  Expected:
  - three successful builds;
  - the `worker` and `migrate` builds show `CACHED` for the `npm ci` and `npm run build` steps.

  If the local builder rejects `type=cacheonly`, use `--load -t vfurst-$target:local-check` instead and remove those three images afterwards.

  A build failure that a change inside this task's files cannot fix means **stop**.

- [x] **Step 6: Commit**

  ```bash
  git add Dockerfile .dockerignore packages/db/package.json apps/web/package.json
  git commit -m "build(docker): build web, worker and migrate from one Dockerfile"
  ```

---

### Task 4: `compose.prod.yaml` (spec §4)

**Files:**
- Create: `compose.prod.yaml`

**Interfaces:**
- Consumes:
  - the Task 3 targets and build args;
  - `npm run compose:validate` from Task 2.
- Produces: services `postgres`, `redis`, `migrate`, `worker`, `web`, and volumes `postgres_data`, `redis_data`. Later tasks and the runbook rely on these names.

- [x] **Step 1: Write `compose.prod.yaml`**

  Start with a comment of at most four lines:
  - this is the Coolify deployment source;
  - local development uses `docker-compose.yml`;
  - validate it with `npm run compose:validate`;
  - see `docs/launch/staging-coolify-setup.md`.

  - **`postgres`:**
    - `image: postgres:16-bookworm`;
    - `command: postgres -c max_connections=100`;
    - `restart: unless-stopped`;
    - `environment` with `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`, each `${NAME:?Set NAME in Coolify}`;
    - volume `postgres_data:/var/lib/postgresql/data`;
    - healthcheck `["CMD-SHELL", "pg_isready -U \"$${POSTGRES_USER}\" -d \"$${POSTGRES_DB}\""]`, with interval `5s`, timeout `5s`, retries `20` and start_period `10s`.
  - **`redis`:**
    - `image: redis:7-bookworm`;
    - `command: redis-server --appendonly yes`;
    - `restart: unless-stopped`;
    - volume `redis_data:/data`;
    - healthcheck `["CMD", "redis-cli", "ping"]`, with interval `5s`, timeout `5s`, retries `20` and start_period `5s`.
  - **`migrate`, `worker`, `web`:** each has
    - `image: vfurst-<name>:${SOURCE_COMMIT:?Enable Include Source Commit in Build in Coolify}`;
    - `build: { context: ., target: <name>, args: … }`. The `args` are **identical across all three services**:
      - `SOURCE_COMMIT` in the same `:?` form as the image;
      - the ten `NEXT_PUBLIC_*` build args in the class of the spec §4.3 table. The four URLs and `NEXT_PUBLIC_ROOT_DOMAIN` are `:?`. `NEXT_PUBLIC_APP_NAME:-vFurst`, `NEXT_PUBLIC_SENTRY_DSN:-` (empty), `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE:-0.1`, `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE:-0.02` and `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE:-1` carry defaults.
  - **`migrate`:**
    - `restart: "no"`;
    - `exclude_from_hc: true`;
    - `environment` exactly `NODE_ENV: production` plus the derived `DATABASE_URL` and `DIRECT_DATABASE_URL`;
    - `depends_on: { postgres: { condition: service_healthy } }`.
  - **`worker`:**
    - `restart: unless-stopped`, `stop_grace_period: 30s`, `expose: ["3100"]`;
    - `environment`: every key of `apps/worker/.env.example` plus `S3_PUBLIC_URL`, each in its spec §4.3 class, with the default copied from that `.env.example` for tunables. `WORKER_HEALTH_PORT: "3100"` is fixed;
    - healthcheck `["CMD", "node", "-e", "fetch('http://127.0.0.1:3100/').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]`, with interval `10s`, timeout `5s`, retries `12` and start_period `30s`;
    - `depends_on`: `postgres` and `redis` `service_healthy`, `migrate` `service_completed_successfully`.
  - **`web`:**
    - `restart: unless-stopped`, `stop_grace_period: 30s`, `expose: ["3000"]`;
    - `environment`: every key of `apps/web/.env.example` plus `S3_PUBLIC_URL`, minus the four exclusions, each in its spec §4.3 class;
    - fixed `PORT: "3000"`, `HOSTNAME: 0.0.0.0` and `AUTH_TRUST_HOST: "true"`;
    - `VFURST_WEB_REPLICAS` defaults to `1`, and `SALES_CONTACT_EMAIL` to `sales@vfurst.com`;
    - healthcheck as for the worker, but `http://127.0.0.1:3000/api/healthz`;
    - `depends_on` as for the worker.
  - **Derived values**, with no other host or form:
    - `DATABASE_URL` and `DIRECT_DATABASE_URL` are `postgresql://${POSTGRES_USER:?Set POSTGRES_USER in Coolify}:${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in Coolify}@postgres:5432/${POSTGRES_DB:?Set POSTGRES_DB in Coolify}?schema=public`;
    - `REDIS_URL` is `redis://redis:6379`.
  - **Top-level `volumes:`:** `postgres_data:` and `redis_data:`.

- [x] **Step 2: Validate**

  Run: `npm run compose:validate`
  Expected: `compose.prod.yaml is valid: web <n> keys, worker <m> keys.` and exit code 0. Any `is missing` or `must not set` line means the environment is wrong; fix the file, not the validator.

- [x] **Step 3: Check the file rules**

  Run in bash: `grep -nP '[^\x00-\x7F]' compose.prod.yaml; grep -nE '^\s+ports:|<<:|&[a-z]' compose.prod.yaml; grep -c 'exclude_from_hc' compose.prod.yaml`
  Expected: no output from the first two commands, and `1` from the third.

- [x] **Step 4: Commit**

  ```bash
  git add compose.prod.yaml
  git commit -m "feat(deploy): add the Coolify Compose stack"
  ```

---

### Task 5: Local production-stack smoke (spec §9.4)

**Files:** none in the repository. This task produces evidence for Task 8 and no commit.

Every bash invocation in this task starts with this preamble:

```bash
SMOKE_DIR="${TMPDIR:-/tmp}/vfurst-compose-smoke"
smoke() { docker compose -p vfurst-compose-smoke --project-directory "$PWD" -f "$SMOKE_DIR/compose.yaml" --env-file "$SMOKE_DIR/smoke.env" "$@"; }
```

- [x] **Step 1: Prepare the scratch directory**

  1. Create `$SMOKE_DIR`.
  2. Run `node scripts/validate-compose.mjs --print > "$SMOKE_DIR/compose.yaml"`.
  3. Write `$SMOKE_DIR/smoke.env` with exactly these keys:
     - `SOURCE_COMMIT=$(git rev-parse HEAD)`;
     - `POSTGRES_USER=vfurst`, `POSTGRES_DB=vfurst`, and `POSTGRES_PASSWORD` = 32 random hex characters;
     - `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MANAGER_URL`, `NEXT_PUBLIC_CONSOLE_URL` and `AUTH_URL` = `https://vfurst-smoke.test`, and `NEXT_PUBLIC_API_URL=https://vfurst-smoke.test/api`;
     - `NEXT_PUBLIC_ROOT_DOMAIN=vfurst-smoke.test`;
     - `AUTH_SECRET` = 64 random hex characters;
     - `EMAIL_DELIVERY_ENCRYPTION_KEY` = the output of `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`;
     - `S3_BUCKET_NAME=vfurst-smoke`, `AWS_REGION=us-east-1`, `AWS_ACCESS_KEY_ID=smoke-access-key`, `AWS_SECRET_ACCESS_KEY=smoke-secret-key`.

  No optional key is set. That is the Review Focus 2 condition.

- [x] **Step 2: Start the stack**

  Run: `smoke up -d --build`, then poll `smoke ps -a --format '{{.Service}} {{.State}} {{.Health}} {{.ExitCode}}'` every 10 s for up to 5 minutes.
  Expected:
  - `migrate exited  0`;
  - `postgres`, `redis`, `worker` and `web` are `running healthy`.

  On any other final state, save `smoke logs --no-color <service> | tail -n 80` for the failing service, run Step 7, and **stop**.

- [x] **Step 3: Check web and worker health**

  Run:
  - `smoke exec -T web node -e "fetch('http://127.0.0.1:3000/api/healthz').then(async (r) => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); })"`
  - the same against the worker with `http://127.0.0.1:3100/`

  Expected:
  - web prints `200` with a body containing `"commit":"<SOURCE_COMMIT>"`;
  - worker prints `200` with `"ok":true`.

- [x] **Step 4: Check the schema exists**

  Run: `smoke exec -T postgres psql -U vfurst -d vfurst -tAc "select to_regclass('public.organizations') is not null and to_regclass('public.payment_attempts') is not null"`
  Expected: `t`.

- [x] **Step 5: Re-run `migrate` against the synchronized database**

  Run: `smoke run --rm migrate; echo "exit=$?"`
  Expected: `exit=0`.

- [x] **Step 6: Make `migrate` fail on purpose**

  Run:

  ```bash
  smoke run --rm -e DATABASE_URL='postgresql://vfurst:wrong@postgres:5432/vfurst?schema=public' -e DIRECT_DATABASE_URL='postgresql://vfurst:wrong@postgres:5432/vfurst?schema=public' migrate; echo "exit=$?"
  ```

  Expected: an authentication error and `exit=` followed by a non-zero number.

- [x] **Step 7: Tear down**

  Run:
  - `smoke down -v --remove-orphans`;
  - `docker image rm vfurst-web:<SOURCE_COMMIT> vfurst-worker:<SOURCE_COMMIT> vfurst-migrate:<SOURCE_COMMIT>`;
  - `rm -rf "$SMOKE_DIR"`.

  Expected: `docker compose ls -a` no longer lists `vfurst-compose-smoke`.

  Record the results of Steps 2–6 for Task 8.

---

### Task 6: CI arm64 gate and removal of the webhook deploy (spec §6.1)

**Files:**
- Modify: `.github/workflows/ci.yml`
- Delete: `.github/workflows/staging-deploy.yml`

**Interfaces:**
- Produces two check names for the user's ruleset: `Lint, type-check, test, and build` and `Production images (linux/arm64)`.

- [x] **Step 1: Edit `ci.yml`**

  - Keep `name: CI` and the triggers.
  - Add top-level `permissions: { contents: read }`.
  - Add `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.
  - In `verify`:
    - set `runs-on: ubuntu-24.04`;
    - insert two steps after `Test`: `Compose validator tests` (`npm run test:compose`) and `Validate production Compose` (`npm run compose:validate`).
  - Add this job:

  ```yaml
    arm64-images:
      # Native arm64 runner (free for public repositories): no QEMU emulation.
      # Builds only to the cache; Coolify builds the deployed images itself.
      name: Production images (linux/arm64)
      runs-on: ubuntu-24.04-arm
      steps:
        - name: Checkout
          uses: actions/checkout@v4

        - name: Set up Docker Buildx
          uses: docker/setup-buildx-action@v3

        - name: Build web, worker, and migrate for linux/arm64
          run: |
            for target in web worker migrate; do
              docker buildx build --platform linux/arm64 --target "$target" \
                --build-arg SOURCE_COMMIT="${GITHUB_SHA}" --output type=cacheonly .
            done
  ```

- [x] **Step 2: Delete the webhook workflow**

  Run: `git rm .github/workflows/staging-deploy.yml`

- [x] **Step 3: Lint the workflows**

  Run in bash: `MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -color`
  Expected: no findings, exit 0. If the image cannot be pulled, record "actionlint not run" for Task 8 and continue; the pull request run is then the check.

- [x] **Step 4: Commit**

  ```bash
  git add .github/workflows/ci.yml
  git commit -m "ci: verify arm64 production images and drop the webhook deploy"
  ```

---

### Task 7: Documentation (spec §8)

**Files:**
- Modify:
  - `docs/launch/staging-coolify-setup.md` (full rewrite)
  - `docs/launch/go-live-checklist.md`
  - `AGENTS.md`
  - `docs/plan/verification.md`

- [x] **Step 1: Rewrite `docs/launch/staging-coolify-setup.md`** with these sections, in order:

  1. **Intro.** One resource on the Docker Compose build pack, deployed by the Coolify GitHub App from `staging`. The CI gate works through a ruleset. CI builds arm64 to the cache only. No GHCR, no API token, no webhook.
  2. **`## 1. Topology`.** The spec §4.1 table, the §4.2 start-order diagram, and both accepted trade-offs from spec §2 (downtime per deployment; no Coolify-managed backups).
  3. **`## 2. Cutover from the four-resource setup`.** Spec §7 steps 1–8 as a numbered list. Step 1 says to delete `.github/workflows/staging-deploy.yml` on `main` from the GitHub web UI with "Create a new branch and start a pull request".
  4. **`## 3. Create the Compose resource`.**
     - A settings table: Source, Repository, Branch, Build pack, Base directory, Docker Compose location, Include Source Commit in Build, Auto Deploy, Preview deployments.
     - The domain syntax `https://vfurst.reyuugames.com:3000` on the `web` service.
  5. **`## 4. Environment`**, with three lists:
     - **Build variables:** the ten `NEXT_PUBLIC_*` names, marked Build Variable. The URL ones are also used at runtime.
     - **Required runtime values:** the spec §4.3 required class, minus the public build variables. Show how to generate them: `openssl rand -hex 32` for `POSTGRES_PASSWORD`, and `openssl rand -base64 32` for `AUTH_SECRET` and `EMAIL_DELIVERY_ENCRYPTION_KEY`.
     - **Tunables and optional values:** point to `compose.prod.yaml` for the defaults, and name `VFURST_WEB_REPLICAS=1`.

     State that `DATABASE_URL`, `DIRECT_DATABASE_URL` and `REDIS_URL` are derived and must **not** be entered.
  6. **`## 5. Branch ruleset`.** Spec §6.3, with the two exact check names.
  7. **`## 6. Deploy flow`.** Merge, then auto deploy, then one build of three targets, then data services healthy, then `migrate`, then `worker` and `web`. Describe what a failed build looks like (the old stack keeps running) and what a failed `migrate` looks like (staging is down until the next good deployment).
  8. **`## 7. Smoke`.** The three `curl` checks from spec §7 step 6, and the commit match.
  9. **`## 8. Database reset`.** Spec §7.1.
  10. **`## Troubleshooting`.** One entry each for:
      - a missing `SOURCE_COMMIT` (`Enable Include Source Commit in Build`);
      - `migrate` exited non-zero, with its log and the destructive-schema case;
      - `[check-app-env]` exit;
      - worker unhealthy;
      - a public value not marked Build Variable;
      - Cloudflare `Flexible` SSL redirect loop. Keep this one as a single sentence pointing to `go-live-checklist.md`.

- [x] **Step 2: Update `docs/launch/go-live-checklist.md`**

  - Add a bullet to the first checklist list, in that list's style: `Production PostgreSQL backups and a restore drill are in place. The single-resource Compose topology has no Coolify-managed database backups (decided 2026-10-13).`
  - In the paragraph beginning "Production database schema must be synchronized", replace the claim that the web `prestart` hook synchronizes the schema with: the `migrate` service runs `npm run sync --workspace @vfurst/db` (prepare, `prisma db push`, both backfills) before web and worker start, and web and worker do not start if it fails. Keep the code block's three commands, which are what `sync` runs, and the no-`--accept-data-loss` explanation.
  - In the connection-budget paragraph, delete "and that rolling-deploy overlap retains headroom".

- [x] **Step 3: Update `AGENTS.md`**

  - In "Environment files", change the add-a-variable sentence to: "When adding a variable, add it to the app's `.env.example`, to the root files, **and** to `compose.prod.yaml`, or the sync or the deployment will not carry it; `npm run compose:validate` fails until the deployment does."
  - In "Commands", add `- npm run compose:validate — check compose.prod.yaml and its environment contract (needs Docker)`. Change the last bullet to `docker compose up -d` (local services from `docker-compose.yml`) + `npm run prestart --workspace @vfurst/web` (runs `npm run sync --workspace @vfurst/db`).
  - Add after "Commands": `Deployment: the root Dockerfile and compose.prod.yaml define the single Coolify resource; see docs/launch/staging-coolify-setup.md. docker-compose.yml is local development only.`

- [x] **Step 4: Update `docs/plan/verification.md`**

  After the "Every session" block, add a section:

  ````markdown
  ## Every session that touches deployment files

  When `Dockerfile`, `compose.prod.yaml`, `.dockerignore`, `scripts/validate-compose.mjs`, or an app `.env.example` changes:

  ```bash
  npm run test:compose
  npm run compose:validate
  ```
  ````

- [x] **Step 5: Sweep for the retired pieces**

  The runbook's cutover section names the retired workflow and secrets on purpose, so that the user can delete them (spec §7 steps 1 and 8). The sweep therefore excludes the runbook, and a second check confines the runbook's mentions to that section. This was amended on 2026-10-13, after the executor flagged that the original sweep contradicted Step 1.

  1. Run: `git grep -n -I -E "docker/(web|worker)\.Dockerfile|staging-deploy|COOLIFY_WEBHOOK|COOLIFY_API_TOKEN" -- . ':!PROGRESS.md' ':!docs/superpowers' ':!docs/launch/staging-coolify-setup.md'`
     Expected: no output.
  2. Run in bash: `awk '/^## /{cutover = ($0 ~ /^## 2\. Cutover from the four-resource setup/)} !cutover && /docker\/(web|worker)\.Dockerfile|staging-deploy|COOLIFY_WEBHOOK|COOLIFY_API_TOKEN/ {print FNR": "$0}' docs/launch/staging-coolify-setup.md`
     Expected: no output. Every mention is inside the cutover section.
  3. Run: `grep -c -E "staging-deploy\.yml" docs/launch/staging-coolify-setup.md; grep -c -E "COOLIFY_API_TOKEN" docs/launch/staging-coolify-setup.md`
     Expected: two numbers, each at least `1`. The cutover steps still tell the user what to delete.

- [x] **Step 6: Commit**

  ```bash
  git add docs/launch/staging-coolify-setup.md docs/launch/go-live-checklist.md AGENTS.md docs/plan/verification.md
  git commit -m "docs(deploy): document the single Compose resource"
  ```

---

### Task 8: Closeout

**Files:**
- Modify: `PROGRESS.md`

- [x] **Step 1: Run the full gates**

  Run: `npx turbo run type-check lint test build --concurrency=1; npm run test:boot-config; npm run test:compose; npm run compose:validate`
  Expected:
  - everything passes;
  - the turbo counts equal the Task 0 baseline, plus the one new web test file (4 tests).

  Any new warning blocks.

- [x] **Step 2: Repeat the empty-value grep (spec K3)**

  Run:

  ```bash
  git grep -n -E "process\.env\.(CHECKOUT_TOKEN_SECRET|NEXT_PUBLIC_SENTRY_DSN|SENTRY_DSN|S3_ENDPOINT|S3_PUBLIC_URL|SMTP_[A-Z_]+|STRIPE_[A-Z_]+|SEPAY_[A-Z_]+)\b[^;]*\?\?" -- apps/web/src packages
  ```

  Expected: no output.

- [x] **Step 3: Repeat the Task 7 sweep**

  Run the three Task 7 Step 5 commands again.
  Expected: the same results. Commands 1 and 2 print nothing, and command 3 prints two numbers of at least `1`.

- [x] **Step 4: Add the session entry to `PROGRESS.md`**

  Insert a new entry at the top of "Session log": `### <today> — Single Coolify Compose deployment (out-of-phase infrastructure, executed)`. It records:
  - **what changed:** the `Dockerfile` targets, `compose.prod.yaml`, the `sync` script, the validator and contract, the CI arm64 job, the removed webhook workflow, the four empty-value fixes, and the documents;
  - **evidence:** the Task 0 baseline counts, the Task 8 Step 1 counts, the Task 3 local builds, the Task 5 smoke results (states, healthz commit, re-run exit 0, failing-run exit code), and the actionlint result;
  - any stop point that was hit and how the user resolved it.

  Do not change "Current phase" or the status table.

  End the entry with: `**Next:** the user pushes chore/coolify-compose-deploy, opens a pull request into staging, confirms both CI jobs are green, and follows docs/launch/staging-coolify-setup.md §2. Phase 1B continues on feat/identity-replatform with unit 1B.2; merge staging into it at the start of that unit.`

- [x] **Step 5: Commit**

  ```bash
  git add PROGRESS.md
  git commit -m "docs(progress): record the Compose deployment change"
  ```

- [x] **Step 6: Report**

  List the commits (`git log --oneline 97bc517..HEAD`) and the manual steps waiting for the user (spec §7). Do not push.
