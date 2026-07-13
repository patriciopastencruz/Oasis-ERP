begin;

alter table public.payments add column scheduled_method public.payment_method;
alter table public.payments add column executed_amount numeric(18,2)
  check (executed_amount is null or (executed_amount > 0 and executed_amount=trunc(executed_amount)));
alter table public.payments add column execution_notes text;

create or replace function public.schedule_payment(
  target_request uuid,target_date date,target_method public.payment_method,schedule_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pr public.payment_requests%rowtype; pay public.payments%rowtype;
begin
  if actor is null or not public.current_user_active() or not public.has_permission('finance.payments.schedule') then raise exception 'Usuario no autorizado para programar pagos'; end if;
  if target_date is null then raise exception 'La fecha programada es obligatoria'; end if;
  select * into pr from public.payment_requests where id=target_request for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if not public.can_access_unit(pr.company_id,pr.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
  select * into pay from public.payments where payment_request_id=pr.id for update;
  if found then
    if pay.paid_at is not null then raise exception 'El pago ya fue ejecutado'; end if;
    if pr.status='scheduled' then return jsonb_build_object('payment_id',pay.id,'status',pr.status,'already_scheduled',true); end if;
    raise exception 'La solicitud ya tiene un registro de pago';
  end if;
  if pr.status<>'approved' then raise exception 'Solo una solicitud aprobada puede programarse'; end if;
  insert into public.payments(company_id,business_unit_id,payment_request_id,scheduled_date,scheduled_method,notes,scheduled_by,created_by)
  values(pr.company_id,pr.business_unit_id,pr.id,target_date,target_method,nullif(btrim(schedule_notes),''),actor,actor) returning * into pay;
  update public.payment_requests set status='scheduled' where id=pr.id returning * into pr;
  return jsonb_build_object('payment_id',pay.id,'status',pr.status,'scheduled_date',pay.scheduled_date,'already_scheduled',false);
end $$;

create or replace function public.execute_payment(
  target_payment uuid,target_paid_at timestamptz,target_method public.payment_method,
  target_operation_number text,target_amount numeric,execute_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pr public.payment_requests%rowtype; pay public.payments%rowtype;
begin
  if actor is null or not public.current_user_active() or not public.has_permission('finance.payments.execute') then raise exception 'Usuario no autorizado para ejecutar pagos'; end if;
  select * into pay from public.payments where id=target_payment for update;
  if not found then raise exception 'Pago no encontrado'; end if;
  select * into pr from public.payment_requests where id=pay.payment_request_id for update;
  if not public.can_access_unit(pay.company_id,pay.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
  if pay.paid_at is not null then return jsonb_build_object('payment_id',pay.id,'status',pr.status,'paid_at',pay.paid_at,'already_paid',true); end if;
  if pr.status<>'scheduled' then raise exception 'Solo un pago programado puede ejecutarse'; end if;
  if target_paid_at is null then raise exception 'La fecha real de pago es obligatoria'; end if;
  if target_amount is distinct from pr.amount then raise exception 'El monto ejecutado debe coincidir con el monto aprobado'; end if;
  if target_method not in ('cash','petty_cash') and nullif(btrim(target_operation_number),'') is null then raise exception 'El medio de pago requiere número de operación'; end if;
  if not exists(select 1 from public.payment_receipts r where r.payment_id=pay.id and r.deleted_at is null) then raise exception 'Se requiere comprobante de pago'; end if;
  update public.payments set paid_at=target_paid_at,method=target_method,operation_number=nullif(btrim(target_operation_number),''),
    executed_amount=target_amount,execution_notes=nullif(btrim(execute_notes),''),paid_by=actor where id=pay.id returning * into pay;
  update public.payment_requests set status='paid' where id=pr.id returning * into pr;
  return jsonb_build_object('payment_id',pay.id,'status',pr.status,'paid_at',pay.paid_at,'already_paid',false);
end $$;

revoke all on function public.schedule_payment(uuid,date,public.payment_method,text) from public,anon;
revoke all on function public.execute_payment(uuid,timestamptz,public.payment_method,text,numeric,text) from public,anon;
grant execute on function public.schedule_payment(uuid,date,public.payment_method,text) to authenticated,service_role;
grant execute on function public.execute_payment(uuid,timestamptz,public.payment_method,text,numeric,text) to authenticated,service_role;

comment on function public.schedule_payment(uuid,date,public.payment_method,text) is 'Programa una solicitud aprobada con bloqueo de fila e idempotencia.';
comment on function public.execute_payment(uuid,timestamptz,public.payment_method,text,numeric,text) is 'Ejecuta un pago programado con comprobante, monto exacto, bloqueo e idempotencia.';

commit;
