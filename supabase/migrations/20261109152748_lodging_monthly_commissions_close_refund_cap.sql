begin;

-- 1) Las comisiones del cierre mensual se prorratean por noches del mes, igual que la venta: una estadía que cruza
--    el cambio de mes reparte su comisión, y en el mes en curso solo cuentan las noches hasta hoy.
-- 2) No se cierra un mes que todavía no termina: la foto quedaba con la venta solo hasta ese día.
-- 3) Una devolución no puede superar lo pagado de la reserva.

do $$
declare
  def text := pg_get_functiondef('public.lodging_monthly_summary_internal(uuid,date)'::regprocedure);
  stays_cols text := $a$select s.id,s.room_id,s.guest_id,s.check_in,s.check_out,s.total_value,s.postpaid_company,$a$;
  old_commissions text := $a$select coalesce(sum(r.commission),0) as amount from public.lodging_reservations r,bounds b
  where r.business_unit_id=target_unit and r.status not in('cancelled','conflict') and r.origin<>'maintenance'
   and r.check_in>=b.start_date and r.check_in<b.next_date$a$;
begin
  if (length(def) - length(replace(def, stays_cols, ''))) / length(stays_cols) <> 1
     or (length(def) - length(replace(def, old_commissions, ''))) / length(old_commissions) <> 1 then
    raise exception 'lodging_monthly_summary_internal cambió: revisar las comisiones';
  end if;
  def := replace(def, stays_cols, stays_cols || 's.commission,');
  def := replace(def, old_commissions,
    $new$select round(coalesce(sum(coalesce(commission,0)*month_nights/greatest(1,check_out-check_in)),0)) as amount from stays$new$);
  execute def;
end $$;

do $$
declare
  def text := pg_get_functiondef('public.lodging_monthly_close(uuid,text)'::regprocedure);
  anchor text := $a$ if c.status<>'draft' then raise exception 'El mes ya esta cerrado'; end if;$a$;
begin
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'lodging_monthly_close cambió: revisar el cierre del mes en curso';
  end if;
  execute replace(def, anchor, anchor || $new$
 if c.period>=date_trunc('month',(now() at time zone 'America/Santiago'))::date then raise exception 'El mes todavia no termina'; end if;$new$);
end $$;

create or replace function public.lodging_payment_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.lodging_reservations; d date; internal boolean:=coalesce(current_setting('lodging.settling_payments',true),'')='1';
begin
 select * into r from public.lodging_reservations where id=new.reservation_id;
 if r.id is null or r.company_id<>new.company_id or r.business_unit_id<>new.business_unit_id then
  raise exception 'El pago debe ser del mismo hostal que la reserva';
 end if;
 if tg_op='INSERT' and not internal and r.status in('cancelled','conflict') then
  raise exception 'La reserva esta anulada: no se registran pagos nuevos';
 end if;
 if tg_op='INSERT' and new.type='refund' and new.status='confirmed' and new.amount>coalesce((
   select sum(case when p.type='refund' then -p.amount else p.amount end) from public.lodging_reservation_payments p
   where p.reservation_id=new.reservation_id and p.status='confirmed'),0) then
  raise exception 'La devolucion no puede superar lo pagado';
 end if;
 if tg_op='INSERT' or new.paid_at is distinct from old.paid_at then
  if new.paid_at>now()+interval '10 minutes' then raise exception 'La fecha del pago no puede ser futura'; end if;
  d:=(new.paid_at at time zone 'America/Santiago')::date;
  if not internal and d<(now() at time zone 'America/Santiago')::date and exists(
    select 1 from public.lodging_daily_closings c where c.business_unit_id=new.business_unit_id and c.closing_date=d and c.status='issued') then
   raise exception 'El cierre de ese dia ya fue emitido: registra el pago con la fecha de hoy';
  end if;
 end if;
 return new;
end $$;
revoke execute on function public.lodging_payment_guard() from public,anon,authenticated;

select public.lodging_monthly_refresh_totals(id) from public.lodging_monthly_closings where status='draft';

commit;
