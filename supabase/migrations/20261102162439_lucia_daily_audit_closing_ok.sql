begin;

-- Reporte diario: la hostal sin ninguna desviación (cierre emitido y
-- cuadrado, sin inspecciones ni saldos pendientes) se declara explícitamente
-- «Todo OK, sin desviaciones». Si hay cualquier pendiente se listan todas
-- las desviaciones, como hasta ahora. Solo cambia esa línea de la función.
do $$
declare
  def text := pg_get_functiondef('public.lucia_daily_audit_message(uuid,date)'::regprocedure);
  old_line text := $old$lines := lines || format('*%s* ✅ Cierre emitido y cuadra con el ERP · sin pendientes', h.name);$old$;
begin
  if position(old_line in def) = 0 then
    raise exception 'lucia_daily_audit_message cambió: revisar la línea de hostal sin desviaciones';
  end if;
  execute replace(def, old_line,
    $new$lines := lines || format(E'*%s*\n✅ Todo OK, sin desviaciones (cierre emitido y cuadrado con el ERP, sin inspecciones ni saldos pendientes)', h.name);$new$);
end $$;

commit;
