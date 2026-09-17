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
2. Run `supabase/schema.sql` in the SQL editor, then `supabase/apify-collection.sql`
   (as two separate queries — see the note at the top of that file).
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

## Automatic collection with Apify

Collection runs on the Apify actor `curious_coder/facebook-post-scraper`, driven from the
`وقت البحث` screen so the Apify console is only needed once.

### One-time setup in the Apify console

1. Create a **Task** from the actor and save its input there: the exported cookies of a
   dedicated secondary Facebook account, a **residential** proxy (datacenter proxies fail
   authentication), the group URLs, and output format **Raw (full nested data)**.
2. Create a **Schedule** and point it at that **Task**, not at the Actor. A schedule attached
   to the Actor runs with an empty default input, so it carries no cookies and scrapes nothing.
3. Add a webhook on the Task for the `ACTOR.RUN.SUCCEEDED` event, with the URL
   `https://<your-vercel-domain>/api/apify-webhook?secret=<APIFY_WEBHOOK_SECRET>`.
4. Copy three values into the environment: the personal API token
   (Settings → Integrations), the task id (`username~task-name`), and the schedule id
   (the last part of the schedule page URL).

### What each piece does

- `PUT /actor-tasks/{id}/input` updates only the keys it sends, so the cookies survive a group
  sync. The key holding the URLs is read back from the task rather than hardcoded, because a
  wrong key name succeeds silently and keeps scraping the old list.
- The results cap is written to whichever key the saved task already carries
  (`resultsLimit`, `maxPosts`, …), read back from the task rather than guessed, and
  the screen prints the key it used. A guessed key writes a property nobody reads.
- Only the divisors of 24 are offered as intervals. `0 */5 * * *` is not "every 5 hours": it
  fires at 0, 5, 10, 15, 20 and then waits four.
- The webhook verifies the run against the Apify API before trusting the body, since Apify does
  not sign its requests and the route is otherwise open to anyone who guesses the URL.
- Posts are matched back to their group through `inputUrl`, the URL Apify was given. `groupId`
  cannot be used: a group saved as `/groups/1484099551860940` comes back as `/groups/<slug>/`.

### What actually survives the filter

Measured on 138 real posts from two Nouakchott groups: 93 had no text at all (reshares and
photo-only posts), 6 were a bare phone number or a row of emoji, 5 were cars or brokers, and
34 were property posts — 21 once reposts of the same ad were collapsed. A third of any run
carrying no text is normal for these groups, not a broken scraper.

The dictionary is Hassaniya, not MSA: rent is written `كراي`, an apartment is `برتماه`, a plot
is `نمرو` or `شانتية`. `supabase/apify-collection.sql` seeds it. Matching normalizes both the
post and the dictionary entry (alef forms, ta marbuta, tatweel, diacritics), so a single
spelling in the dictionary is enough.

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
