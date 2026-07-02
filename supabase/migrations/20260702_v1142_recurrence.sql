-- V11.42 — recurrence capture (APP_EXPERIENCE_PANEL_REVIEW.md,
-- founder addition 2026-07-02). Many experiences are recurring
-- (hauntings, sleep paralysis, repeated sightings); the single-event
-- date frame was lossy. event_date remains "the first time";
-- recurrence marks whether it kept happening. last_occurred_at is
-- reserved for the "It happened again" update feature.
--
-- Additive only.

alter table public.reports
  add column if not exists recurrence text
    check (recurrence in ('once','multiple','ongoing'));

alter table public.reports
  add column if not exists last_occurred_at date;

create index if not exists reports_recurrence_idx
  on public.reports (recurrence)
  where recurrence is not null;
