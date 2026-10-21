\set ON_ERROR_STOP on
begin;

-- Fotos a pedido: máximo 3 por vez, del tipo pedido (aunque Claude lo
-- nombre con descripción), sin repetir las ya enviadas en la conversación.

select id as company_id from public.companies where code='OASIS' \gset
select id as hob from public.business_units where company_id=:'company_id' and code='HOB' \gset
insert into public.lodging_rooms(company_id,business_unit_id,code,name,room_type,capacity,base_rate,display_order)
values(:'company_id',:'hob','LF1','Foto 1','Mini depto',3,27000,990),(:'company_id',:'hob','LF2','Foto 2','Simple matrimonial',2,24000,991);
insert into public.lucia_room_photos(company_id,business_unit_id,room_type,object_path,mime_type,size_bytes,sort_order)
select :'company_id',:'hob','Mini depto',:'company_id'||'/'||:'hob'||'/mini-'||g||'.jpg','image/jpeg',1000,g from generate_series(1,4) g;
insert into public.lucia_room_photos(company_id,business_unit_id,room_type,object_path,mime_type,size_bytes)
values(:'company_id',:'hob','Simple matrimonial',:'company_id'||'/'||:'hob'||'/simple.jpg','image/jpeg',1000);

select set_config('lucia.company',:'company_id',true);
set local role service_role;
do $$
declare company uuid:=current_setting('lucia.company')::uuid; r jsonb; conv uuid; n int; j jsonb;
begin
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56983333333@s.whatsapp.net','phone','+56983333333','external_id','P1','content','¿Tienen fotos del mini depto?'));
  conv:=(r->>'conversation_id')::uuid;
  n:=public.lucia_queue_photos(jsonb_build_object('conversation_id',conv,'hostel_code','HOB','room_type','Mini depto: 1 cama matrimonial, cocina y baño privado'));
  if n<>3 then raise exception 'Debían encolarse 3 fotos, se encolaron %',n; end if;
  if exists(select 1 from public.lucia_messages where conversation_id=conv and media_path like '%simple%') then raise exception 'Solo fotos del tipo pedido'; end if;
  n:=public.lucia_queue_photos(jsonb_build_object('conversation_id',conv,'hostel_code','HOB','room_type','Mini depto'));
  if n<>1 then raise exception 'Solo queda 1 foto sin enviar, se encolaron %',n; end if;
  n:=public.lucia_queue_photos(jsonb_build_object('conversation_id',conv,'hostel_code','HOB','room_type','Mini depto'));
  if n<>0 then raise exception 'No se repiten fotos'; end if;

  perform public.lucia_worker_status(jsonb_build_object('company_id',company,'status','connected'));
  update public.lucia_settings set max_messages_per_minute=30 where company_id=company;
  j:=public.lucia_claim_outbound(company);
  if j->>'message_type'<>'image' or j->>'media_path' not like '%/mini-1.jpg' then raise exception 'El worker debe recibir la imagen a enviar: %',j; end if;
end $$;

select 'lucia photos ok' as result;
rollback;
