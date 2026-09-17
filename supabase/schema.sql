create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'source_status') then
    create type source_status as enum ('active', 'paused', 'error');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'keyword_type') then
    create type keyword_type as enum ('include', 'exclude', 'location');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type lead_status as enum ('new', 'comment_ready', 'contacted', 'duplicate', 'ignored');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'scan_status') then
    create type scan_status as enum ('started', 'completed', 'failed');
  end if;
end $$;

create table if not exists public.facebook_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null unique,
  facebook_group_id text,
  location text,
  status source_status not null default 'active',
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.keywords (
  id uuid primary key default gen_random_uuid(),
  value text not null,
  type keyword_type not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (value, type)
);

create table if not exists public.comment_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.facebook_leads (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.facebook_groups(id) on delete set null,
  post_url text not null unique,
  author_name text not null,
  author_profile_url text,
  post_text text not null,
  phone text,
  office_name text,
  price text,
  location text,
  confidence int not null default 0 check (confidence >= 0 and confidence <= 100),
  status lead_status not null default 'new',
  suggested_comment text,
  published_at timestamptz,
  first_seen_at timestamptz not null default now(),
  duplicate_hash text not null,
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists facebook_leads_duplicate_hash_idx on public.facebook_leads (duplicate_hash);
create index if not exists facebook_leads_phone_idx on public.facebook_leads (phone);
create index if not exists facebook_leads_status_idx on public.facebook_leads (status);
create index if not exists facebook_leads_first_seen_at_idx on public.facebook_leads (first_seen_at desc);

create table if not exists public.scan_runs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.facebook_groups(id) on delete cascade,
  status scan_status not null default 'started',
  checked_posts int not null default 0,
  matched_posts int not null default 0,
  extracted_phones int not null default 0,
  duplicates int not null default 0,
  new_leads int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.facebook_groups enable row level security;
alter table public.keywords enable row level security;
alter table public.comment_templates enable row level security;
alter table public.facebook_leads enable row level security;
alter table public.scan_runs enable row level security;

drop policy if exists "authenticated read facebook groups" on public.facebook_groups;
create policy "authenticated read facebook groups"
  on public.facebook_groups for select
  to authenticated
  using (true);

drop policy if exists "authenticated manage facebook groups" on public.facebook_groups;
create policy "authenticated manage facebook groups"
  on public.facebook_groups for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated manage keywords" on public.keywords;
create policy "authenticated manage keywords"
  on public.keywords for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated manage comment templates" on public.comment_templates;
create policy "authenticated manage comment templates"
  on public.comment_templates for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated manage facebook leads" on public.facebook_leads;
create policy "authenticated manage facebook leads"
  on public.facebook_leads for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated read scan runs" on public.scan_runs;
create policy "authenticated read scan runs"
  on public.scan_runs for select
  to authenticated
  using (true);

-- The keyword dictionary lives in supabase/apify-collection.sql. It is seeded
-- there, not here, because the terms are Hassaniya and were chosen against real
-- Nouakchott posts — the Gulf words this file used to seed matched almost none.

insert into public.comment_templates (title, body) values
  ('طلب تواصل مهذب', 'السلام عليكم، مهتمين بالتفاصيل. فضلا تواصل معنا على الخاص.'),
  ('طلب تفاصيل العقار', 'السلام عليكم، هل العقار ما زال متاحا؟ ممكن إرسال التفاصيل وطريقة التواصل؟'),
  ('عميل مناسب', 'السلام عليكم، لدينا طلب مناسب لهذا العقار. فضلا راسلنا بالتفاصيل.')
on conflict do nothing;
