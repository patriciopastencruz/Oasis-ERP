begin;

-- Cierre diario de hostales (HOC/HU). Los indicadores se calculan en
-- PostgreSQL desde las reservas y los pagos efectivamente recibidos ese día
-- (zona America/Santiago); recepción solo agrega gastos y observaciones.
-- Cada cierre guarda una foto de sus indicadores para reportes semanales,
-- quincenales y mensuales. Recepción puede cerrar hoy o el día anterior;
-- fechas más antiguas o editar un cierre emitido requiere permiso de gestión.

-- Tipo de habitación para agrupar la venta promedio (Modulares, Departamento…).
alter table public.lodging_rooms add column room_type text not null default 'Habitación'
 check(char_length(btrim(room_type)) between 2 and 60);
update public.lodging_rooms r set room_type=case
  when r.code like 'MOD%' then 'Modulares'
  when r.code like 'DEP%' then 'Departamento'
  when r.code like 'PZ%' then 'Habitación baño compartido'
  else 'Habitación' end
from public.business_units bu where bu.id=r.business_unit_id and bu.code='HOC';

insert into public.permissions(key,module,description) values
 ('lodging.closings.create','lodging','Preparar, emitir y compartir el cierre diario del hostal'),
 ('lodging.closings.reports','lodging','Ver historial y reportes semanales, quincenales y mensuales de cierres'),
 ('lodging.closings.manage','lodging','Cerrar fechas antiguas y corregir cierres ya emitidos')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where (p.key='lodging.closings.create' and r.key in('receptionist','administrator','superadmin'))
   or (p.key='lodging.closings.reports' and r.key in('administrator','superadmin','general_manager','finance_manager'))
   or (p.key='lodging.closings.manage' and r.key in('administrator','superadmin'))
on conflict do nothing;

create table public.lodging_daily_closings(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 closing_date date not null,
 status text not null default 'draft' check(status in('draft','issued')),
 metrics jsonb not null default '{}'::jsonb,
 total_rooms integer not null default 0,
 occupied_rooms integer not null default 0,
 occupancy_pct numeric(5,2) not null default 0,
 average_rate numeric(14,0) not null default 0,
 cash_received numeric(14,0) not null default 0,
 transfer_received numeric(14,0) not null default 0,
 card_received numeric(14,0) not null default 0,
 airbnb_received numeric(14,0) not null default 0,
 other_received numeric(14,0) not null default 0,
 total_received numeric(14,0) not null default 0,
 pending_amount numeric(14,0) not null default 0,
 expense_total numeric(14,0) not null default 0,
 net_result numeric(14,0) not null default 0,
 reported_problems text check(reported_problems is null or char_length(reported_problems)<=2000),
 items_to_replenish text check(items_to_replenish is null or char_length(items_to_replenish)<=2000),
 observations text check(observations is null or char_length(observations)<=4000),
 version integer not null default 0,
 issued_at timestamptz,issued_by uuid references public.profiles(id),
 email_sent_at timestamptz,email_recipients text[],
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),updated_by uuid references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(business_unit_id,closing_date),
 check(status<>'issued' or issued_at is not null)
);
create index lodging_daily_closings_unit_date_idx on public.lodging_daily_closings(company_id,business_unit_id,closing_date desc);

