-- Named folders for filing the ads worth acting on, so triage survives the
-- next run instead of living in someone's memory.
--
-- Run after supabase/apify-tasks.sql. Safe to re-run.

create table if not exists public.lead_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Many-to-many on purpose. The same ad is often both "متابعة اليوم" and
-- "عميل جاهز", and a single column would force a choice that loses one of them.
create table if not exists public.lead_folder_items (
  folder_id uuid not null references public.lead_folders(id) on delete cascade,
  lead_id uuid not null references public.facebook_leads(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (folder_id, lead_id)
);

create index if not exists lead_folder_items_lead_idx on public.lead_folder_items (lead_id);

alter table public.lead_folders enable row level security;
alter table public.lead_folder_items enable row level security;

drop policy if exists "authenticated manage lead folders" on public.lead_folders;
create policy "authenticated manage lead folders"
  on public.lead_folders for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated manage lead folder items" on public.lead_folder_items;
create policy "authenticated manage lead folder items"
  on public.lead_folder_items for all
  to authenticated
  using (true)
  with check (true);
