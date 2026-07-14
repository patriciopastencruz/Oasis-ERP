begin;

-- Cola auditable de correos transaccionales. La aplicación la procesa con la
-- service role después de que la solicitud y su notificación interna quedan
-- confirmadas. El correo nunca forma parte de la transacción comercial.
create table public.approval_email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  business_unit_id uuid,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null check (recipient_email = lower(recipient_email) and length(trim(recipient_email)) > 3),
  event_key text not null,
  subject text not null,
  body text not null,
  entity_type text not null,
  entity_id uuid not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  check ((status = 'sent' and sent_at is not null and provider_message_id is not null) or status <> 'sent')
);

create index approval_email_outbox_pending_idx
  on public.approval_email_outbox(next_attempt_at, created_at)
  where status in ('pending','failed') and attempts < 5;
create index approval_email_outbox_entity_idx
  on public.approval_email_outbox(entity_type, entity_id, created_at);

create trigger approval_email_outbox_updated_at
before update on public.approval_email_outbox
for each row execute function public.set_updated_at();

alter table public.approval_email_outbox enable row level security;
revoke all on public.approval_email_outbox from public, anon, authenticated;
grant select, insert, update on public.approval_email_outbox to service_role;

create or replace function public.enqueue_approval_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare destination text;
begin
  if new.entity_id is null or new.entity_type is null or not (
    new.event_key like '%.approval_assigned'
    or new.event_key like '%.review_assigned'
  ) then
    return new;
  end if;

  select lower(trim(p.email)) into destination
  from public.profiles p
  where p.id = new.recipient_id and p.active and p.deleted_at is null;

  if destination is null or destination = '' then return new; end if;

  insert into public.approval_email_outbox(
    notification_id, company_id, business_unit_id, recipient_id,
    recipient_email, event_key, subject, body, entity_type, entity_id
  ) values (
    new.id, new.company_id, new.business_unit_id, new.recipient_id,
    destination, new.event_key, new.title, new.body, new.entity_type, new.entity_id
  ) on conflict (notification_id) do nothing;
  return new;
end
$$;

create trigger enqueue_approval_notification_email
after insert on public.notifications
for each row execute function public.enqueue_approval_email();

revoke execute on function public.enqueue_approval_email() from public, anon, authenticated;

-- Reclamo atómico y concurrente de trabajos. Solo service_role puede llamar
-- esta función; usuarios autenticados nunca pueden leer correos ajenos.
create or replace function public.claim_approval_email_outbox(batch_size integer default 25)
returns setof public.approval_email_outbox
language sql
volatile
security invoker
set search_path = ''
as $$
  with candidates as (
    select o.id
    from public.approval_email_outbox o
    where o.attempts < 5
      and o.next_attempt_at <= now()
      and (
        o.status in ('pending','failed')
        or (o.status = 'sending' and o.last_attempt_at < now() - interval '15 minutes')
      )
    order by o.created_at
    for update skip locked
    limit least(greatest(batch_size, 1), 100)
  ), claimed as (
    update public.approval_email_outbox o
    set status = 'sending', attempts = o.attempts + 1,
        last_attempt_at = now(), last_error = null
    from candidates c
    where o.id = c.id
    returning o.*
  )
  select * from claimed
$$;

revoke execute on function public.claim_approval_email_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_approval_email_outbox(integer) to service_role;

-- Inventario todavía no generaba notificaciones internas al crear solicitudes.
create or replace function public.notify_inventory_approval_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications(
    company_id, business_unit_id, recipient_id, event_key, title, body,
    entity_type, entity_id, created_by
  )
  select new.company_id, new.business_unit_id, p.id,
    'inventory.approval_assigned', 'Aprobación de inventario pendiente',
    'La solicitud para ' || m.code || ' · ' || m.name || ' requiere revisión.',
    'inventory_change_request', new.id, new.requested_by
  from public.inventory_materials m
  join public.profiles p on p.active and p.deleted_at is null
  join public.user_business_units ubu on ubu.user_id = p.id
    and ubu.company_id = new.company_id and ubu.business_unit_id = new.business_unit_id
  where m.id = new.material_id
    and exists (
      select 1 from public.role_permissions rp
      join public.permissions permission on permission.id = rp.permission_id
      where rp.role_id = p.role_id
        and permission.key = 'inventory.approvals.decide' and permission.active
    )
    and not exists (
      select 1 from public.notifications n
      where n.recipient_id = p.id and n.entity_type = 'inventory_change_request'
        and n.entity_id = new.id and n.event_key = 'inventory.approval_assigned'
    );
  return new;
end
$$;

create trigger notify_inventory_approval_request_created
after insert on public.inventory_change_requests
for each row execute function public.notify_inventory_approval_request();

revoke execute on function public.notify_inventory_approval_request() from public, anon, authenticated;

-- Distribuidora tampoco generaba una notificación transversal para las
-- solicitudes de edición o anulación de pedidos.
create or replace function public.notify_distribution_approval_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications(
    company_id, business_unit_id, recipient_id, event_key, title, body,
    entity_type, entity_id, created_by
  )
  select new.company_id, new.business_unit_id, p.id,
    'distribution.approval_assigned', 'Solicitud de pedido pendiente',
    'La solicitud para el pedido ' || o.order_number || ' requiere revisión.',
    'dist_change_request', new.id, new.requested_by
  from public.dist_orders o
  join public.profiles p on p.active and p.deleted_at is null
  join public.user_business_units ubu on ubu.user_id = p.id
    and ubu.company_id = new.company_id and ubu.business_unit_id = new.business_unit_id
  where o.id = new.order_id
    and exists (
      select 1 from public.role_permissions rp
      join public.permissions permission on permission.id = rp.permission_id
      where rp.role_id = p.role_id
        and permission.key = 'finance.distribution.requests.review' and permission.active
    )
    and not exists (
      select 1 from public.notifications n
      where n.recipient_id = p.id and n.entity_type = 'dist_change_request'
        and n.entity_id = new.id and n.event_key = 'distribution.approval_assigned'
    );
  return new;
end
$$;

create trigger notify_distribution_approval_request_created
after insert on public.dist_change_requests
for each row execute function public.notify_distribution_approval_request();

revoke execute on function public.notify_distribution_approval_request() from public, anon, authenticated;

commit;
