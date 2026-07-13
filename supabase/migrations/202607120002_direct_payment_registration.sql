begin;

create or replace function public.validate_payment_request_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = new.status then return new; end if;
  if not (
    (old.status = 'draft' and new.status in ('pending_approval','cancelled')) or
    (old.status = 'pending_approval' and new.status in ('under_review','approved','rejected','correction_requested','cancelled')) or
    (old.status = 'under_review' and new.status in ('approved','rejected','correction_requested','cancelled')) or
    (old.status = 'correction_requested' and new.status in ('pending_approval','cancelled')) or
    (old.status = 'approved' and new.status in ('paid','scheduled','cancelled')) or
    (old.status = 'scheduled' and new.status in ('paid','cancelled'))
  ) then
    raise exception 'Transición de estado no permitida: % -> %', old.status, new.status;
  end if;
  return new;
end $$;

create or replace function public.prepare_payment_registration(target_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  pr public.payment_requests%rowtype;
  pay public.payments%rowtype;
begin
  if actor is null or not public.current_user_active() or not public.has_permission('finance.payments.execute') then
    raise exception 'Usuario no autorizado para registrar pagos';
  end if;
  select * into pr from public.payment_requests where id = target_request for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if not public.can_access_unit(pr.company_id, pr.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
  if pr.status not in ('approved','scheduled') then raise exception 'Solo una solicitud aprobada puede pagarse'; end if;

  select * into pay from public.payments where payment_request_id = pr.id for update;
  if found then
    return jsonb_build_object('payment_id', pay.id, 'already_prepared', true, 'already_paid', pay.paid_at is not null);
  end if;

  insert into public.payments(
    company_id, business_unit_id, payment_request_id, scheduled_date,
    scheduled_by, created_by
  ) values (
    pr.company_id, pr.business_unit_id, pr.id, current_date,
    actor, actor
  ) returning * into pay;

  return jsonb_build_object('payment_id', pay.id, 'already_prepared', false, 'already_paid', false);
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
  if pr.status not in ('approved','scheduled') then raise exception 'Solo una solicitud aprobada puede pagarse'; end if;
  if target_paid_at is null then raise exception 'La fecha real de pago es obligatoria'; end if;
  if target_amount is distinct from pr.amount then raise exception 'El monto ejecutado debe coincidir con el monto aprobado'; end if;
  if target_method not in ('cash','petty_cash') and nullif(btrim(target_operation_number),'') is null then raise exception 'El medio de pago requiere número de operación'; end if;
  if not exists(select 1 from public.payment_receipts r where r.payment_id=pay.id and r.deleted_at is null) then raise exception 'Se requiere comprobante de pago'; end if;
  update public.payments set paid_at=target_paid_at,method=target_method,operation_number=nullif(btrim(target_operation_number),''),
    executed_amount=target_amount,execution_notes=nullif(btrim(execute_notes),''),paid_by=actor where id=pay.id returning * into pay;
  update public.payment_requests set status='paid' where id=pr.id returning * into pr;
  return jsonb_build_object('payment_id',pay.id,'status',pr.status,'paid_at',pay.paid_at,'already_paid',false);
end $$;

revoke all on function public.prepare_payment_registration(uuid) from public, anon;
grant execute on function public.prepare_payment_registration(uuid) to authenticated, service_role;

comment on function public.prepare_payment_registration(uuid) is
  'Prepara idempotentemente el registro directo de un pago aprobado sin cambiarlo a programado.';
comment on function public.execute_payment(uuid,timestamptz,public.payment_method,text,numeric,text) is
  'Registra directamente un pago aprobado (o uno programado legado), exige comprobante y evita duplicados.';

commit;
