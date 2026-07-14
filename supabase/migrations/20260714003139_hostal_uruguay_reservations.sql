begin;

-- Unidad, permisos y roles del módulo.
insert into public.business_units(company_id, code, name)
select id, 'HU', 'Hostal Uruguay' from public.companies where code = 'OASIS'
on conflict (company_id, code) do update set name = excluded.name, active = true, deleted_at = null;

insert into public.user_business_units(user_id,company_id,business_unit_id)
select uc.user_id,bu.company_id,bu.id from public.business_units bu
join public.user_companies uc on uc.company_id=bu.company_id where bu.code='HU'
on conflict(user_id,business_unit_id) do nothing;

insert into public.roles(key, name, description, is_system) values
  ('receptionist', 'Recepcionista', 'Operación de reservas y recepción', true)
on conflict (key) do update set name = excluded.name, active = true;

insert into public.permissions(key,module,description) values
  ('lodging.reservations.view','lodging','Ver calendario y reservas'),
  ('lodging.reservations.manage','lodging','Crear y editar reservas'),
  ('lodging.payments.manage','lodging','Registrar pagos y comprobantes'),
  ('lodging.payments.void','lodging','Anular pagos'),
  ('lodging.rooms.manage','lodging','Administrar habitaciones'),
  ('lodging.ical.sync','lodging','Actualizar calendarios'),
  ('lodging.ical.configure','lodging','Configurar calendarios iCal'),
  ('lodging.audit.view','lodging','Ver detalles técnicos de sincronización')
on conflict (key) do update set description = excluded.description, active = true;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'superadmin' and p.module = 'lodging' on conflict do nothing;
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in
  ('lodging.reservations.view','lodging.reservations.manage','lodging.payments.manage','lodging.ical.sync')
where r.key = 'receptionist' on conflict do nothing;
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.module = 'lodging'
where r.key = 'administrator' on conflict do nothing;

create table public.lodging_rooms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  business_unit_id uuid not null,
  code text not null,
  name text not null,
  description text,
  capacity integer not null default 2 check (capacity > 0),
  base_rate numeric(14,2) not null default 0 check (base_rate >= 0),
  status text not null default 'available' check (status in ('available','occupied','cleaning','maintenance','out_of_service')),
  active boolean not null default true,
  display_order integer not null default 0,
  export_token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  export_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, code), unique (export_token),
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id)
);

create table public.lodging_guests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  business_unit_id uuid not null,
  full_name text not null,
  phone text not null,
  email text,
  document text,
  nationality text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id)
);

create table public.lodging_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  business_unit_id uuid not null,
  room_id uuid not null references public.lodging_rooms(id),
  guest_id uuid references public.lodging_guests(id),
  origin text not null check (origin in ('direct','whatsapp','company','booking','airbnb','other','maintenance')),
  status text not null default 'confirmed' check (status in ('pending','confirmed','checked_in','checked_out','cancelled','conflict','review_required')),
  check_in date not null,
  check_out date not null,
  estimated_arrival time,
  actual_check_in timestamptz,
  actual_check_out timestamptz,
  guest_count integer not null default 1 check (guest_count > 0),
  nightly_rate numeric(14,2) not null default 0 check (nightly_rate >= 0),
  nights integer generated always as (check_out - check_in) stored,
  discount numeric(14,2) not null default 0 check (discount >= 0),
  surcharge numeric(14,2) not null default 0 check (surcharge >= 0),
  total_value numeric(14,2) not null default 0 check (total_value >= 0),
  commission numeric(14,2) not null default 0 check (commission >= 0),
  company_name text,
  notes text,
  license_plate text,
  external_uid text,
  external_calendar_id uuid,
  external_source text,
  imported_from_ical boolean not null default false,
  raw_summary text,
  main_reservation_id uuid references public.lodging_reservations(id),
  stay_group_id uuid not null default gen_random_uuid(),
  relation_type text check (relation_type in ('extension','continuation','room_change','linked')),
  information_complete boolean not null default true,
  postpaid_company boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (check_out > check_in),
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  exclude using gist (room_id with =, daterange(check_in, check_out, '[)') with &&)
    where (status not in ('cancelled','conflict'))
);

create table public.lodging_reservation_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  business_unit_id uuid not null,
  reservation_id uuid not null references public.lodging_reservations(id),
  type text not null check (type in ('deposit','partial','total','check_in','check_out','guarantee','refund')),
  payment_method text not null check (payment_method in ('transfer','cash','card','booking','airbnb','company','other')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'CLP' check (currency = 'CLP'),
  paid_at timestamptz not null default now(),
  operation_number text,
  bank text,
  notes text,
  status text not null default 'confirmed' check (status in ('confirmed','pending','voided','refunded')),
  registered_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text,
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  check ((status <> 'voided') or (voided_at is not null and voided_by is not null and length(trim(void_reason)) >= 3))
);

