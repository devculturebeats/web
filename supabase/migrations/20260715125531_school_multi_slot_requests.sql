-- Allow school class requests to propose multiple weekly slots
-- (different days / times), not only a single proposed_* triplet.

alter table public.classes
  add column if not exists proposed_slots jsonb;

alter table public.class_requests
  add column if not exists proposed_slots jsonb;

comment on column public.classes.proposed_slots is
  'JSON array of {day:0-6,start:HH:MM:SS,end:HH:MM:SS}. proposed_day_of_week/start/end keep the first slot for backwards compatibility.';

comment on column public.class_requests.proposed_slots is
  'JSON array of {day:0-6,start:HH:MM:SS,end:HH:MM:SS} for this request.';
