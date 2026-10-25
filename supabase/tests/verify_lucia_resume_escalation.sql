\set ON_ERROR_STOP on
begin;

-- Al vencer la pausa, Lucía retoma los chats con mensajes del cliente sin
-- responder; y un caso derivado sin respuesta del equipo en 30 minutos se
-- avisa una vez al grupo del equipo.

select id as company_id from public.companies where code='OASIS' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset
update public.lucia_hostels set manager_name='Kathya', admin_phones=array['+56970000501'] where business_unit_id=:'hoc';
update public.lucia_settings set staff_group_jid='120363000000000001@g.us';

select set_config('lucia.company',:'company_id',true);
select set_config('lucia.hoc',:'hoc',true);
set local role service_role;

do $$
declare company uuid:=current_setting('lucia.company')::uuid; hoc uuid:=current_setting('lucia.hoc')::uuid; r jsonb; a uuid; b uuid; ids uuid[]; n int;
  local_time time:=(now() at time zone 'America/Santiago')::time;
begin
  -- Retomar: A tiene la pausa vencida y un mensaje del cliente sin responder.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981240001@s.whatsapp.net','phone','+56981240001','external_id','RE1','push_name','Ana','content','¿Sigue disponible?'));
  a:=(r->>'conversation_id')::uuid;
  update public.lucia_conversations set paused_until=now()-interval '1 minute' where id=a;
  select array_agg(x) into ids from public.lucia_resume_after_pause(company) x;
  if not (a = any(ids)) then raise exception 'Debía retomar el chat con la pausa vencida'; end if;
  if (select paused_until from public.lucia_conversations where id=a) is not null then raise exception 'Debía quitar la pausa'; end if;
  select array_agg(x) into ids from public.lucia_resume_after_pause(company) x;
  if a = any(coalesce(ids,'{}')) then raise exception 'No se retoma dos veces'; end if;

  -- Escalar: B fue derivado hace 40 minutos y nadie del equipo respondió.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981240002@s.whatsapp.net','phone','+56981240002','external_id','RE2','push_name','María','content','¿Mi reserva?'));
  b:=(r->>'conversation_id')::uuid;
  update public.lucia_conversations set business_unit_id=hoc, hostel_assigned=true, needs_review=true, review_reason='Consulta por una reserva existente' where id=b;
  if (select review_requested_at from public.lucia_conversations where id=b) is null then raise exception 'Debía registrar cuándo se pidió ayuda'; end if;
  update public.lucia_conversations set review_requested_at=now()-interval '40 minutes' where id=b;

  n:=public.lucia_escalate_unanswered(company);
  if local_time between time '08:00' and time '23:30' then
    if n<1 then raise exception 'Debía avisar al grupo'; end if;
    if not exists(select 1 from public.lucia_staff_messages where conversation_id=b and to_jid='120363000000000001@g.us'
                  and content like '⚠️ Cliente sin respuesta%Kathya%María%Consulta por una reserva existente%/chats/'||b) then
      raise exception 'El aviso al grupo debe decir hostal, encargada, cliente, motivo y link';
    end if;
    if public.lucia_escalate_unanswered(company)<>0 then raise exception 'Un solo aviso por caso'; end if;
    -- Si el equipo responde, un caso nuevo no se escala hasta otros 30 minutos sin respuesta.
    insert into public.lucia_messages(company_id,business_unit_id,conversation_id,direction,sender_type,content,delivery_status,sent_at)
    values(company,hoc,b,'outbound','human','Hola María, lo reviso','sent',now());
    update public.lucia_conversations set review_requested_at=now()-interval '40 minutes', escalated_at=now()-interval '50 minutes' where id=b;
    if public.lucia_escalate_unanswered(company)<>0 then raise exception 'Con respuesta del equipo no se escala'; end if;
  elsif n<>0 then
    raise exception 'De noche no se avisa al grupo';
  end if;
end $$;

select 'lucia resume escalation ok' as result;
rollback;
