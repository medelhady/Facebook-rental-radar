-- Lets one dashboard drive several Apify tasks instead of the single one
-- named in APIFY_TASK_ID. A task is one saved Apify configuration, which in
-- practice means one Facebook account's cookies and its own proxy session.
--
-- Run this after supabase/apify-collection.sql. It is safe to re-run.

create table if not exists public.apify_tasks (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  -- The Apify console writes this as user/task-name; the API wants
  -- user~task-name. Both are accepted and normalized in the app.
  task_id text not null unique,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

-- Each group is scraped by exactly one task. Two tasks on the same group cost
-- twice and gain nothing: the unique index on post_url drops the second copy.
alter table public.facebook_groups
  add column if not exists apify_task_id uuid references public.apify_tasks(id) on delete set null;

create index if not exists facebook_groups_apify_task_id_idx
  on public.facebook_groups (apify_task_id);

alter table public.apify_tasks enable row level security;

drop policy if exists "authenticated manage apify tasks" on public.apify_tasks;
create policy "authenticated manage apify tasks"
  on public.apify_tasks for all
  to authenticated
  using (true)
  with check (true);

-- Adopt the task that is currently in APIFY_TASK_ID so nothing is orphaned by
-- the switch. Replace the value below with your own before running, or add it
-- from the dashboard afterwards and leave this out.
insert into public.apify_tasks (label, task_id)
values ('الحساب الأول', 'medelhady2~facebook-post-scraper-task')
on conflict (task_id) do nothing;

-- Point every group that has no task yet at the first one, so the first sync
-- after this migration sends exactly what the old single-task sync sent.
update public.facebook_groups
set apify_task_id = (select id from public.apify_tasks order by created_at limit 1)
where apify_task_id is null;
