begin;

-- Permite que huéspedes anónimos generen una solicitud de reserva desde la
-- web pública (sin login). Se distingue de las reservas creadas por staff
-- vía origin='public_web'; el estado sigue usando 'pending' (ya existente).
-- El exclusion constraint de lodging_reservations ya excluye solamente
-- ('cancelled','conflict'), así que una solicitud 'pending' retiene la
-- fecha automáticamente, incluso ante solicitudes simultáneas.
do $$
declare
  origin_constraint_name text;
begin
  select conname into origin_constraint_name
  from pg_constraint
  where conrelid = 'public.lodging_reservations'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%origin%';
  if origin_constraint_name is not null then
    execute format('alter table public.lodging_reservations drop constraint %I', origin_constraint_name);
  end if;
end $$;

alter table public.lodging_reservations
  add constraint lodging_reservations_origin_check
  check (origin in ('direct','whatsapp','company','booking','airbnb','other','maintenance','public_web'));

-- Trazabilidad de la revisión de staff sobre una solicitud web: quién y
-- cuándo la confirmó o rechazó. Es el reemplazo de created_by/registered_by
-- para el actor real cuando el origen es un huésped anónimo.
alter table public.lodging_reservations
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz;

create index if not exists lodging_reservations_public_pending_idx
  on public.lodging_reservations(business_unit_id, created_at)
  where origin = 'public_web' and status = 'pending';

-- Un huésped anónimo no tiene auth.users; estas columnas quedan en null para
-- filas creadas por la solicitud pública. La responsabilidad de staff se
-- captura en lodging_reservations.reviewed_by al confirmar/rechazar.
alter table public.lodging_reservation_payments
  alter column registered_by drop not null;

alter table public.lodging_payment_receipts
  alter column uploaded_by drop not null;

-- Notifica a quienes pueden gestionar reservas de la unidad cuando llega una
-- solicitud pública nueva. event_key termina en '.review_assigned', lo que
-- ya hace que enqueue_approval_email() (definida en
-- 20260714134220_approval_email_notifications.sql) encole el correo
-- automáticamente sin tocar esa función.
create or replace function public.notify_lodging_public_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.origin <> 'public_web' then
    return new;
  end if;

  insert into public.notifications(
    company_id, business_unit_id, recipient_id, event_key, title, body,
    entity_type, entity_id, created_by
  )
  select new.company_id, new.business_unit_id, p.id,
    'lodging.review_assigned', 'Nueva solicitud de reserva web',
    'Llegó una solicitud de reserva desde el sitio web para revisar y confirmar.',
    'lodging_reservation', new.id, null
  from public.profiles p
  join public.user_business_units ubu on ubu.user_id = p.id
    and ubu.company_id = new.company_id and ubu.business_unit_id = new.business_unit_id
  where p.active and p.deleted_at is null
    and exists (
      select 1 from public.role_permissions rp
      join public.permissions permission on permission.id = rp.permission_id
      where rp.role_id = p.role_id
        and permission.key = 'lodging.reservations.manage' and permission.active
    )
    and not exists (
      select 1 from public.notifications n
      where n.recipient_id = p.id and n.entity_type = 'lodging_reservation'
        and n.entity_id = new.id and n.event_key = 'lodging.review_assigned'
    );
  return new;
end
$$;

create trigger notify_lodging_public_request_created
after insert on public.lodging_reservations
for each row execute function public.notify_lodging_public_request();

revoke execute on function public.notify_lodging_public_request() from public, anon, authenticated;

-- Confirma o rechaza una solicitud web en una sola transacción (reserva +
-- pago). La única política UPDATE existente sobre lodging_reservation_payments
-- exige 'lodging.payments.void', que no corresponde semánticamente a esta
-- acción de revisión; en vez de agregar una política UPDATE nueva (que no
-- puede restringir qué columnas cambian), se sigue el mismo patrón que
-- create_lodging_reservation: función security definer, invocada por un
-- usuario autenticado, que verifica el permiso explícitamente por dentro.
create or replace function public.review_lodging_public_request(
  target_reservation uuid,
  approve boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if not public.has_permission('lodging.reservations.manage') then
    raise exception 'Sin autorización';
  end if;

  select company_id, business_unit_id, status, origin
    into r
  from public.lodging_reservations
  where id = target_reservation
  for update;

  if not found then
    raise exception 'Solicitud no encontrada';
  end if;
  if not public.can_access_unit(r.company_id, r.business_unit_id) then
    raise exception 'Sin autorización';
  end if;
  if r.origin <> 'public_web' or r.status <> 'pending' then
    raise exception 'Esta solicitud ya no está pendiente';
  end if;

  update public.lodging_reservations
  set status = case when approve then 'confirmed' else 'cancelled' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      cancelled_at = case when approve then null else now() end
  where id = target_reservation;

  if approve then
    update public.lodging_reservation_payments
    set status = 'confirmed'
    where reservation_id = target_reservation and status = 'pending';
  end if;
end
$$;

grant execute on function public.review_lodging_public_request(uuid, boolean) to authenticated;
revoke execute on function public.review_lodging_public_request(uuid, boolean) from public, anon;

commit;
