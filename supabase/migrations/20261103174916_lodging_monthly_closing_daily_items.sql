begin;

-- Cuando el hostal aún no declara gastos en el módulo Gastos, el estado de resultados usa los de los cierres diarios.
-- Cada uno se detalla con su propio nombre (la descripción con que se ingresó) en vez de «Gastos de cierres diarios (n)».
-- Los totales por categoría no cambian.
do $$
declare
  def text := pg_get_functiondef('public.lodging_monthly_summary_internal(uuid,date)'::regprocedure);
  old_select text := $old$coalesce(fc.section,'variable') as section,$old$;
  old_json text := $old$'lines',lines) order by amount desc) from daily)$old$;
begin
  if position(old_select in def) = 0 or position(old_json in def) = 0 then
    raise exception 'lodging_monthly_summary_internal cambió: revisar el detalle de gastos de cierres diarios';
  end if;
  def := replace(def, old_select,
    $new$coalesce(fc.section,'variable') as section,
   jsonb_agg(jsonb_build_object('date',d.closing_date,'description',e.description,'amount',e.amount) order by d.closing_date,e.created_at) as items,$new$);
  def := replace(def, old_json,
    $new$'lines',lines,'items',items) order by amount desc) from daily)$new$);
  execute def;
end $$;

-- Los borradores toman el detalle de inmediato.
select public.lodging_monthly_refresh_totals(id) from public.lodging_monthly_closings where status='draft';

commit;
