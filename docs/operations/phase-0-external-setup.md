# Phase 0 External Setup Checklist

This checklist covers the Phase 0 work that cannot be completed or verified from
repository files alone. Do not mark Phase 0 complete in `PROGRESS.md` until every
item below has real external evidence.

## Stripe Connect Platform

Required setup:

- Create the vFurst Stripe platform account.
- Enable Stripe Connect.
- Configure destination charges as the intended charge type.
- Add OAuth redirect URIs for each environment:
  - Local: `http://localhost:3000/api/stripe/return`
  - Staging: `https://staging.vfurst.app/api/stripe/return`
  - Production: `https://vfurst.app/api/stripe/return`
- Add refresh URLs for each environment:
  - Local: `http://localhost:3000/api/stripe/refresh`
  - Staging: `https://staging.vfurst.app/api/stripe/refresh`
  - Production: `https://vfurst.app/api/stripe/refresh`
- Store environment-specific values for:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_CLIENT_ID`
  - `STRIPE_CONNECT_RETURN_URL`
  - `STRIPE_CONNECT_REFRESH_URL`

Evidence required:

- Stripe dashboard shows Connect enabled.
- Stripe dashboard shows the redirect and refresh URLs above.
- Deployment secret store contains the Stripe values for staging and production.

## Vercel Web Hosting

Required setup:

- Create the Vercel project for `apps/web`.
- Link production to `vfurst.app`.
- Configure preview deployments for pull requests.
- Add GitHub Actions secrets:
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
  - `VERCEL_TOKEN`
- Add application environment variables from `.env.staging` and production
  equivalents in the Vercel dashboard.

Evidence required:

- Vercel project exists and is linked to the repository.
- A preview deployment succeeds from `.github/workflows/deploy.yml`.
- A production deployment succeeds from `.github/workflows/deploy.yml` on `main`.

## Railway Redis

Required setup:

- Create a Railway project for background job infrastructure.
- Create a Redis service.
- Store `REDIS_URL` in staging and production deployment environments.

Evidence required:

- Railway dashboard shows an active Redis service.
- `REDIS_URL` is present in the staging and production secret stores.

## AWS S3 Assets Bucket

Required setup:

- Create S3 buckets for event assets:
  - Staging: `vfurst-staging-assets`
  - Production: `vfurst-production-assets`
- Configure private bucket access by default.
- Configure CORS for browser presigned uploads from:
  - `https://staging.vfurst.app`
  - `https://vfurst.app`
- Create an IAM principal with least-privilege access for object read/write in
  the vFurst asset buckets.
- Store environment-specific values for:
  - `AWS_REGION`
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `S3_BUCKET`

Evidence required:

- AWS console shows the staging and production buckets.
- Bucket policies do not expose public writes.
- Deployment secret stores contain the AWS/S3 values.

## Phase 0 Completion Gate

After the external setup is complete:

1. Confirm all required secrets exist in staging and production secret stores.
2. Run the full Phase 0 verification checklist:
   - `npm run test`
   - `npm run test:e2e`
   - `turbo run type-check`
   - `turbo run lint`
   - `cd packages/db && npx prisma validate`
   - `turbo run build`
3. Confirm GitHub Actions CI is green on the Phase 0 commit.
4. Confirm the Vercel deploy workflow can produce preview and production
   deployments.
5. Update `PROGRESS.md` and mark Phase 0 complete only when the repository
   checks and the external evidence above are both present.
