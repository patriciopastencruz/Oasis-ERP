\set ON_ERROR_STOP on
begin;

-- Cuando el equipo responde, Lucía se pausa hasta el cierre de recepción de la
-- hostal (o 1 hora si ya cerró) y no 12 horas fijas.

select id as company_id from public.companies where code='OASIS' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset
select set_config('lucia.company',:'company_id',true);
select set_config('lucia.hoc',:'hoc',true);
set local role service_role;

do $$
declare company uuid:=current_setting('lucia.company')::uuid; hoc uuid:=current_setting('lucia.hoc')::uuid; r jsonb; conv uuid; c public.lucia_conversations;
  local_now timestamp:=now() at time zone 'America/Santiago'; until timestamptz;
begin
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981239001@s.whatsapp.net','phone','+56981239001','external_id','SP1','push_name','Ana','content','Hola'));
  conv:=(r->>'conversation_id')::uuid;
  update public.lucia_conversations set business_unit_id=hoc, hostel_assigned=true where id=conv;
  select * into c from public.lucia_conversations where id=conv;

  -- Recepción abierta: cierra dentro de 2 horas (mismo día) -> pausa hasta el cierre.
  if local_now::time < time '21:00' then
    update public.lucia_hostels set reception_close_time=(local_now + interval '2 hours')::time, reception_close_time_weekend=null where business_unit_id=hoc;
    until:=public.lucia_staff_pause_until(c);
    if abs(extract(epoch from until - (now() + interval '2 hours'))) > 60 then raise exception 'Debía pausar hasta el cierre: %', until; end if;
  end if;

  -- Recepción ya cerrada: pausa de 1 hora.
  if local_now::time > time '02:00' then
    update public.lucia_hostels set reception_close_time=(local_now - interval '1 hour')::time, reception_close_time_weekend=null where business_unit_id=hoc;
    until:=public.lucia_staff_pause_until(c);
    if abs(extract(epoch from until - (now() + interval '1 hour'))) > 60 then raise exception 'Fuera de horario la pausa es de 1 hora: %', until; end if;
  end if;

  -- El mensaje desde el teléfono usa la misma regla (ya no 12 horas).
  perform public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981239001@s.whatsapp.net','phone','+56981239001','external_id','SP2','from_me',true,'content','Te respondo yo'));
  if (select paused_until from public.lucia_conversations where id=conv) > now() + interval '11 hours' then
    raise exception 'La pausa por mensaje del teléfono no debe ser de 12 horas';
  end if;
end $$;

select 'lucia staff pause ok' as result;
rollback;
