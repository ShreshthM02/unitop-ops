-- Series bookings, simplified: a series keeps a list of vendor bookings, and each
-- entry inside one IS a Service Status row of a tour file (same record, so the
-- series screen and the tour file can never disagree). Safe to run more than once.

-- One vendor group inside a series (the "new booking" you open by picking a vendor).
create table if not exists public.series_vendor_bookings (
  id          uuid primary key default gen_random_uuid(),
  series_id   uuid not null references public.series(id) on delete cascade,
  vendor_id   text,
  vendor_name text not null default '',
  vendor_type text,
  created_by  text,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists series_vendor_bookings_series_idx on public.series_vendor_bookings(series_id);

-- Tour-file services can now be backed by a series entry.
-- query_id becomes optional so an entry can be saved before a file is chosen
-- (such rows are only visible from the series, never inside a tour file).
alter table public.query_services alter column query_id drop not null;
alter table public.query_services add column if not exists series_id       uuid references public.series(id) on delete cascade;
alter table public.query_services add column if not exists svb_id          uuid references public.series_vendor_bookings(id) on delete cascade;
alter table public.query_services add column if not exists title           text;
alter table public.query_services add column if not exists date_to         date;
alter table public.query_services add column if not exists reservation_no  text;
alter table public.query_services add column if not exists rates           text;
alter table public.query_services add column if not exists remarks_html    text;
create index if not exists query_services_series_idx on public.query_services(series_id);
create index if not exists query_services_svb_idx on public.query_services(svb_id);

alter table public.series_vendor_bookings enable row level security;
drop policy if exists "Staff full access" on public.series_vendor_bookings;
create policy "Staff full access" on public.series_vendor_bookings for all to authenticated using (true) with check (true);
