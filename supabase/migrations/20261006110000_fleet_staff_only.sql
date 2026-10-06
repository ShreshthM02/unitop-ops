-- Fleet tables: logged-in staff only, matching the vendors table
-- ("Staff full access", role authenticated). Replaces the open policy from
-- 20261006100000_fleet.sql. Safe to run more than once.
do $$
declare t text;
begin
  foreach t in array array['fleet_vehicles','fleet_service_history','fleet_expenses','fleet_documents'] loop
    execute format('drop policy if exists %I on public.%I', t||'_app_access', t);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='Staff full access') then
      execute format('create policy "Staff full access" on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;
