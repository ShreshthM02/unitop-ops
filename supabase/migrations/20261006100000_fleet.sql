-- Fleet (Master Data): our own vehicles + service history + expense ledger + documents.
-- RUN THIS BEFORE deploying v1.65.0 (and redeploy the drive-documents edge function).
-- Safe to run more than once.

create table if not exists public.fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner text,
  reg_no text,
  reg_date date,
  model text,
  colour text,
  capacity integer,
  drive_folder_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.fleet_service_history (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
  tour_file_no text,
  start_date date,
  end_date date,
  sector text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.fleet_expenses (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
  expense_date date,
  particulars text,
  amount numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.fleet_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
  drive_file_id text not null,
  file_name text not null,
  file_type text,
  file_size bigint,
  drive_view_link text,
  uploaded_by text,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists fleet_service_history_vehicle_idx on public.fleet_service_history(vehicle_id);
create index if not exists fleet_expenses_vehicle_idx on public.fleet_expenses(vehicle_id);
create index if not exists fleet_documents_vehicle_idx on public.fleet_documents(vehicle_id);

-- The app talks to Supabase with its own key and does its permission checks
-- in the UI, so these tables get the same open policy the other master-data
-- tables use. (fleet_documents rows are written by the edge function with
-- the service role; the app only reads/deletes them.)
alter table public.fleet_vehicles enable row level security;
alter table public.fleet_service_history enable row level security;
alter table public.fleet_expenses enable row level security;
alter table public.fleet_documents enable row level security;

do $$
declare t text;
begin
  foreach t in array array['fleet_vehicles','fleet_service_history','fleet_expenses','fleet_documents'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_app_access') then
      execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true)', t||'_app_access', t);
    end if;
  end loop;
end $$;

-- Rollback (deletes all fleet data):
-- drop table public.fleet_documents, public.fleet_expenses, public.fleet_service_history, public.fleet_vehicles;