create table public.lodging_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  business_unit_id uuid not null,
  payment_id uuid not null references public.lodging_reservation_payments(id),
  original_name text not null,
  internal_name text not null,
  private_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id)
);

create table public.lodging_ical_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  business_unit_id uuid not null,
  room_id uuid not null references public.lodging_rooms(id),
  provider text not null check (provider in ('booking','airbnb','other')),
  name text not null,
  import_url text not null,
  active boolean not null default true,
  interval_minutes integer not null default 15 check (interval_minutes between 5 and 1440),
  last_sync_at timestamptz,
  last_result text,
  last_error text,
  consecutive_failures integer not null default 0,
  sync_locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id)
);

alter table public.lodging_reservations add constraint lodging_reservations_external_calendar_fk
  foreign key (external_calendar_id) references public.lodging_ical_configs(id);

create table public.lodging_ical_events (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references public.lodging_ical_configs(id),
  room_id uuid not null references public.lodging_rooms(id),
  uid text not null,
  recurrence_id text not null default '',
  sequence integer,
  dtstamp timestamptz,
  starts_on date not null,
  ends_on date not null,
  summary text,
  status text,
  raw_hash text not null,
  last_seen_at timestamptz not null default now(),
  missing_since timestamptz,
  reservation_id uuid references public.lodging_reservations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(config_id, uid, recurrence_id)
);

create table public.lodging_sync_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  business_unit_id uuid not null,
  config_id uuid references public.lodging_ical_configs(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result text not null,
  events_read integer not null default 0,
  events_created integer not null default 0,
  events_updated integer not null default 0,
  conflicts_detected integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id)
);

create index lodging_rooms_unit_order_idx on public.lodging_rooms(business_unit_id, active, display_order);
create index lodging_reservations_calendar_idx on public.lodging_reservations(business_unit_id, check_in, check_out) where status <> 'cancelled';
create index lodging_reservations_arrivals_idx on public.lodging_reservations(business_unit_id, check_in, status);
create index lodging_reservations_departures_idx on public.lodging_reservations(business_unit_id, check_out, status);
create index lodging_payments_reservation_idx on public.lodging_reservation_payments(reservation_id, paid_at);
create index lodging_ical_events_seen_idx on public.lodging_ical_events(config_id, last_seen_at);
create index lodging_rooms_company_idx on public.lodging_rooms(company_id);
create index lodging_guests_unit_idx on public.lodging_guests(business_unit_id);
create index lodging_guests_company_idx on public.lodging_guests(company_id);
create index lodging_reservations_company_idx on public.lodging_reservations(company_id);
create index lodging_reservations_guest_idx on public.lodging_reservations(guest_id);
create index lodging_reservations_external_calendar_idx on public.lodging_reservations(external_calendar_id);
create index lodging_reservations_main_idx on public.lodging_reservations(main_reservation_id);
create index lodging_reservations_creator_idx on public.lodging_reservations(created_by);
create index lodging_payments_unit_idx on public.lodging_reservation_payments(business_unit_id);
create index lodging_payments_company_idx on public.lodging_reservation_payments(company_id);
create index lodging_payments_registered_by_idx on public.lodging_reservation_payments(registered_by);
create index lodging_payments_voided_by_idx on public.lodging_reservation_payments(voided_by);
create index lodging_receipts_unit_idx on public.lodging_payment_receipts(business_unit_id);
create index lodging_receipts_company_idx on public.lodging_payment_receipts(company_id);
create index lodging_receipts_payment_idx on public.lodging_payment_receipts(payment_id);
create index lodging_receipts_uploader_idx on public.lodging_payment_receipts(uploaded_by);
create index lodging_ical_configs_unit_idx on public.lodging_ical_configs(business_unit_id);
create index lodging_ical_configs_company_idx on public.lodging_ical_configs(company_id);
create index lodging_ical_configs_room_idx on public.lodging_ical_configs(room_id);
create index lodging_ical_events_room_idx on public.lodging_ical_events(room_id);
create index lodging_ical_events_reservation_idx on public.lodging_ical_events(reservation_id);
create index lodging_sync_logs_unit_idx on public.lodging_sync_logs(business_unit_id);
create index lodging_sync_logs_company_idx on public.lodging_sync_logs(company_id);
create index lodging_sync_logs_config_idx on public.lodging_sync_logs(config_id);

