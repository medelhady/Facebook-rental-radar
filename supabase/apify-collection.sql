-- Adds the Apify collection layer to an existing radar database.
-- Run STEP 1 and STEP 2 as two separate queries: Postgres refuses to use a new
-- enum value in the same transaction that created it.

-- ============ STEP 1 — schema ============

alter type keyword_type add value if not exists 'rent';
alter type keyword_type add value if not exists 'sale';

alter table public.facebook_leads
  add column if not exists offer_type text not null default 'unknown';

alter table public.facebook_leads
  drop constraint if exists facebook_leads_offer_type_check;
alter table public.facebook_leads
  add constraint facebook_leads_offer_type_check
  check (offer_type in ('rent', 'sale', 'unknown'));

-- One row, always. Holds how often Apify should run and which Apify objects
-- this dashboard drives.
create table if not exists public.schedule_settings (
  id int primary key default 1,
  interval_hours int not null default 6,
  apify_schedule_id text,
  apify_task_id text,
  updated_at timestamptz not null default now(),
  constraint schedule_settings_singleton check (id = 1),
  -- "0 */5 * * *" fires at 0,5,10,15,20 and then waits 4 hours, so only the
  -- divisors of 24 are allowed.
  constraint schedule_settings_interval check (interval_hours in (1, 2, 3, 4, 6, 8, 12, 24))
);

insert into public.schedule_settings (id, interval_hours) values (1, 6)
on conflict (id) do nothing;

alter table public.schedule_settings enable row level security;

drop policy if exists "authenticated manage schedule settings" on public.schedule_settings;
create policy "authenticated manage schedule settings"
  on public.schedule_settings for all
  to authenticated
  using (true)
  with check (true);

-- ============ STEP 2 — the Nouakchott dictionary ============
-- Run this only after STEP 1 has finished.
-- Measured against 138 real posts from two Nouakchott groups on 2026-09-17:
-- these terms are Hassaniya, and the Gulf words that shipped with the first
-- schema matched almost nothing.

-- Clear the Gulf seeds and any earlier copy of the terms below, so the file
-- can be re-run and every word lands in its current category.
delete from public.keywords
where value in (
  'النرجس','الياسمين','السلامة','شقة','فيلا','غرفة','للايجار','للإيجار','تم التأجير','بيع',
  'كراي','كريه','للكراي','كراء','إيجار','مفروش','شهري','شهريا',
  'للبيع','بنباع','ابيع','يبيع','نبيع','شاري',
  'برتماه','استديوه','ديبلكس','نمرو','نيمرو','شانتية','دار','منزل','بيت','دوش','أرض','محل',
  'مستودع','بوتيك','كوزين','صكوك','تيتر فونصيي','كونفورم','امتير','سانتر امتير','مساحة',
  'انسول عن','إندور','يدور','عندي طلب','نبحث عن','فرصة',
  'سيارة','مستعمل','كابين','هلكس','راف كات','كورولا','corolla','اوتوماتيك','اصانص','ترقيم',
  'زواج','دلال','الخيمة','جهاز طبي','ضغط الدم',
  'تفرغ زينة','تفرغ زين','عين الطلح','المقطع','المقطه','سيتي بلاج','كسوفو','دار النعيم',
  'توجونين','عرفات','لكصر','السبخة','الميناء','تيارت','الرياض','دايه','الدايه','كدروه'
);

insert into public.keywords (value, type) values
  -- rent: only words that actually decide rent-vs-sale
  ('كراي','rent'), ('كريه','rent'), ('للكراي','rent'), ('كراء','rent'),
  ('إيجار','rent'), ('مفروش','rent'), ('شهري','rent'), ('شهريا','rent'),

  -- sale: bare "بيع" is left out on purpose — it hides inside "أسابيع"
  ('للبيع','sale'), ('بنباع','sale'), ('ابيع','sale'), ('يبيع','sale'),
  ('نبيع','sale'), ('شاري','sale'),

  -- include: what makes a post a property post at all, offer or request
  ('برتماه','include'), ('استديوه','include'), ('ديبلكس','include'),
  ('نمرو','include'), ('نيمرو','include'), ('شانتية','include'),
  ('دار','include'), ('منزل','include'), ('بيت','include'), ('دوش','include'),
  ('أرض','include'), ('محل','include'), ('مستودع','include'), ('بوتيك','include'),
  ('كوزين','include'), ('صكوك','include'), ('تيتر فونصيي','include'),
  ('كونفورم','include'), ('امتير','include'), ('سانتر امتير','include'),
  ('مساحة','include'), ('انسول عن','include'), ('إندور','include'), ('يدور','include'),
  ('عندي طلب','include'), ('نبحث عن','include'), ('فرصة','include'),

  -- exclude: the cars, brokers and gadgets that share these groups
  ('سيارة','exclude'), ('مستعمل','exclude'), ('كابين','exclude'), ('هلكس','exclude'),
  ('راف كات','exclude'), ('كورولا','exclude'), ('corolla','exclude'),
  ('اوتوماتيك','exclude'), ('اصانص','exclude'), ('ترقيم','exclude'),
  ('زواج','exclude'), ('دلال','exclude'), ('الخيمة','exclude'),
  ('جهاز طبي','exclude'), ('ضغط الدم','exclude'),

  -- location: Nouakchott, not Riyadh
  ('تفرغ زينة','location'), ('تفرغ زين','location'), ('عين الطلح','location'),
  ('المقطع','location'), ('المقطه','location'), ('سيتي بلاج','location'),
  ('كسوفو','location'), ('دار النعيم','location'), ('توجونين','location'),
  ('عرفات','location'), ('لكصر','location'), ('السبخة','location'),
  ('الميناء','location'), ('تيارت','location'), ('الرياض','location'),
  ('الدايه','location'), ('كدروه','location')
on conflict (value, type) do nothing;
