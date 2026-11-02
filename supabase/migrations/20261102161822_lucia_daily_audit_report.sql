begin;

-- Reporte diario de auditoría: cada mañana a las 9:00 Lucía envía al grupo
-- del equipo la revisión del cierre del día anterior de cada hostal:
-- * cierre no realizado;
-- * brechas entre lo declarado en el cierre y lo que hoy registra el ERP
--   para ese día (habitaciones ocupadas, pagos recibidos y monto pendiente);
-- * habitaciones esperando inspección;
-- * saldos por cobrar de huéspedes que ya salieron.
-- Lo arma la base con datos del ERP: no usa créditos de IA.

alter table public.lucia_settings add column daily_audit_sent_on date;

create or replace function public.lucia_daily_audit_message(target_company uuid, target_date date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s public.lucia_settings;
  h record;
  c public.lodging_daily_closings;
  m jsonb;
  lines text[] := '{}';
  issues text[];
  rooms text;
  n int;
  total numeric;
  ok_all boolean := true;
begin
  select * into strict s from public.lucia_settings where company_id = target_company;
  for h in
    select lh.business_unit_id as unit, lh.display_name as name
    from public.lucia_hostels lh join public.business_units b on b.id = lh.business_unit_id
    where lh.company_id = target_company and lh.enabled
    order by lh.display_name
  loop
    issues := '{}';
    select * into c from public.lodging_daily_closings
    where business_unit_id = h.unit and closing_date = target_date and status = 'issued'
    order by version desc limit 1;
    if c.id is null then
      issues := issues || '❌ Cierre no realizado'::text;
    else
      m := public.lodging_closing_metrics_internal(h.unit, target_date);
      if c.occupied_rooms <> coalesce((m->>'occupied_rooms')::int, 0) then
        issues := issues || format('❌ Brecha en ocupación: el cierre dice %s habitaciones y el ERP registra %s',
          c.occupied_rooms, coalesce((m->>'occupied_rooms')::int, 0));
      end if;
      if abs(c.total_received - coalesce((m->>'total_received')::numeric, 0)) >= 1000 then
        issues := issues || format('❌ Brecha en pagos: el cierre declara %s y el ERP registra %s para ese día',
          public.lucia_clp(c.total_received), public.lucia_clp(coalesce((m->>'total_received')::numeric, 0)));
      end if;
      if abs(c.pending_amount - coalesce((m->>'pending_amount')::numeric, 0)) >= 1000 then
        issues := issues || format('❌ Brecha en pendiente de pago: el cierre declara %s y el ERP registra %s',
          public.lucia_clp(c.pending_amount), public.lucia_clp(coalesce((m->>'pending_amount')::numeric, 0)));
      end if;
    end if;

    -- Habitaciones esperando inspección (solo si la hostal usa aseo e inspecciones).
    if public.lodging_ops_housekeeping_on(h.unit) then
      select count(*), string_agg(r.name, ', ' order by r.display_order) into n, rooms
      from public.lodging_rooms r
      where r.business_unit_id = h.unit and r.active and r.operational_status = 'pending_inspection';
      if n > 0 then
        issues := issues || format('🧹 %s %s esperando inspección: %s', n, case when n = 1 then 'pieza' else 'piezas' end, rooms);
      end if;
    end if;

    -- Saldos de huéspedes que ya salieron (últimos 60 días, sin empresas con pago posterior).
    select count(*), sum(x.balance), string_agg(format('%s %s', x.room, public.lucia_clp(x.balance)), ', ' order by x.check_out desc)
    into n, total, rooms
    from (
      select rm.name as room, r.check_out,
        r.total_value - coalesce((select sum(case when p.type = 'refund' then -p.amount else p.amount end)
          from public.lodging_reservation_payments p where p.reservation_id = r.id and p.status = 'confirmed'), 0) as balance
      from public.lodging_reservations r join public.lodging_rooms rm on rm.id = r.room_id
      where r.business_unit_id = h.unit and r.status not in ('cancelled', 'conflict') and r.origin <> 'maintenance'
        and not r.postpaid_company and r.check_out <= target_date + 1 and r.check_out > target_date - 60
    ) x where x.balance >= 1000;
    if n > 0 then
      issues := issues || format('💰 %s %s con saldo por cobrar (%s): %s', n, case when n = 1 then 'huésped que salió' else 'huéspedes que salieron' end,
        public.lucia_clp(total), rooms);
    end if;

    if cardinality(issues) = 0 then
      lines := lines || format('*%s* ✅ Cierre emitido y cuadra con el ERP · sin pendientes', h.name);
    else
      ok_all := false;
      lines := lines || format(E'*%s*\n%s', h.name, array_to_string(issues, E'\n'));
    end if;
  end loop;

  return left(format(E'📋 *Revisión del cierre de ayer* (%s)\n\n%s%s\n\nDetalle en el ERP: %s/lodging/closing',
    public.lucia_date_es(target_date),
    array_to_string(lines, E'\n\n'),
    case when ok_all then E'\n\n👏 Todo en orden.' else '' end,
    s.app_url), 4000);
end $$;
revoke execute on function public.lucia_daily_audit_message(uuid, date) from public, anon, authenticated;
grant execute on function public.lucia_daily_audit_message(uuid, date) to service_role;

-- Lo llama el worker cada minuto: envía una vez al día, desde las 9:00 y
-- hasta las 12:00 (si el worker estuvo caído, no llega tarde en la noche).
create or replace function public.lucia_send_daily_audit(target_company uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare s public.lucia_settings; local_now timestamp := now() at time zone 'America/Santiago';
begin
  select * into s from public.lucia_settings where company_id = target_company for update;
  if not found or s.staff_group_jid is null then return false; end if;
  if local_now::time < time '09:00' or local_now::time >= time '12:00' then return false; end if;
  if s.daily_audit_sent_on = local_now::date then return false; end if;
  insert into public.lucia_staff_messages(company_id, business_unit_id, to_jid, content)
  values (s.company_id, s.business_unit_id, s.staff_group_jid,
    public.lucia_daily_audit_message(target_company, local_now::date - 1));
  update public.lucia_settings set daily_audit_sent_on = local_now::date where id = s.id;
  return true;
end $$;
revoke execute on function public.lucia_send_daily_audit(uuid) from public, anon, authenticated;
grant execute on function public.lucia_send_daily_audit(uuid) to service_role;

commit;