create trigger lodging_rooms_updated_at before update on public.lodging_rooms for each row execute function public.set_updated_at();
create trigger lodging_guests_updated_at before update on public.lodging_guests for each row execute function public.set_updated_at();
create trigger lodging_reservations_updated_at before update on public.lodging_reservations for each row execute function public.set_updated_at();
create trigger lodging_payments_updated_at before update on public.lodging_reservation_payments for each row execute function public.set_updated_at();
create trigger lodging_ical_configs_updated_at before update on public.lodging_ical_configs for each row execute function public.set_updated_at();
create trigger lodging_ical_events_updated_at before update on public.lodging_ical_events for each row execute function public.set_updated_at();

create or replace function public.lodging_payment_summary(target_reservation uuid)
returns table(total_paid numeric, balance numeric, payment_status text)
language sql stable security invoker set search_path = '' as $$
  with r as (select total_value from public.lodging_reservations where id = target_reservation),
  p as (select coalesce(sum(case when type = 'refund' then -amount else amount end),0) net,
       coalesce(sum(amount) filter(where type = 'refund'),0) refunds
       from public.lodging_reservation_payments where reservation_id = target_reservation and status = 'confirmed')
  select p.net, r.total_value-p.net,
    case when p.refunds > 0 and p.net = 0 then 'refunded'
         when p.refunds > 0 then 'partially_refunded'
         when p.net = 0 then 'pending' when p.net < r.total_value then 'partial'
         when p.net = r.total_value then 'paid' else 'overpaid' end from r cross join p
$$;

