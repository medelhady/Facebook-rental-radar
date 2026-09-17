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
3. Apify runs on the interval set in the dashboard.
4. The webhook receives the finished run and reads its dataset.
5. Matching posts are parsed and stored as `facebook_leads`.
6. The dashboard shows the lead and suggested comment for human approval.

## Facebook collection

Collection runs on Apify (`curious_coder/facebook-post-scraper`) through a saved Task that holds
the cookies of a dedicated secondary account and a residential proxy. Datacenter proxies failed
authentication. The dashboard drives that Task and its Schedule over the Apify API, and results
arrive on the `ACTOR.RUN.SUCCEEDED` webhook. See the README for the console setup.

The manual capture screen is kept, not replaced: cookies expire and the account can be locked,
and pasting a post by hand is the fallback when a run comes back empty.

Graph API was not an option — these are groups the user does not own.

## Deployment shape

- Dashboard: Vercel
- Repository: GitHub
- Database/Auth: Supabase
- Scraper and scheduler: Apify (saved Task + Schedule)

## Verification note

`npm run build` passes. The filter was measured against 138 real posts exported from two
Nouakchott groups before it was wired in; the numbers are in the README.
