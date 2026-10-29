\set ON_ERROR_STOP on
begin;

-- Recontacto a los 20 minutos: una sola vez por silencio, solo con opciones
-- entregadas o pago pendiente, nunca con revisión pendiente, y solo entre
-- 8:00 y 22:00 hora de Chile.

select id as company_id from public.companies where code='OASIS' \gset
select set_config('lucia.company',:'company_id',true);
set local role service_role;
do $$
declare company uuid:=current_setting('lucia.company')::uuid; r jsonb; a uuid; b uuid; n int;
  in_hours boolean:=extract(hour from now() at time zone 'America/Santiago') between 8 and 21;
begin
  -- A: recibió opciones y no respondió hace 25 minutos.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56987777771@s.whatsapp.net','phone','+56987777771','external_id','F1','push_name','Carla Soto','content','¿Qué tienen?'));
  a:=(r->>'conversation_id')::uuid;
  update public.lucia_conversations set check_in=current_date+10,check_out=current_date+12 where id=a;
  insert into public.lucia_messages(company_id,business_unit_id,conversation_id,direction,sender_type,content,delivery_status,sent_at)
  select company_id,business_unit_id,id,'outbound','lucia','Opciones…','sent',now() from public.lucia_conversations where id=a;
  -- B: igual, pero con un reclamo pendiente de revisión.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56987777772@s.whatsapp.net','phone','+56987777772','external_id','F2','content','Reclamo'));
  b:=(r->>'conversation_id')::uuid;
  update public.lucia_conversations set check_in=current_date+10,check_out=current_date+12,needs_review=true where id=b;
  insert into public.lucia_messages(company_id,business_unit_id,conversation_id,direction,sender_type,content,delivery_status,sent_at)
  select company_id,business_unit_id,id,'outbound','lucia','Lo siento…','sent',now() from public.lucia_conversations where id=b;

  -- Aún no pasan 20 minutos: nada.
  if public.lucia_send_followups(company)<>0 then raise exception 'No se recontacta antes de 20 minutos'; end if;
  update public.lucia_conversations set last_outbound_at=now()-interval '25 minutes',last_inbound_at=now()-interval '30 minutes' where id in(a,b);

  n:=public.lucia_send_followups(company);
  if in_hours then
    if n<>1 then raise exception 'Debía recontactar solo a A (%)',n; end if;
    if not exists(select 1 from public.lucia_messages where conversation_id=a and content like '¡Hola Carla!%¿Pudiste revisar las opciones?%') then raise exception 'Falta el mensaje de recontacto'; end if;
    update public.lucia_conversations set last_outbound_at=now()-interval '25 minutes' where id=a;
    if public.lucia_send_followups(company)<>0 then raise exception 'Solo un recontacto por silencio'; end if;
    -- El cliente responde y vuelve a quedar en silencio: corresponde otro.
    update public.lucia_messages set delivery_status='sent',sent_at=now() where conversation_id=a and delivery_status='queued';
    update public.lucia_conversations set followup_sent_at=now()-interval '40 minutes',last_inbound_at=now()-interval '24 minutes',last_outbound_at=now()-interval '21 minutes' where id=a;
    if public.lucia_send_followups(company)<>1 then raise exception 'Tras una nueva respuesta del cliente corresponde otro recontacto'; end if;
    -- Pidió departamento y quedaron opciones con baño compartido sin mostrar: el recontacto las ofrece.
    update public.lucia_messages set delivery_status='sent',sent_at=now() where conversation_id=a and delivery_status='queued';
    update public.lucia_conversations set cheaper_shared_from=24000,followup_sent_at=now()-interval '40 minutes',last_inbound_at=now()-interval '24 minutes',last_outbound_at=now()-interval '21 minutes' where id=a;
    if public.lucia_send_followups(company)<>1 then raise exception 'Debía recontactar'; end if;
    if not exists(select 1 from public.lucia_messages where conversation_id=a and content like '%algo más económico%baño compartido desde $24.000 por noche%¿Quieres que te las muestre?%') then
      raise exception 'El recontacto debe ofrecer las opciones con baño compartido';
    end if;
  elsif n<>0 then
    raise exception 'Fuera de horario no se recontacta';
  end if;
end $$;

select 'lucia followups ok' as result;
rollback;
