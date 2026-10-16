-- Series bookings v2: per-departure rows, correspondence log, rates & budget,
-- "whose turn is it" tracking, and the vendor's waitlist-clearing rule.
-- Safe to run more than once.

alter table public.series_bookings add column if not exists waitlist_days   integer;      -- vendor clears waitlist N days before arrival
alter table public.series_bookings add column if not exists rates           jsonb not null default '[]'::jsonb;  -- [{label,budget,quoted}]
alter table public.series_bookings add column if not exists awaiting        text;         -- '' | 'vendor' | 'us'
alter table public.series_bookings add column if not exists follow_up_date  date;
alter table public.series_bookings add column if not exists last_contact_on date;

-- ── One row per departure / date / segment inside a booking ──
create table if not exists public.series_booking_rows (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.series_bookings(id) on delete cascade,
  query_id        text references public.queries(id) on delete set null,
  label           text,                 -- e.g. "Tour 3412", "Del–Bom 6E-123"
  date_from       date,
  date_to         date,
  plan            text,                 -- meal plan / fare class
  detail          text,                 -- e.g. "38 twin + 2 single"
  foc             text,                 -- e.g. "3 rooms on plan"
  status          text,
  confirmation_no text,
  deadline_date   date,
  deadline_label  text,
  notes           text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists series_rows_booking_idx on public.series_booking_rows(booking_id);
create index if not exists series_rows_query_idx on public.series_booking_rows(query_id);

-- ── Correspondence log: what was said to/by the vendor, and what it touched ──
create table if not exists public.series_booking_correspondence (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.series_bookings(id) on delete cascade,
  occurred_on date not null default current_date,
  direction   text not null default 'in',   -- 'in' (from vendor) | 'out' (to vendor) | 'call'
  contact     text,
  subject     text,
  summary     text,
  row_ids     jsonb not null default '[]'::jsonb,
  by_name     text,
  created_at  timestamptz not null default now()
);
create index if not exists series_corr_booking_idx on public.series_booking_correspondence(booking_id);

-- History can now point at a single row.
alter table public.series_booking_history add column if not exists row_id uuid;

do $$
declare t text;
begin
  foreach t in array array['series_booking_rows','series_booking_correspondence'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format('create policy "Staff full access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Hotel / Flight status lists learn the words vendors actually use.
-- Only adds names that are missing; anything you edited is left alone.
update public.series_booking_categories c
set statuses = c.statuses || (
  select coalesce(jsonb_agg(n), '[]'::jsonb) from jsonb_array_elements(
    '[{"name":"Waitlisted","kind":"open"},{"name":"Sold out","kind":"open"},{"name":"Alternative offered","kind":"open"},{"name":"Reconfirmed","kind":"done"},{"name":"Release requested","kind":"open"}]'::jsonb) n
  where not exists (select 1 from jsonb_array_elements(c.statuses) s where s->>'name' = n->>'name'))
where c.name = 'Hotel';

update public.series_booking_categories c
set statuses = c.statuses || (
  select coalesce(jsonb_agg(n), '[]'::jsonb) from jsonb_array_elements(
    '[{"name":"Waitlisted","kind":"open"},{"name":"Name list sent","kind":"open"}]'::jsonb) n
  where not exists (select 1 from jsonb_array_elements(c.statuses) s where s->>'name' = n->>'name'))
where c.name = 'Flight';