create table public.lodging_daily_closing_expenses(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 closing_id uuid not null references public.lodging_daily_closings(id),
 description text not null check(char_length(btrim(description)) between 2 and 200),
 amount numeric(14,0) not null check(amount>0),
 payment_method text not null default 'cash' check(payment_method in('cash','transfer','card','other')),
 created_at timestamptz not null default now(),created_by uuid not null references public.profiles(id),
 deleted_at timestamptz,deleted_by uuid references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lodging_daily_closing_expenses_closing_idx on public.lodging_daily_closing_expenses(closing_id) where deleted_at is null;
create index lodging_daily_closing_expenses_unit_idx on public.lodging_daily_closing_expenses(company_id,business_unit_id);

create trigger lodging_daily_closings_updated_at before update on public.lodging_daily_closings for each row execute function public.set_updated_at();
create trigger audit_lodging_daily_closings after insert or update or delete on public.lodging_daily_closings for each row execute function public.audit_row_change();
create trigger audit_lodging_daily_closing_expenses after insert or update or delete on public.lodging_daily_closing_expenses for each row execute function public.audit_row_change();

-- Indicadores del día sin validar al usuario (uso interno de las funciones).
create or replace function public.lodging_closing_metrics_internal(target_unit uuid,target_date date) returns jsonb language sql stable security definer set search_path='' as $$
 with rooms as (
  select r.id,r.name,btrim(r.room_type) as room_type,r.display_order from public.lodging_rooms r
  where r.business_unit_id=target_unit and r.active and r.status not in('out_of_service','maintenance')
 ), stays as (
  select s.*,rm.room_type from public.lodging_reservations s join rooms rm on rm.id=s.room_id
  where s.business_unit_id=target_unit and s.status not in('cancelled','conflict') and s.origin<>'maintenance'
   and s.check_in<=target_date and s.check_out>target_date
 ), day_payments as (
  select p.*,case when p.type='refund' then -p.amount else p.amount end as net_amount
  from public.lodging_reservation_payments p
  where p.business_unit_id=target_unit and p.status='confirmed'
   and (p.paid_at at time zone 'America/Santiago')::date=target_date
 ), paid as (
  select p.reservation_id,sum(case when p.type='refund' then -p.amount else p.amount end) as amount
  from public.lodging_reservation_payments p where p.business_unit_id=target_unit and p.status='confirmed' group by 1
 ), pending as (
  select s.id,rm.name as room_name,g.full_name as guest_name,s.check_in,s.check_out,s.total_value,
   coalesce(pd.amount,0) as paid,s.total_value-coalesce(pd.amount,0) as balance,s.postpaid_company
  from public.lodging_reservations s join public.lodging_rooms rm on rm.id=s.room_id
  left join public.lodging_guests g on g.id=s.guest_id left join paid pd on pd.reservation_id=s.id
  where s.business_unit_id=target_unit and s.status not in('cancelled','conflict') and s.origin<>'maintenance'
   and s.check_in<=target_date and s.check_out>=target_date and s.total_value-coalesce(pd.amount,0)>0
 ), counts as (
  select (select count(*) from rooms)::int as total_rooms,
   (select count(distinct room_id) from stays)::int as occupied_rooms,
   coalesce((select sum(total_value/nullif(nights,0)) from stays),0) as day_revenue
 )
 select jsonb_build_object(
  'date',target_date,
  'total_rooms',c.total_rooms,
  'occupied_rooms',c.occupied_rooms,
  'available_rooms',greatest(c.total_rooms-c.occupied_rooms,0),
  'occupancy_pct',case when c.total_rooms>0 then round(c.occupied_rooms*100.0/c.total_rooms,2) else 0 end,
  'day_revenue',round(c.day_revenue),
  'average_rate',case when c.occupied_rooms>0 then round(c.day_revenue/c.occupied_rooms) else 0 end,
  'guests',coalesce((select sum(guest_count) from stays),0),
  'arrivals',(select count(*) from public.lodging_reservations s where s.business_unit_id=target_unit and s.status not in('cancelled','conflict') and s.origin<>'maintenance' and s.check_in=target_date),
  'departures',(select count(*) from public.lodging_reservations s where s.business_unit_id=target_unit and s.status not in('cancelled','conflict') and s.origin<>'maintenance' and s.check_out=target_date),
  'reservations_without_price',(select count(*) from stays where total_value<=0),
  'by_type',coalesce((
   select jsonb_agg(t order by t.first_order) from (
    select rm.room_type,min(rm.display_order) as first_order,count(*)::int as total,
     (select count(distinct s.room_id) from stays s where s.room_type=rm.room_type)::int as occupied,
     coalesce(round((select sum(s.total_value/nullif(s.nights,0)) from stays s where s.room_type=rm.room_type)
      /nullif((select count(distinct s.room_id) from stays s where s.room_type=rm.room_type),0)),0) as average_rate
    from rooms rm group by rm.room_type
   ) t),'[]'::jsonb),
  'payments_by_method',jsonb_build_object(
   'cash',coalesce((select sum(net_amount) from day_payments where payment_method='cash'),0),
   'transfer',coalesce((select sum(net_amount) from day_payments where payment_method='transfer'),0),
   'card',coalesce((select sum(net_amount) from day_payments where payment_method='card'),0),
   'airbnb',coalesce((select sum(net_amount) from day_payments where payment_method='airbnb'),0),
   'booking',coalesce((select sum(net_amount) from day_payments where payment_method='booking'),0),
   'company',coalesce((select sum(net_amount) from day_payments where payment_method='company'),0),
   'other',coalesce((select sum(net_amount) from day_payments where payment_method='other'),0)),
  'total_received',coalesce((select sum(net_amount) from day_payments),0),
  'payments',coalesce((
   select jsonb_agg(jsonb_build_object('room',rm.name,'guest',g.full_name,'method',p.payment_method,'type',p.type,'amount',p.net_amount,'paid_at',p.paid_at) order by p.paid_at)
   from day_payments p join public.lodging_reservations s on s.id=p.reservation_id join public.lodging_rooms rm on rm.id=s.room_id
   left join public.lodging_guests g on g.id=s.guest_id),'[]'::jsonb),
  'pending_amount',coalesce((select sum(balance) from pending),0),
  'pending',coalesce((select jsonb_agg(jsonb_build_object('room',room_name,'guest',guest_name,'check_in',check_in,'check_out',check_out,'total',total_value,'paid',paid,'balance',balance,'postpaid_company',postpaid_company) order by room_name) from pending),'[]'::jsonb)
 ) from counts c
$$;
revoke execute on function public.lodging_closing_metrics_internal(uuid,date) from public,anon,authenticated;

create or replace function public.lodging_closing_metrics(target_unit uuid,target_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare unit public.business_units;
begin
 if not (public.has_permission('lodging.closings.create') or public.has_permission('lodging.closings.reports')) then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 return public.lodging_closing_metrics_internal(unit.id,target_date);
end $$;

-- Recalcula la foto de indicadores y totales de un cierre.
create or replace function public.lodging_apply_closing_snapshot(target_closing uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.lodging_daily_closings; m jsonb; expenses numeric; received numeric;
begin
 select * into strict c from public.lodging_daily_closings where id=target_closing;
 m:=public.lodging_closing_metrics_internal(c.business_unit_id,c.closing_date);
 select coalesce(sum(amount),0) into expenses from public.lodging_daily_closing_expenses where closing_id=c.id and deleted_at is null;
 received:=(m->>'total_received')::numeric;
 update public.lodging_daily_closings set
  metrics=m,
  total_rooms=(m->>'total_rooms')::int,
  occupied_rooms=(m->>'occupied_rooms')::int,
  occupancy_pct=(m->>'occupancy_pct')::numeric,
  average_rate=(m->>'average_rate')::numeric,
  cash_received=(m->'payments_by_method'->>'cash')::numeric,
  transfer_received=(m->'payments_by_method'->>'transfer')::numeric,
  card_received=(m->'payments_by_method'->>'card')::numeric,
  airbnb_received=(m->'payments_by_method'->>'airbnb')::numeric,
  other_received=received-(m->'payments_by_method'->>'cash')::numeric-(m->'payments_by_method'->>'transfer')::numeric
   -(m->'payments_by_method'->>'card')::numeric-(m->'payments_by_method'->>'airbnb')::numeric,
  total_received=received,
  pending_amount=(m->>'pending_amount')::numeric,
  expense_total=expenses,
  net_result=received-expenses
 where id=c.id;
end $$;
revoke execute on function public.lodging_apply_closing_snapshot(uuid) from public,anon,authenticated;

-- payload: reported_problems, items_to_replenish, observations,
-- expenses:[{description,amount,payment_method}]. Deja el cierre en borrador.
create or replace function public.lodging_save_daily_closing(target_unit uuid,target_date date,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); unit public.business_units; c public.lodging_daily_closings; saved_id uuid;
 today date:=(now() at time zone 'America/Santiago')::date; line jsonb; line_amount numeric; line_method text;
begin
 if not public.has_permission('lodging.closings.create') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if target_date is null or target_date>today then raise exception 'No se puede cerrar una fecha futura'; end if;
 if target_date<today-1 and not public.has_permission('lodging.closings.manage') then raise exception 'Solo puedes cerrar el dia de hoy o el dia anterior'; end if;
 if jsonb_typeof(coalesce(payload->'expenses','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(payload->'expenses','[]'::jsonb))>50 then raise exception 'Gastos invalidos'; end if;
 select * into c from public.lodging_daily_closings where business_unit_id=unit.id and closing_date=target_date for update;
 if c.id is not null and c.status='issued' and not public.has_permission('lodging.closings.manage') then raise exception 'El cierre ya fue emitido'; end if;

 insert into public.lodging_daily_closings as d(company_id,business_unit_id,closing_date,status,reported_problems,items_to_replenish,observations,created_by)
 values(unit.company_id,unit.id,target_date,'draft',nullif(btrim(payload->>'reported_problems'),''),nullif(btrim(payload->>'items_to_replenish'),''),nullif(btrim(payload->>'observations'),''),me)
 on conflict(business_unit_id,closing_date) do update set status='draft',reported_problems=excluded.reported_problems,
  items_to_replenish=excluded.items_to_replenish,observations=excluded.observations,updated_by=me
 returning d.id into saved_id;

 update public.lodging_daily_closing_expenses set deleted_at=now(),deleted_by=me where closing_id=saved_id and deleted_at is null;
 for line in select * from jsonb_array_elements(coalesce(payload->'expenses','[]'::jsonb)) loop
  line_amount:=round(nullif(line->>'amount','')::numeric);
  line_method:=coalesce(nullif(line->>'payment_method',''),'cash');
  if char_length(coalesce(btrim(line->>'description'),''))<2 then raise exception 'Cada gasto requiere descripcion'; end if;
  if line_amount is null or line_amount<=0 then raise exception 'El monto de cada gasto debe ser mayor a cero'; end if;
  if line_method not in('cash','transfer','card','other') then raise exception 'Medio de pago invalido'; end if;
  insert into public.lodging_daily_closing_expenses(company_id,business_unit_id,closing_id,description,amount,payment_method,created_by)
  values(unit.company_id,unit.id,saved_id,btrim(line->>'description'),line_amount,line_method,me);
 end loop;

 perform public.lodging_apply_closing_snapshot(saved_id);
 return saved_id;
end $$;

-- Emite el cierre: recalcula con los pagos vigentes y lo deja registrado.
create or replace function public.lodging_issue_daily_closing(target_closing uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.lodging_daily_closings;
begin
 if not public.has_permission('lodging.closings.create') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_daily_closings where id=target_closing for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Cierre no encontrado'; end if;
 if c.status='issued' then raise exception 'El cierre ya fue emitido'; end if;
 perform public.lodging_apply_closing_snapshot(c.id);
 update public.lodging_daily_closings set status='issued',issued_at=now(),issued_by=auth.uid(),version=version+1,updated_by=auth.uid() where id=c.id;
end $$;

-- Destinatarios del correo: administradores y superadministradores activos de la compañía.
create or replace function public.lodging_closing_email_recipients(target_closing uuid) returns table(email text,full_name text) language plpgsql stable security definer set search_path='' as $$
declare c public.lodging_daily_closings;
begin
 if not public.has_permission('lodging.closings.create') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_daily_closings where id=target_closing;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Cierre no encontrado'; end if;
 return query select distinct p.email::text,(p.first_name||' '||p.last_name)::text
  from public.profiles p join public.roles r on r.id=p.role_id
  join public.user_companies uc on uc.user_id=p.id and uc.company_id=c.company_id
  where r.key in('administrator','superadmin') and p.active and p.deleted_at is null and nullif(btrim(p.email),'') is not null;
end $$;

create or replace function public.lodging_mark_closing_emailed(target_closing uuid,recipients text[]) returns void language plpgsql security definer set search_path='' as $$
declare c public.lodging_daily_closings;
begin
 if not public.has_permission('lodging.closings.create') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_daily_closings where id=target_closing for update;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) or c.status<>'issued' then raise exception 'Cierre no encontrado'; end if;
 update public.lodging_daily_closings set email_sent_at=now(),email_recipients=recipients where id=c.id;
end $$;

alter table public.lodging_daily_closings enable row level security;
alter table public.lodging_daily_closing_expenses enable row level security;
create policy lodging_daily_closings_select on public.lodging_daily_closings for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and (public.has_permission('lodging.closings.create') or public.has_permission('lodging.closings.reports')));
create policy lodging_daily_closing_expenses_select on public.lodging_daily_closing_expenses for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and (public.has_permission('lodging.closings.create') or public.has_permission('lodging.closings.reports')));

revoke all on public.lodging_daily_closings,public.lodging_daily_closing_expenses from public,anon,authenticated;
grant select on public.lodging_daily_closings,public.lodging_daily_closing_expenses to authenticated;

revoke execute on function public.lodging_closing_metrics(uuid,date),public.lodging_save_daily_closing(uuid,date,jsonb),
 public.lodging_issue_daily_closing(uuid),public.lodging_closing_email_recipients(uuid),public.lodging_mark_closing_emailed(uuid,text[]) from public,anon;
grant execute on function public.lodging_closing_metrics(uuid,date),public.lodging_save_daily_closing(uuid,date,jsonb),
 public.lodging_issue_daily_closing(uuid),public.lodging_closing_email_recipients(uuid),public.lodging_mark_closing_emailed(uuid,text[]) to authenticated;

commit;
