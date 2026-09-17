# Facebook Rental Radar

MVP dashboard for tracking rental posts from preconfigured Facebook groups.

## What this first version includes

- Admin dashboard for Facebook group sources.
- Keyword dictionaries for include, exclude, and location terms.
- Lead table with extracted phone, price, location, account, and suggested comment.
- Supabase schema for deployment.
- Demo data fallback so the UI works before connecting Supabase.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local`.
4. Fill `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
5. Restart the dev server.

Reads and writes go through route handlers under `app/api`, which use the service role key
on the server. The key never reaches the browser. Without these variables the dashboard falls
back to demo data and shows a warning, and saving is disabled.

### Security note

The API routes are not behind a login yet, so anyone who can open the deployed URL can add
groups, keywords, and templates. Add Supabase admin auth before making the Vercel URL public.

## Deployment

Push this folder to GitHub and import it in Vercel. Add the same environment variables in Vercel.

## Capture from the Facebook app on Android

The dashboard is an installable PWA that registers itself as an Android share target,
so a post can go from the Facebook app into `facebook_leads` without copying fields by hand.

1. Deploy to Vercel (the share target needs HTTPS — `localhost` will not do).
2. On the phone, open the Vercel URL in Chrome.
3. Chrome menu → **Add to Home screen** / **Install app**.
4. In the Facebook app, open a post → **Share** → pick **رادار الإيجار**.
5. `/capture` opens with the post link filled in, and the group matched from the link
   when that group is already in `facebook_groups`. Paste the post text, review the
   extracted fields, save.

Facebook usually shares the permalink and not the body of the post, which is why the
capture screen has a one-tap **لصق من الحافظة** button — long-press the post text in the
Facebook app, copy it, then paste.

### Locking the capture endpoint

`POST /api/leads` is open by default. Set `CAPTURE_TOKEN` in the environment to require
an `x-capture-token` header on every capture.
