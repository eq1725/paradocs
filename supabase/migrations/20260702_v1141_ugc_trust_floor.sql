-- V11.41 — UGC trust floor (APP_EXPERIENCE_PANEL_REVIEW.md P0-2).
-- Apple Guideline 1.2 requires: a mechanism to flag objectionable
-- content, a mechanism to block abusive users, and published
-- moderation. This migration adds the storage for both, plus the
-- age-attestation column for the 17+ gate.
--
-- Reversible / additive only. No data is deleted.

-- ---------------------------------------------------------------
-- 1. content_flags — user reports of objectionable content.
--    report_id covers reports; comment_id is included now so
--    comment flagging (same queue) needs no second migration.
-- ---------------------------------------------------------------
create table if not exists public.content_flags (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid references public.reports(id) on delete cascade,
  comment_id  uuid,
  flagged_by  uuid references auth.users(id) on delete set null,
  reason      text not null check (reason in
                ('inaccurate','offensive','personal_info','spam','harmful','other')),
  details     text,
  status      text not null default 'pending' check (status in
                ('pending','dismissed','actioned')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  constraint content_flags_target check (report_id is not null or comment_id is not null)
);

-- One flag per user per report (re-flagging is a no-op upsert).
create unique index if not exists content_flags_report_user_uniq
  on public.content_flags (report_id, flagged_by)
  where report_id is not null and flagged_by is not null;

create index if not exists content_flags_status_idx
  on public.content_flags (status, created_at desc);

alter table public.content_flags enable row level security;

do $$ begin
  create policy content_flags_insert_own on public.content_flags
    for insert to authenticated
    with check (flagged_by = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy content_flags_select_own on public.content_flags
    for select to authenticated
    using (flagged_by = auth.uid());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------
-- 2. user_blocks — viewer-level block of another contributor.
--    Applies to user-generated content (source_type =
--    'user_submission'); archive/ingested reports have no author.
-- ---------------------------------------------------------------
create table if not exists public.user_blocks (
  blocker_id      uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null,
  created_at      timestamptz not null default now(),
  primary key (blocker_id, blocked_user_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_user_id)
);

create index if not exists user_blocks_blocker_idx
  on public.user_blocks (blocker_id);

alter table public.user_blocks enable row level security;

do $$ begin
  create policy user_blocks_all_own on public.user_blocks
    for all to authenticated
    using (blocker_id = auth.uid())
    with check (blocker_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------
-- 3. Age attestation (17+ gate at submission).
-- ---------------------------------------------------------------
alter table public.profiles
  add column if not exists age_confirmed_at timestamptz;

-- ---------------------------------------------------------------
-- 4. Crisis screen marker — set by the submission API when the
--    crisis screen fires; used to prioritize human review. Kept as
--    a column (not metadata JSON) so the admin queue can index it.
-- ---------------------------------------------------------------
alter table public.reports
  add column if not exists crisis_screened boolean not null default false;

create index if not exists reports_crisis_screened_idx
  on public.reports (crisis_screened)
  where crisis_screened = true;
