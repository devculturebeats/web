-- Teacher contact + residential vs teaching location

alter table public.profiles
  add column if not exists whatsapp text;

alter table public.teachers
  add column if not exists residential_city text,
  add column if not exists residential_address text;

comment on column public.profiles.whatsapp is
  'WhatsApp number; may match phone or be separate.';
comment on column public.teachers.residential_city is
  'City where the teacher lives (Mangalore / Udupi).';
comment on column public.teachers.residential_address is
  'Full residential address.';
comment on column public.teachers.city is
  'Preferred teaching city used for matching filters.';