create or replace function public.create_lodging_reservation(payload jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare guest_uuid uuid; reservation_uuid uuid; room_record record; payment_amount numeric;
begin
  if not public.has_permission('lodging.reservations.manage') then raise exception 'Sin autorización'; end if;
  select company_id,business_unit_id,capacity,base_rate into strict room_record
  from public.lodging_rooms where id=(payload->>'room_id')::uuid and active;
  if not public.can_access_unit(room_record.company_id,room_record.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
  if (payload->>'guest_count')::integer > room_record.capacity then raise exception 'La cantidad de huéspedes supera la capacidad'; end if;
  insert into public.lodging_guests(company_id,business_unit_id,full_name,phone,email,document,notes)
  values(room_record.company_id,room_record.business_unit_id,trim(payload->>'guest_name'),trim(payload->>'phone'),nullif(trim(payload->>'email'),''),nullif(trim(payload->>'document'),''),nullif(trim(payload->>'guest_notes'),'')) returning id into guest_uuid;
  insert into public.lodging_reservations(company_id,business_unit_id,room_id,guest_id,origin,check_in,check_out,estimated_arrival,guest_count,nightly_rate,discount,surcharge,total_value,company_name,notes,license_plate,main_reservation_id,stay_group_id,relation_type,created_by)
  values(room_record.company_id,room_record.business_unit_id,(payload->>'room_id')::uuid,guest_uuid,payload->>'origin',(payload->>'check_in')::date,(payload->>'check_out')::date,nullif(payload->>'estimated_arrival','')::time,(payload->>'guest_count')::integer,(payload->>'nightly_rate')::numeric,coalesce((payload->>'discount')::numeric,0),coalesce((payload->>'surcharge')::numeric,0),(payload->>'total_value')::numeric,nullif(trim(payload->>'company_name'),''),nullif(trim(payload->>'notes'),''),nullif(trim(payload->>'license_plate'),''),nullif(payload->>'main_reservation_id','')::uuid,coalesce(nullif(payload->>'stay_group_id','')::uuid,gen_random_uuid()),nullif(payload->>'relation_type',''),auth.uid()) returning id into reservation_uuid;
  payment_amount := coalesce((payload->>'payment_amount')::numeric,0);
  if payment_amount > 0 then
    if not public.has_permission('lodging.payments.manage') then raise exception 'Sin autorización para pagos'; end if;
    insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,paid_at,operation_number,bank,notes,registered_by)
    values(room_record.company_id,room_record.business_unit_id,reservation_uuid,payload->>'payment_type',payload->>'payment_method',payment_amount,coalesce(nullif(payload->>'paid_at','')::timestamptz,now()),nullif(trim(payload->>'operation_number'),''),nullif(trim(payload->>'bank'),''),nullif(trim(payload->>'payment_notes'),''),auth.uid());
  end if;
  return reservation_uuid;
end $$;

-- Acceso por unidad y permisos persistidos. Las escrituras sensibles se validan también en servidor.
alter table public.lodging_rooms enable row level security;
alter table public.lodging_guests enable row level security;
alter table public.lodging_reservations enable row level security;
alter table public.lodging_reservation_payments enable row level security;
alter table public.lodging_payment_receipts enable row level security;
alter table public.lodging_ical_configs enable row level security;
alter table public.lodging_ical_events enable row level security;
alter table public.lodging_sync_logs enable row level security;

create policy lodging_rooms_read on public.lodging_rooms for select to authenticated using (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.view'));
create policy lodging_rooms_insert on public.lodging_rooms for insert to authenticated with check (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.rooms.manage'));
create policy lodging_rooms_update on public.lodging_rooms for update to authenticated using (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.rooms.manage')) with check (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.rooms.manage'));
create policy lodging_guests_access on public.lodging_guests for all to authenticated using (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.view')) with check (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.manage'));
create policy lodging_reservations_read on public.lodging_reservations for select to authenticated using (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.view'));
create policy lodging_reservations_insert on public.lodging_reservations for insert to authenticated with check (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.manage'));
create policy lodging_reservations_update on public.lodging_reservations for update to authenticated using (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.manage')) with check (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.manage'));
create policy lodging_payments_read on public.lodging_reservation_payments for select to authenticated using (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.view'));
create policy lodging_payments_insert on public.lodging_reservation_payments for insert to authenticated with check (registered_by=(select auth.uid()) and public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.payments.manage'));
create policy lodging_payments_void on public.lodging_reservation_payments for update to authenticated using (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.payments.void')) with check (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.payments.void'));
create policy lodging_receipts_read on public.lodging_payment_receipts for select to authenticated using (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.view'));
create policy lodging_receipts_insert on public.lodging_payment_receipts for insert to authenticated with check (uploaded_by=(select auth.uid()) and public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.payments.manage'));
create policy lodging_ical_configs_read on public.lodging_ical_configs for select to authenticated using (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.ical.sync'));
create policy lodging_ical_configs_insert on public.lodging_ical_configs for insert to authenticated with check (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.ical.configure'));
create policy lodging_ical_configs_update on public.lodging_ical_configs for update to authenticated using (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.ical.configure')) with check (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.ical.configure'));
create policy lodging_ical_events_read on public.lodging_ical_events for select to authenticated using (exists(select 1 from public.lodging_ical_configs c where c.id=config_id and public.can_access_unit(c.company_id,c.business_unit_id) and public.has_permission('lodging.ical.sync')));
create policy lodging_sync_logs_read on public.lodging_sync_logs for select to authenticated using (public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.audit.view'));

grant select,insert,update,delete on public.lodging_rooms, public.lodging_guests, public.lodging_reservations, public.lodging_reservation_payments, public.lodging_payment_receipts, public.lodging_ical_configs to authenticated, service_role;
grant select on public.lodging_ical_events, public.lodging_sync_logs to authenticated;
grant select,insert,update,delete on public.lodging_ical_events, public.lodging_sync_logs to service_role;
grant execute on function public.lodging_payment_summary(uuid) to authenticated, service_role;
grant execute on function public.create_lodging_reservation(jsonb) to authenticated;
revoke all on public.lodging_rooms, public.lodging_guests, public.lodging_reservations, public.lodging_reservation_payments, public.lodging_payment_receipts, public.lodging_ical_configs, public.lodging_ical_events, public.lodging_sync_logs from anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lodging-payment-receipts','lodging-payment-receipts',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy lodging_receipt_objects_insert on storage.objects for insert to authenticated
with check (bucket_id='lodging-payment-receipts' and public.has_permission('lodging.payments.manage') and exists(select 1 from public.user_business_units ubu where ubu.user_id=(select auth.uid()) and ubu.business_unit_id::text=(storage.foldername(name))[2]));
create policy lodging_receipt_objects_read on storage.objects for select to authenticated
using (bucket_id='lodging-payment-receipts' and public.has_permission('lodging.reservations.view') and exists(select 1 from public.user_business_units ubu where ubu.user_id=(select auth.uid()) and ubu.business_unit_id::text=(storage.foldername(name))[2]));

-- Cinco habitaciones iniciales, sin codificarlas en la interfaz.
insert into public.lodging_rooms(company_id,business_unit_id,code,name,capacity,base_rate,display_order)
select bu.company_id,bu.id,'P'||n,'Pieza '||n,2,35000,n
from public.business_units bu cross join generate_series(1,5) n where bu.code='HU'
on conflict(business_unit_id,code) do nothing;

commit;
