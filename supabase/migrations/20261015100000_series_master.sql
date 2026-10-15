-- Series master documents.
-- A series can hold ONE master set of Cost Sheet / Quotation / Itinerary, taken
-- as an independent snapshot from an existing query or tour file ("promote").
-- New queries in the series start from that snapshot as ordinary, fully
-- editable copies (never a live link), so each tour file keeps its own versions.
create table if not exists public.series_masters (
  series_id       uuid primary key references public.series(id) on delete cascade,
  source_query_id text,
  source_label    text,
  cost_sheet      jsonb,
  quotation       jsonb,
  itinerary       jsonb,
  promoted_by     text,
  promoted_at     timestamptz not null default now()
);
alter table public.series_masters enable row level security;
drop policy if exists "Staff full access" on public.series_masters;
create policy "Staff full access" on public.series_masters for all to authenticated using (true) with check (true);

-- Snapshot the FINAL version (else the latest) of each document of a query.
create or replace function public.promote_series_master(p_series uuid, p_query text, p_by text)
returns jsonb language plpgsql set search_path = public as $$
declare
  cs jsonb; qt jsonb; it jsonb; label text;
begin
  if not exists (select 1 from series where id = p_series and deleted_at is null) then
    return jsonb_build_object('success', false, 'error', 'Series not found');
  end if;
  select to_jsonb(t) - 'id' - 'query_id' - 'created_by' - 'created_at' - 'updated_at' into cs
    from (select * from cost_sheets where query_id = p_query order by is_final desc, version desc limit 1) t;
  select to_jsonb(t) - 'id' - 'query_id' - 'created_by' - 'created_at' - 'updated_at' - 'cost_sheet_id' into qt
    from (select * from quotations where query_id = p_query order by is_final desc, version desc limit 1) t;
  select to_jsonb(t) - 'id' - 'query_id' - 'created_by' - 'created_at' - 'updated_at' into it
    from (select * from itineraries where query_id = p_query order by is_final desc, version desc limit 1) t;
  if cs is null and qt is null and it is null then
    return jsonb_build_object('success', false, 'error', 'This file has no Cost Sheet, Quotation or Itinerary yet');
  end if;
  select coalesce(tour_file_id, id) into label from queries where id = p_query;
  insert into series_masters (series_id, source_query_id, source_label, cost_sheet, quotation, itinerary, promoted_by, promoted_at)
    values (p_series, p_query, label, cs, qt, it, p_by, now())
  on conflict (series_id) do update set source_query_id = excluded.source_query_id, source_label = excluded.source_label,
    cost_sheet = excluded.cost_sheet, quotation = excluded.quotation, itinerary = excluded.itinerary,
    promoted_by = excluded.promoted_by, promoted_at = now();
  return jsonb_build_object('success', true, 'source', label,
    'cost_sheet', cs is not null, 'quotation', qt is not null, 'itinerary', it is not null);
end $$;

-- Copy the master into a query as new, editable v1 documents. Never overwrites:
-- a document type the query already has is skipped.
create or replace function public.apply_series_master(p_series uuid, p_query text)
returns jsonb language plpgsql set search_path = public as $$
declare
  m series_masters%rowtype;
  new_cs uuid; copied text[] := '{}';
  note_txt text;
begin
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

revoke all on function public.promote_series_master(uuid, text, text) from public, anon;
revoke all on function public.apply_series_master(uuid, text) from public, anon;
grant execute on function public.promote_series_master(uuid, text, text) to authenticated;
grant execute on function public.apply_series_master(uuid, text) to authenticated;
