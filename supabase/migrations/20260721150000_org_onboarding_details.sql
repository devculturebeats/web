-- Expand organization onboarding details (incharge, activities, place, contacts)

alter table public.organizations
  add column if not exists incharge_name text,
  add column if not exists activities text[] not null default '{}',
  add column if not exists place_id text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists contact_whatsapp text;

comment on column public.organizations.incharge_name is
  'Name of the institution incharge / primary admin contact.';
comment on column public.organizations.activities is
  'Arts activities offered (optional multi-select).';
comment on column public.organizations.place_id is
  'Google Places place_id for the institution location.';
comment on column public.organizations.latitude is
  'WGS84 latitude for the institution pin.';
comment on column public.organizations.longitude is
  'WGS84 longitude for the institution pin.';
comment on column public.organizations.contact_email is
  'Public / office email for the institution.';
comment on column public.organizations.contact_phone is
  'Public / office phone for the institution.';
comment on column public.organizations.contact_whatsapp is
  'Institution WhatsApp if different from contact phone.';

create index if not exists organizations_location_idx
  on public.organizations (latitude, longitude)
  where latitude is not null and longitude is not null;
