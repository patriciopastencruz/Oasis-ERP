\set ON_ERROR_STOP on
begin;

-- Reporte diario de auditoría: indica cierres no realizados y se envía una
-- sola vez al día al grupo del equipo, desde las 9:00 hasta las 12:00.

select id as company_id from public.companies where code='OASIS' \gset
update public.lucia_settings set staff_group_jid='120363000000000001@g.us', daily_audit_sent_on=null where company_id=:'company_id';
select set_config('lucia.company',:'company_id',true);
set local role service_role;

do $$
declare company uuid:=current_setting('lucia.company')::uuid; body text; sent boolean;
  local_time time:=(now() at time zone 'America/Santiago')::time;
begin
  body:=public.lucia_daily_audit_message(company, current_date - 1);
  if body not like '📋 *Revisión del cierre de ayer*%' or body not like '%❌ Cierre no realizado%' or body not like '%/lodging/closing' then
    raise exception 'Mensaje inesperado: %', body;
  end if;

  sent:=public.lucia_send_daily_audit(company);
  if local_time >= time '09:00' and local_time < time '12:00' then
    if not sent then raise exception 'Debía enviarse en horario'; end if;
    if not exists(select 1 from public.lucia_staff_messages where to_jid='120363000000000001@g.us' and content like '📋%') then
      raise exception 'El reporte debe ir al grupo';
    end if;
    if public.lucia_send_daily_audit(company) then raise exception 'Solo una vez al día'; end if;
  elsif sent then
    raise exception 'Fuera de 9:00 a 12:00 no se envía';
  end if;
end $$;

rollback;
