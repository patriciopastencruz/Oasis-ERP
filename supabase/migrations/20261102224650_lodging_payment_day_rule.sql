begin;

-- Día al que corresponde un pago (cierre diario y resumen mensual):
-- * pagado antes de llegar (abono)            → día de ingreso;
-- * pagado durante la estadía (noche siguiente,
--   extensión)                                 → día en que se pagó;
-- * pagado el día de salida o después
--   (regularización)                           → última noche de la estadía.
-- Así el efectivo de un huésped que llegó el día 1 y pagó al salir el día 2
-- queda en el cierre del día 1; si ese cierre ya estaba emitido, se reemite
-- (el reporte diario de las 9:00 lo muestra como brecha hasta entonces).

create or replace function public.lodging_payment_day(paid_at timestamptz, check_in date, check_out date) returns date
language sql immutable set search_path = '' as $$
  select case
    when (paid_at at time zone 'America/Santiago')::date < check_in then check_in
    when (paid_at at time zone 'America/Santiago')::date >= check_out then greatest(check_in, check_out - 1)
    else (paid_at at time zone 'America/Santiago')::date
  end
$$;
grant execute on function public.lodging_payment_day(timestamptz, date, date) to authenticated, service_role;

do $$
declare
  def text := pg_get_functiondef('public.lodging_closing_base_metrics_internal(uuid,date)'::regprocedure);
  old_day text := $old$and (p.paid_at at time zone 'America/Santiago')::date=target_date$old$;
begin
  if position(old_day in def) = 0 then
    raise exception 'lodging_closing_base_metrics_internal cambió: revisar el día de cada pago';
  end if;
  execute replace(def, old_day,
    $new$and exists(select 1 from public.lodging_reservations r where r.id=p.reservation_id
     and public.lodging_payment_day(p.paid_at,r.check_in,r.check_out)=target_date)$new$);
end $$;

do $$
declare
  def text := pg_get_functiondef('public.lodging_monthly_summary_internal(uuid,date)'::regprocedure);
  old_range text := $old$and (p.paid_at at time zone 'America/Santiago')::date>=b.start_date and (p.paid_at at time zone 'America/Santiago')::date<b.next_date$old$;
begin
  if position(old_range in def) = 0 then
    raise exception 'lodging_monthly_summary_internal cambió: revisar el día de cada pago';
  end if;
  execute replace(def, old_range,
    $new$and exists(select 1 from public.lodging_reservations r where r.id=p.reservation_id
     and public.lodging_payment_day(p.paid_at,r.check_in,r.check_out)>=b.start_date
     and public.lodging_payment_day(p.paid_at,r.check_in,r.check_out)<b.next_date)$new$);
end $$;

commit;
