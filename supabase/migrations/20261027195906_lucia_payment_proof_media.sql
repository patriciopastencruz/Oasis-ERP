begin;

-- El aviso de "comprobante recibido" lleva el comprobante adjunto.
-- * El worker guarda cada imagen o PDF que manda un cliente en el bucket
--   privado 'lucia-media' (solo la clave de servicio lee) y pasa la ruta.
-- * El mensaje del cliente queda con esa ruta y el aviso al encargado y a
--   los administradores se envía como imagen o documento con el texto del
--   aviso como descripción.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lucia-media','lucia-media',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do nothing;

alter table public.lucia_staff_messages
  add column media_path text check(media_path is null or length(media_path)<=300),
  add column media_kind text check(media_kind is null or media_kind in('image','document')),
  add column media_name text check(media_name is null or length(media_name)<=200);

-- Ruta válida: dentro de la carpeta de la empresa, como la sube el worker.
create or replace function public.lucia_media_path(c public.lucia_conversations, file_path text) returns text
language sql immutable set search_path = '' as $$
  select case when file_path like c.company_id::text||'/%' and length(file_path)<=300 and file_path !~ '\.\.' then file_path end
$$;
revoke execute on function public.lucia_media_path(public.lucia_conversations, text) from public, anon, authenticated;

create or replace function public.lucia_message_manager_with_media(
  file_path text, file_kind text, file_name text, c public.lucia_conversations, body text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_path text := public.lucia_media_path(c, file_path);
begin
  if c.channel <> 'whatsapp' then return; end if;
  if v_path is null or file_kind not in ('image', 'document') then
    perform public.lucia_message_manager(c, body);
    return;
  end if;
  insert into public.lucia_staff_messages(company_id, business_unit_id, conversation_id, to_phone, content, media_path, media_kind, media_name)
  select distinct c.company_id, c.business_unit_id, c.id, p.phone, left(body, 4000), v_path, file_kind,
    left(nullif(trim(file_name), ''), 200)
  from public.lucia_hostels h
  cross join lateral unnest(array_prepend(h.manager_phone, h.admin_phones)) as p(phone)
  where h.company_id = c.company_id and h.business_unit_id = c.business_unit_id and p.phone is not null;
end $$;
revoke execute on function public.lucia_message_manager_with_media(text, text, text, public.lucia_conversations, text) from public, anon, authenticated;

-- El comprobante ya tiene su propio aviso (con el archivo): no se repite el
-- aviso genérico de "Lucía necesita ayuda".
create or replace function public.lucia_conversation_review_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.needs_review and not old.needs_review
     and not (new.booking_status = 'proof_received' and old.booking_status is distinct from 'proof_received') then
    perform public.lucia_alert_review(new);
  end if;
  return new;
end $$;
revoke execute on function public.lucia_conversation_review_alert() from public, anon, authenticated;

-- Solo cambian dos puntos de la función vigente para no reescribir el resto.
do $$
declare
  def text := pg_get_functiondef('public.lucia_ingest_message(jsonb)'::regprocedure);
  old_dup text := 'if mid is null then return jsonb_build_object(''status'',''duplicate'',''conversation_id'',conv.id); end if;';
  old_proof text := 'perform public.lucia_message_manager(conv,''💸';
begin
  if position(old_dup in def) = 0 or position(old_proof in def) = 0 then
    raise exception 'lucia_ingest_message cambió: revisar el aviso del comprobante';
  end if;
  def := replace(def, old_dup, old_dup||E'\n'||
    ' update public.lucia_messages set media_path=public.lucia_media_path(conv,payload->>''media_path'') where id=mid and not from_me and payload->>''media_path'' is not null;');
  def := replace(def, old_proof,
    'perform public.lucia_message_manager_with_media(payload->>''media_path'',mtype,payload->>''media_name'',conv,''💸');
  execute def;
end $$;

do $$
declare
  def text := pg_get_functiondef('public.lucia_claim_outbound(uuid)'::regprocedure);
  old_tail text := '''content'',sm.content);';
begin
  if position(old_tail in def) = 0 then
    raise exception 'lucia_claim_outbound cambió: revisar los avisos con archivo';
  end if;
  execute replace(def, old_tail,
    '''content'',sm.content,''message_type'',coalesce(sm.media_kind,''text''),''media_path'',sm.media_path,''media_name'',sm.media_name);');
end $$;

commit;
