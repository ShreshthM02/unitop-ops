-- Series Manager: master file pointer, series uploads, and series bookings.

alter table public.series add column if not exists master_query_id text;
alter table public.series add column if not exists drive_folder_id text;

-- ── Uploads that belong to the series itself (same shape as fleet_documents) ──
create table if not exists public.series_documents (
  id               uuid primary key default gen_random_uuid(),
  series_id        uuid not null references public.series(id) on delete cascade,
  drive_file_id    text,
  file_name        text,
  file_type        text,
  file_size        bigint,
  drive_view_link  text,
  uploaded_by      text,
  uploaded_by_name text,
  created_at       timestamptz not null default now(),
  remarks          text
);
create index if not exists series_documents_series_idx on public.series_documents(series_id);

-- ── Booking categories with editable status lists ──
-- statuses: [{ "name": "Confirmed", "kind": "done" }], kind = open | done | cancelled
create table if not exists public.series_booking_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order integer not null default 0,
  statuses   jsonb not null default '[]'::jsonb,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── One booking = one reference (PNR / confirmation / contract) ──
-- lines: what was blocked/bought, e.g. [{ "item": "Deluxe Double", "qty": 20 }]
create table if not exists public.series_bookings (
  id             uuid primary key default gen_random_uuid(),
  series_id      uuid not null references public.series(id) on delete cascade,
  category_id    uuid references public.series_booking_categories(id) on delete set null,
  title          text not null default '',
  vendor_id      text,
  vendor_name    text,
  reference      text,
  city           text,
  date_from      date,
  date_to        date,
  status         text,
  deadline_date  date,
  deadline_label text,
  lines          jsonb not null default '[]'::jsonb,
  notes          text,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists series_bookings_series_idx on public.series_bookings(series_id);

-- ── Which departure (tour file / query) uses how much of a booking ──
create table if not exists public.series_booking_allocations (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.series_bookings(id) on delete cascade,
  query_id   text references public.queries(id) on delete cascade,
  item       text,
  qty        integer not null default 0,
  date_from  date,
  date_to    date,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists series_alloc_booking_idx on public.series_booking_allocations(booking_id);
create index if not exists series_alloc_query_idx on public.series_booking_allocations(query_id);

-- ── Full history: who changed what, when ──
create table if not exists public.series_booking_history (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.series_bookings(id) on delete cascade,
  at          timestamptz not null default now(),
  by_name     text,
  kind        text,
  from_status text,
  to_status   text,
  note        text
);
create index if not exists series_hist_booking_idx on public.series_booking_history(booking_id);

do $$
declare t text;
begin
  foreach t in array array['series_documents','series_booking_categories','series_bookings','series_booking_allocations','series_booking_history'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format('create policy "Staff full access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

insert into public.series_booking_categories (name, sort_order, statuses)
select v.name, v.ord, v.statuses::jsonb from (values
  ('Hotel', 1, '[{"name":"Enquiry sent","kind":"open"},{"name":"Held (option)","kind":"open"},{"name":"Confirmed","kind":"done"},{"name":"Rooming list sent","kind":"done"},{"name":"Amended","kind":"open"},{"name":"Cancelled","kind":"cancelled"}]'),
  ('Flight', 2, '[{"name":"Enquiry","kind":"open"},{"name":"Held (ticketing deadline)","kind":"open"},{"name":"Ticketed","kind":"done"},{"name":"Changed","kind":"open"},{"name":"Cancelled","kind":"cancelled"}]'),
  ('Train', 3, '[{"name":"Enquiry","kind":"open"},{"name":"Waitlisted","kind":"open"},{"name":"Confirmed","kind":"done"},{"name":"Cancelled","kind":"cancelled"}]'),
  ('Transport', 4, '[{"name":"Enquiry","kind":"open"},{"name":"Quoted","kind":"open"},{"name":"Confirmed","kind":"done"},{"name":"Vehicle assigned","kind":"done"},{"name":"Cancelled","kind":"cancelled"}]'),
  ('Restaurant', 5, '[{"name":"Enquiry","kind":"open"},{"name":"Confirmed","kind":"done"},{"name":"Menu finalised","kind":"done"},{"name":"Cancelled","kind":"cancelled"}]'),
  ('Guide / Facilitator', 6, '[{"name":"Enquiry","kind":"open"},{"name":"Confirmed","kind":"done"},{"name":"Briefed","kind":"done"},{"name":"Cancelled","kind":"cancelled"}]'),
  ('Monument / Activity', 7, '[{"name":"Enquiry","kind":"open"},{"name":"Tickets booked","kind":"done"},{"name":"Confirmed","kind":"done"},{"name":"Cancelled","kind":"cancelled"}]'),
  ('Other', 8, '[{"name":"Enquiry","kind":"open"},{"name":"Confirmed","kind":"done"},{"name":"Cancelled","kind":"cancelled"}]')
) as v(name, ord, statuses)
where not exists (select 1 from public.series_booking_categories);

-- Starting a new file from the series now always uses the CURRENT documents of
-- the chosen master file (refreshed automatically), so nothing needs re-promoting.
create or replace function public.apply_series_master(p_series uuid, p_query text)
returns jsonb language plpgsql set search_path = public as $$
declare
  m series_masters%rowtype;
  mq text; by_txt text;
  new_cs uuid; copied text[] := '{}';
  note_txt text;
begin
  select master_query_id into mq from series where id = p_series;
  if mq is not null and mq <> p_query and exists (select 1 from queries where id = mq) then
    select coalesce(promoted_by, 'auto') into by_txt from series_masters where series_id = p_series;
    perform promote_series_master(p_series, mq, coalesce(by_txt, 'auto'));
  end if;
  select * into m from series_masters where series_id = p_series;
  if not found then
    return jsonb_build_object('success', false, 'error', 'This series has no master yet');
  end if;
  note_txt := 'Copied from series master (' || coalesce(m.source_label, '?') || ')';

  if m.cost_sheet is not null and not exists (select 1 from cost_sheets where query_id = p_query) then
    new_cs := gen_random_uuid();
    insert into cost_sheets
      select * from jsonb_populate_record(null::cost_sheets,
        m.cost_sheet || jsonb_build_object('id', new_cs, 'query_id', p_query, 'version', 1,
          'version_name', null, 'is_final', false, 'note', note_txt,
          'created_at', now(), 'updated_at', now()));
    copied := copied || 'cost_sheet';
  end if;
  if m.quotation is not null and not exists (select 1 from quotations where query_id = p_query) then
    insert into quotations
      select * from jsonb_populate_record(null::quotations,
        m.quotation || jsonb_build_object('id', gen_random_uuid(), 'query_id', p_query, 'cost_sheet_id', new_cs,
          'version', 1, 'version_name', null, 'is_final', false, 'note', note_txt,
          'confirmed_pax', null, 'tour_value', null, 'final_price_entries', '[]'::jsonb,
          'created_at', now(), 'updated_at', now()));
    copied := copied || 'quotation';
  end if;
  if m.itinerary is not null and not exists (select 1 from itineraries where query_id = p_query) then
    insert into itineraries
      select * from jsonb_populate_record(null::itineraries,
        m.itinerary || jsonb_build_object('id', gen_random_uuid(), 'query_id', p_query,
          'version', 1, 'is_final', false, 'note', note_txt,
          'created_at', now(), 'updated_at', now()));
    copied := copied || 'itinerary';
  end if;
  return jsonb_build_object('success', true, 'source', m.source_label, 'copied', to_jsonb(copied));
end $$;
