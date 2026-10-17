-- Alerts: fleet document reminder dates + per-person "last read" for discussion threads.
-- Safe to run more than once.

-- A reminder date on any fleet document (insurance, permit, fitness...). The alert
-- stays on (bell + dot on Fleet) from that date until someone turns it off.
alter table public.fleet_documents add column if not exists reminder_date date;
alter table public.fleet_documents add column if not exists reminder_note text;
alter table public.fleet_documents add column if not exists reminder_off  boolean not null default false;
create index if not exists fleet_documents_reminder_idx on public.fleet_documents(reminder_date) where reminder_date is not null;

-- Which discussion messages each person has seen (one row per person per tour file / query).
create table if not exists public.discussion_reads (
  staff_id     text not null,
  query_id     text not null,
  last_read_at timestamptz not null default now(),
  primary key (staff_id, query_id)
);
alter table public.discussion_reads enable row level security;
drop policy if exists "discussion_reads_app_access" on public.discussion_reads;
create policy "discussion_reads_app_access" on public.discussion_reads for all to anon, authenticated using (true) with check (true);
