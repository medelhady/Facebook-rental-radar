# Implementation Notes

## Current MVP

The first version is a Vercel-ready Next.js dashboard with demo data and Supabase schema.

It covers:

- Facebook group source management UI.
- Keyword dictionary UI for include, exclude, and location terms.
- Lead results table.
- Suggested comment templates.
- Basic Arabic parser for phone, price, location, office/account signal, duplicate hash, and confidence score.

## Expected first workflow

1. Admin adds Facebook group URLs.
2. Admin maintains include, exclude, and location keywords.
3. A scheduled worker runs every 6 hours.
4. The worker fetches posts from active sources.
5. Matching posts are parsed and stored as `facebook_leads`.
6. The dashboard shows the lead and suggested comment for human approval.

## Facebook collection options

The dashboard is intentionally separated from collection logic.

Recommended order:

1. Manual or semi-manual import to validate extraction and lead workflow.
2. Official Graph API if permissions are available for owned or managed groups.
3. A separate browser automation worker on Render, Railway, Fly.io, or VPS if API access is not available.

Avoid running browser automation on Vercel serverless functions because it is fragile for long-running sessions.

## Deployment shape

- Dashboard: Vercel
- Repository: GitHub
- Database/Auth: Supabase
- Scheduler: Supabase Cron, GitHub Actions, or external worker
- Browser worker if needed: Render/Railway/Fly.io/VPS

## Verification note

`npm install` did not complete in this local environment. It started without creating `node_modules` or a lockfile and produced no error output. The project files are ready, but a final local build should be run after installing dependencies:

```bash
npm install
npm run build
```
