begin;

-- Los pagos de una reserva anulada (o en conflicto) dejan de contar como ingreso del día y del mes:
-- al anular y volver a crear la reserva el pago se registraba de nuevo en la reserva nueva y se
-- sumaba dos veces. Una devolución sobre una reserva anulada tampoco cuenta, igual que el pago que devuelve.
do $$
declare
  def text := pg_get_functiondef('public.lodging_closing_base_metrics_internal(uuid,date)'::regprocedure);
  anchor text := $a$and (p.paid_at at time zone 'America/Santiago')::date=target_date$a$;
begin
  if position(anchor in def) = 0 then
    raise exception 'lodging_closing_base_metrics_internal cambió: revisar los pagos del día';
  end if;
  execute replace(def, anchor, anchor || $new$
   and exists(select 1 from public.lodging_reservations r where r.id=p.reservation_id
     and r.status not in('cancelled','conflict'))$new$);
end $$;

do $$
declare
  def text := pg_get_functiondef('public.lodging_monthly_summary_internal(uuid,date)'::regprocedure);
  anchor text := $a$and (p.paid_at at time zone 'America/Santiago')::date<b.next_date$a$;
begin
  if position(anchor in def) = 0 then
    raise exception 'lodging_monthly_summary_internal cambió: revisar los pagos del mes';
  end if;
  execute replace(def, anchor, anchor || $new$
   and exists(select 1 from public.lodging_reservations r where r.id=p.reservation_id
     and r.status not in('cancelled','conflict'))$new$);
end $$;

-- Los cierres mensuales en preparación recalculan su ingreso con la regla nueva.
select public.lodging_monthly_refresh_totals(id) from public.lodging_monthly_closings where status='draft';

commit;
