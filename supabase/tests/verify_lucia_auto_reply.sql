\set ON_ERROR_STOP on
begin;

-- Verifica cuándo Lucía responde sola (etapa 2) y cuándo deja borrador.

select id as company_id from public.companies where code='OASIS' \gset
select set_config('lucia.company',:'company_id',true);
set local role service_role;

do $$
declare
 company uuid:=current_setting('lucia.company')::uuid;
 r jsonb; conv uuid; did uuid; res jsonb;
 draft_args jsonb;
begin
  update public.lucia_settings set budget_exceeded_on=null where company_id=company;
  update public.lucia_hostels set mode='draft' where company_id=company;

  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56944444444@s.whatsapp.net','phone','+56944444444','external_id','A1','content','Hola, ¿tienen wifi?'));
  conv:=(r->>'conversation_id')::uuid;
  draft_args:=jsonb_build_object('conversation_id',conv,'content','¡Hola! Sí, tenemos wifi gratis.','intent','faq','needs_human',false,'extracted','{}'::jsonb);

  -- Modo borrador: no se envía.
  did:=public.lucia_record_draft(draft_args);
  res:=public.lucia_auto_send_draft(did,(select id from public.lucia_messages where conversation_id=(select conversation_id from public.lucia_drafts where id=did) and direction='inbound' order by created_at desc, id limit 1));
  if (res->>'sent')::boolean then raise exception 'En modo borrador no debe enviarse solo'; end if;

  -- Sin hostal asignada y solo algunas en automático: no se envía.
  update public.lucia_hostels set mode='auto' where company_id=company and business_unit_id=(select id from public.business_units where code='HU' and company_id=company);
  did:=public.lucia_record_draft(draft_args);
  res:=public.lucia_auto_send_draft(did,(select id from public.lucia_messages where conversation_id=(select conversation_id from public.lucia_drafts where id=did) and direction='inbound' order by created_at desc, id limit 1));
  if res->>'reason'<>'draft_mode' then raise exception 'Sin hostal, todas deben estar en automático: %',res; end if;

  -- Todas en automático: se envía y queda en cola para WhatsApp.
  update public.lucia_hostels set mode='auto' where company_id=company;
  did:=public.lucia_record_draft(draft_args);
  res:=public.lucia_auto_send_draft(did,(select id from public.lucia_messages where conversation_id=(select conversation_id from public.lucia_drafts where id=did) and direction='inbound' order by created_at desc, id limit 1));
  if not (res->>'sent')::boolean then raise exception 'Debía enviarse solo: %',res; end if;
  if (select delivery_status from public.lucia_messages where id=(res->>'message_id')::uuid)<>'queued' then raise exception 'Debe quedar en cola'; end if;
  if not (select auto_sent from public.lucia_drafts where id=did) then raise exception 'Falta marcar envío automático'; end if;
  res:=public.lucia_auto_send_draft(did,(select id from public.lucia_messages where conversation_id=(select conversation_id from public.lucia_drafts where id=did) and direction='inbound' order by created_at desc, id limit 1));
  if (res->>'sent')::boolean then raise exception 'No se envía dos veces'; end if;

  -- Caso para una persona: queda como borrador.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56944444444@s.whatsapp.net','phone','+56944444444','external_id','A2','content','Quiero reservar'));
  did:=public.lucia_record_draft(draft_args||jsonb_build_object('needs_human',true,'reason','Quiere reservar'));
  res:=public.lucia_auto_send_draft(did,(select id from public.lucia_messages where conversation_id=(select conversation_id from public.lucia_drafts where id=did) and direction='inbound' order by created_at desc, id limit 1));
  if res->>'reason'<>'needs_human' then raise exception 'Una reserva debe quedar para una persona: %',res; end if;
  -- La marca de revisión se mantiene: el siguiente mensaje tampoco sale solo.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56944444444@s.whatsapp.net','phone','+56944444444','external_id','A3','content','¿y el wifi?'));
  did:=public.lucia_record_draft(draft_args);
  res:=public.lucia_auto_send_draft(did,(select id from public.lucia_messages where conversation_id=(select conversation_id from public.lucia_drafts where id=did) and direction='inbound' order by created_at desc, id limit 1));
  if (res->>'sent')::boolean then raise exception 'Con revisión pendiente no debe responder sola'; end if;

  -- Llegó otro mensaje después del borrador: no se envía uno desactualizado.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56955555555@s.whatsapp.net','phone','+56955555555','external_id','B1','content','Hola'));
  conv:=(r->>'conversation_id')::uuid;
  did:=public.lucia_record_draft(jsonb_build_object('conversation_id',conv,'content','¡Hola!','intent','greeting','needs_human',false,'extracted','{}'::jsonb));
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56955555555@s.whatsapp.net','phone','+56955555555','external_id','B2','content','¿tienen desayuno?'));
  -- En una sola transacción now() no avanza: se simula que B2 llegó después.
  update public.lucia_messages set created_at=created_at+interval '5 seconds' where external_id='B2';
  res:=public.lucia_auto_send_draft(did,(select id from public.lucia_messages where external_id='B1'));
  if (res->>'sent')::boolean then raise exception 'No debe enviarse un borrador viejo'; end if;

  -- Tope de gasto superado: no se envía.
  did:=public.lucia_record_draft(jsonb_build_object('conversation_id',conv,'content','Sí, desayuno incluido.','intent','faq','needs_human',false,'extracted','{}'::jsonb));
  update public.lucia_settings set budget_exceeded_on=(now() at time zone 'America/Santiago')::date where company_id=company;
  res:=public.lucia_auto_send_draft(did,(select id from public.lucia_messages where conversation_id=(select conversation_id from public.lucia_drafts where id=did) and direction='inbound' order by created_at desc, id limit 1));
  if res->>'reason'<>'budget' then raise exception 'Con el tope superado queda en borrador: %',res; end if;
end $$;

select 'lucia auto reply ok' as result;
rollback;
