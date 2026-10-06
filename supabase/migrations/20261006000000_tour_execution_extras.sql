-- Tour Info restructure (v1.64.0): hotel + meal rows, other services,
-- structured arrival/departure legs and the "synced from quotation vN"
-- marker all live in ONE new jsonb column. Purely additive: existing rows
-- get '{}' and keep working (the app treats a missing key as "never used the
-- new tabs", so old per-day hotel/rooms still show).
--
-- RUN THIS BEFORE deploying v1.64.0. Until the column exists, saving Tour
-- Info fails (the app now shows an error toast instead of failing silently).
--
-- Rollback, if ever needed:
--   alter table public.tour_execution drop column if exists extras;
alter table public.tour_execution
  add column if not exists extras jsonb not null default '{}'::jsonb;
