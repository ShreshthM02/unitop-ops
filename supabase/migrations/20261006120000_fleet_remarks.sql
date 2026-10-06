-- Fleet vehicle profile: rich-text Remarks. RUN THIS BEFORE deploying the
-- version that adds the Remarks editor. Safe to run more than once.
alter table public.fleet_vehicles add column if not exists remarks text;
-- Rollback (deletes all vehicle remarks): alter table public.fleet_vehicles drop column remarks;
