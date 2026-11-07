begin;

-- El reporte diario de las 9:00 solo revisa el mes del cierre: los meses
-- anteriores ya están cerrados. Los pagos sin comprobante y los saldos de
-- huéspedes que salieron se cuentan desde el día 1 de ese mes (antes: 30 y
-- 60 días hacia atrás, que arrastraban octubre a noviembre).

do $$
declare
  def text := pg_get_functiondef('public.lucia_daily_audit_message(uuid,date)'::regprocedure);
  old_receipts text := $old$between target_date - 29 and target_date$old$;
  old_balances text := $old$r.check_out > target_date - 60$old$;
begin
  if position(old_receipts in def) = 0 or position(old_balances in def) = 0 then
    raise exception 'lucia_daily_audit_message cambió: revisar el periodo del reporte';
  end if;
  def := replace(def, old_receipts, $new$between date_trunc('month', target_date)::date and target_date$new$);
  -- Quien salió el día 1 durmió la última noche del mes anterior: ya cerrado.
  def := replace(def, old_balances, $new$r.check_out > date_trunc('month', target_date)::date$new$);
  execute def;
end $$;

commit;
