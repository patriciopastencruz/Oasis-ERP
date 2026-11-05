begin;

-- Reporte diario de Lucía: nueva brecha «comprobantes». Lista los pagos confirmados de los últimos 30 días
-- (hasta el día revisado) que no tienen ningún comprobante adjunto, con la pieza, el huésped y el monto,
-- para que recepción los cargue. Los pagos de Airbnb no la generan (no hay comprobante bancario).
-- Solo agrega ese bloque y ajusta la línea de «Todo OK» de la función.
do $$
declare
  def text := pg_get_functiondef('public.lucia_daily_audit_message(uuid,date)'::regprocedure);
  anchor text := $old$    -- Saldos de huéspedes que ya salieron (últimos 60 días, sin empresas con pago posterior).$old$;
  ok_text text := $old$sin inspecciones ni saldos pendientes)$old$;
begin
  if position(anchor in def) = 0 or position(ok_text in def) = 0 then
    raise exception 'lucia_daily_audit_message cambió: revisar la brecha de comprobantes';
  end if;
  def := replace(def, anchor,
    $new$    -- Pagos confirmados sin comprobante adjunto (últimos 30 días): brecha de respaldo.
    select count(*), sum(x.amount), array_to_string((array_agg(x.label order by x.paid_day desc, x.room))[1:8], ', ')
    into n, total, rooms
    from (
      select rm.name as room, (p.paid_at at time zone 'America/Santiago')::date as paid_day, p.amount,
        format('%s %s %s (%s)', rm.name, coalesce(g.full_name, 'sin nombre'), public.lucia_clp(p.amount),
          to_char((p.paid_at at time zone 'America/Santiago')::date, 'DD-MM')) as label
      from public.lodging_reservation_payments p
      join public.lodging_reservations r on r.id = p.reservation_id
      join public.lodging_rooms rm on rm.id = r.room_id
      left join public.lodging_guests g on g.id = r.guest_id
      where p.business_unit_id = h.unit and p.status = 'confirmed' and p.payment_method <> 'airbnb'
        and r.status not in ('cancelled', 'conflict')
        and (p.paid_at at time zone 'America/Santiago')::date between target_date - 29 and target_date
        and not exists (select 1 from public.lodging_payment_receipts pr where pr.payment_id = p.id and pr.deleted_at is null)
    ) x;
    if n > 0 then
      issues := issues || format('❌ Brecha en comprobantes: %s %s sin comprobante (%s): %s%s',
        n, case when n = 1 then 'pago' else 'pagos' end, public.lucia_clp(total), rooms,
        case when n > 8 then format(' y %s más', n - 8) else '' end);
    end if;

$new$ || anchor);
  def := replace(def, ok_text, $new$sin inspecciones, saldos ni comprobantes pendientes)$new$);
  execute def;
end $$;

commit;
