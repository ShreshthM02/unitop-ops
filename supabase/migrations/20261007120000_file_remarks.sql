-- Optional rich-text remark on each uploaded file (tour-file uploads and
-- vehicle documents). RUN THIS, then redeploy the drive-documents edge
-- function (it gains a "set-remarks" action). Safe to run more than once.
alter table public.query_documents add column if not exists remarks text;
alter table public.fleet_documents add column if not exists remarks text;
-- Rollback (deletes all file remarks):
--   alter table public.query_documents drop column remarks;
--   alter table public.fleet_documents drop column remarks;
