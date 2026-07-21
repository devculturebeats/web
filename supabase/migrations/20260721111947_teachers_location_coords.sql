-- Structured location pins for nearby teacher search

alter table public.teachers
  add column if not exists place_id text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

create index if not exists teachers_lat_lng_idx
  on public.teachers (latitude, longitude)
  where latitude is not null and longitude is not null;

comment on column public.teachers.place_id is
  'Google Places place_id for the teacher locality pin.';
comment on column public.teachers.latitude is
  'WGS84 latitude for nearby teacher search.';
comment on column public.teachers.longitude is
  'WGS84 longitude for nearby teacher search.';
