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
4. Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Deployment

Push this folder to GitHub and import it in Vercel. Add the same environment variables in Vercel.
