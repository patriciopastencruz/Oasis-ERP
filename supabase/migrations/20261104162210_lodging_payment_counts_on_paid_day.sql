begin;

-- Vuelve a la regla original: todo pago (efectivo, transferencia, tarjeta) cuenta en el cierre del día
-- en que se registra, aunque corresponda a noches posteriores o a una estadía ya terminada.
-- Revierte 20261102224650_lodging_payment_day_rule.
do $$
declare
  def text := pg_get_functiondef('public.lodging_closing_base_metrics_internal(uuid,date)'::regprocedure);
  new_day text := $new$and exists(select 1 from public.lodging_reservations r where r.id=p.reservation_id
     and public.lodging_payment_day(p.paid_at,r.check_in,r.check_out)=target_date)$new$;
begin
  if position(new_day in def) = 0 then
    raise exception 'lodging_closing_base_metrics_internal cambió: revisar el día de cada pago';
  end if;
  execute replace(def, new_day, $old$and (p.paid_at at time zone 'America/Santiago')::date=target_date$old$);
end $$;

do $$
declare
  def text := pg_get_functiondef('public.lodging_monthly_summary_internal(uuid,date)'::regprocedure);
  new_range text := $new$and exists(select 1 from public.lodging_reservations r where r.id=p.reservation_id
     and public.lodging_payment_day(p.paid_at,r.check_in,r.check_out)>=b.start_date
     and public.lodging_payment_day(p.paid_at,r.check_in,r.check_out)<b.next_date)$new$;
begin
  if position(new_range in def) = 0 then
    raise exception 'lodging_monthly_summary_internal cambió: revisar el día de cada pago';
  end if;
  execute replace(def, new_range,
    $old$and (p.paid_at at time zone 'America/Santiago')::date>=b.start_date and (p.paid_at at time zone 'America/Santiago')::date<b.next_date$old$);
end $$;

drop function public.lodging_payment_day(timestamptz, date, date);

commit;
