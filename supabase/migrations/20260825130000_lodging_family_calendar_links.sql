begin;

-- Link de solo lectura, sin login, para que un familiar (sin cuenta en el
-- ERP) pueda ver el calendario de reservas de una unidad desde el celular.
-- Mismo patrón de seguridad que lodging_rooms.export_token: un token
-- opaco de 64 hex en la URL en vez de autenticación, servido por una
-- página pública con el service role (ver api/ical/rooms para el
-- precedente). No se expone nada más sensible que lo que ya expone ese
-- endpoint iCal (fechas ocupadas); acá además se ve nombre del huésped,
-- hora de llegada y monto, así que el token debe tratarse como una
-- credencial y no compartirse fuera del círculo de confianza familiar.
create table public.lodging_family_calendar_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  business_unit_id uuid not null,
  token text not null unique check (token ~ '^[a-f0-9]{64}$'),
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_viewed_at timestamptz,
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id)
);

alter table public.lodging_family_calendar_links enable row level security;
revoke all on public.lodging_family_calendar_links from public, anon, authenticated;
grant select, update on public.lodging_family_calendar_links to service_role;

commit;
