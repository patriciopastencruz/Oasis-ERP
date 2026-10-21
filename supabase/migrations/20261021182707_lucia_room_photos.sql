begin;

-- Fotos de las habitaciones para Lucía.
-- * Se suben en el ERP por hostal y tipo de habitación (bucket privado
--   'lucia-photos'; solo el ERP y el worker con la clave de servicio leen).
-- * Cuando el cliente pide fotos, Lucía indica hostal y tipo, y la base
--   encola hasta 3 imágenes que aún no se le enviaron en esa conversación.
-- * El link del álbum completo (lucia_hostels.photos_url) se envía solo en
--   el mensaje de reserva confirmada.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lucia-photos','lucia-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

alter table public.lucia_hostels add column photos_url text check(photos_url is null or (photos_url ~ '^https?://\S+$' and length(photos_url)<=500));
grant update(photos_url) on public.lucia_hostels to authenticated;

alter table public.lucia_messages add column media_path text check(media_path is null or length(media_path)<=300);

create table public.lucia_room_photos(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 room_type text not null check(length(trim(room_type)) between 1 and 120),
 object_path text not null unique check(length(object_path)<=300),
 mime_type text not null check(mime_type in('image/jpeg','image/png','image/webp')),
 size_bytes bigint not null check(size_bytes between 1 and 5242880),
 sort_order smallint not null default 0,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lucia_room_photos_type_idx on public.lucia_room_photos(company_id,business_unit_id,room_type) where deleted_at is null;
create trigger audit_lucia_room_photos after insert or update on public.lucia_room_photos for each row execute function public.audit_row_change();
alter table public.lucia_room_photos enable row level security;
create policy lucia_room_photos_read on public.lucia_room_photos for select to authenticated using(
 public.can_access_company(company_id) and (public.has_permission('lucia.settings.manage') or public.has_permission('lucia.inbox.view'))
);
revoke all on public.lucia_room_photos from public,anon;
grant select on public.lucia_room_photos to authenticated;
grant select,insert,update on public.lucia_room_photos to service_role;

-- El ERP sube el archivo con la clave de servicio después de validar el
-- permiso; esta función registra la foto con las mismas validaciones.
create or replace function public.lucia_photo_add(target_unit uuid,photo_room_type text,photo_path text,mime text,photo_size bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare h public.lucia_hostels; pid uuid;
begin
 if not public.has_permission('lucia.settings.manage') then raise exception 'Sin autorización'; end if;
 select * into h from public.lucia_hostels where business_unit_id=target_unit;
 if not found or not public.can_access_unit(h.company_id,h.business_unit_id) then raise exception 'Hostal no autorizada'; end if;
 if photo_path not like h.company_id::text||'/'||h.business_unit_id::text||'/%' then raise exception 'Ruta inválida'; end if;
 if not exists(select 1 from public.lodging_rooms r where r.business_unit_id=target_unit and r.active and r.room_type=photo_room_type) then
   raise exception 'Ese tipo de habitación no existe en la hostal';
 end if;
 if (select count(*) from public.lucia_room_photos where business_unit_id=target_unit and room_type=photo_room_type and deleted_at is null)>=6 then
   raise exception 'Máximo 6 fotos por tipo de habitación';
 end if;
 insert into public.lucia_room_photos(company_id,business_unit_id,room_type,object_path,mime_type,size_bytes,sort_order,created_by)
 values(h.company_id,h.business_unit_id,photo_room_type,photo_path,mime,photo_size,
   coalesce((select max(sort_order)+1 from public.lucia_room_photos where business_unit_id=target_unit and room_type=photo_room_type and deleted_at is null),0),auth.uid())
 returning id into pid;
 return pid;
end $$;

create or replace function public.lucia_photo_remove(target_photo uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.lucia_room_photos;
begin
 if not public.has_permission('lucia.settings.manage') then raise exception 'Sin autorización'; end if;
 select * into p from public.lucia_room_photos where id=target_photo and deleted_at is null for update;
 if not found or not public.can_access_unit(p.company_id,p.business_unit_id) then raise exception 'Foto no encontrada'; end if;
 update public.lucia_room_photos set deleted_at=now() where id=p.id;
end $$;
grant execute on function public.lucia_photo_add(uuid,text,text,text,bigint),public.lucia_photo_remove(uuid) to authenticated;
revoke execute on function public.lucia_photo_add(uuid,text,text,text,bigint),public.lucia_photo_remove(uuid) from public,anon;

-- Lucía pidió enviar fotos: hasta 3 del tipo pedido que no se hayan enviado
-- ya en esta conversación. El tipo que entrega Claude puede venir con la
-- descripción ("Mini depto: 1 cama…"), por eso se compara por prefijo.
create or replace function public.lucia_queue_photos(payload jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations; h public.lucia_hostels; unit uuid; wanted text:=lower(trim(coalesce(payload->>'room_type',''))); p record; n int:=0;
begin
 select * into c from public.lucia_conversations where id=nullif(payload->>'conversation_id','')::uuid;
 if not found or c.status='closed' then return 0; end if;
 select h2.* into h from public.lucia_hostels h2 join public.business_units bu on bu.id=h2.business_unit_id
 where h2.company_id=c.company_id and bu.code=payload->>'hostel_code' and h2.enabled;
 if not found then return 0; end if;
 for p in
   select ph.* from public.lucia_room_photos ph
   where ph.business_unit_id=h.business_unit_id and ph.deleted_at is null
     and (wanted='' or wanted like lower(ph.room_type)||'%' or lower(ph.room_type) like wanted||'%')
     and not exists(select 1 from public.lucia_messages m where m.conversation_id=c.id and m.media_path=ph.object_path)
   order by (wanted<>'' and wanted like lower(ph.room_type)||'%') desc, ph.room_type, ph.sort_order, ph.created_at
   limit 3
 loop
   insert into public.lucia_messages(company_id,business_unit_id,conversation_id,direction,sender_type,message_type,content,media_path,delivery_status,sent_at)
   values(c.company_id,c.business_unit_id,c.id,'outbound','lucia','image','📸 '||p.room_type||' · '||h.display_name,p.object_path,
     case when c.channel='simulator' then 'sent' else 'queued' end,case when c.channel='simulator' then now() end);
   n:=n+1;
 end loop;
 return n;
end $$;
revoke execute on function public.lucia_queue_photos(jsonb) from public,anon,authenticated;
grant execute on function public.lucia_queue_photos(jsonb) to service_role;

create or replace function public.lucia_claim_outbound(target_company uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.lucia_settings; m public.lucia_messages; sm public.lucia_staff_messages; recent integer; jid text;
begin
 select * into strict s from public.lucia_settings where company_id=target_company;
 if s.connection_status<>'connected' then return null; end if;
 select (select count(*) from public.lucia_messages lm join public.lucia_conversations lc on lc.id=lm.conversation_id
          where lm.company_id=target_company and lc.channel='whatsapp' and lm.direction='outbound'
            and lm.sender_type in('lucia','human') and lm.sent_at>now()-interval '1 minute' and lm.delivery_status in('sent','sending'))
      + (select count(*) from public.lucia_staff_messages where company_id=target_company and sent_at>now()-interval '1 minute' and delivery_status in('sent','sending'))
 into recent;
 if recent>=s.max_messages_per_minute then return null; end if;
 -- Un mensaje que quedó "enviando" por más de 2 minutos (worker caído) vuelve a la cola.
 update public.lucia_messages set delivery_status='queued' where company_id=target_company and delivery_status='sending' and sent_at<now()-interval '2 minutes';
 update public.lucia_staff_messages set delivery_status='queued' where company_id=target_company and delivery_status='sending' and sent_at<now()-interval '2 minutes';

 select * into m from public.lucia_messages where company_id=target_company and delivery_status='queued' order by created_at for update skip locked limit 1;
 if found then
   if m.attempts>=3 then
     update public.lucia_messages set delivery_status='failed',error_message=coalesce(error_message,'Se agotaron los reintentos') where id=m.id;
     return null;
   end if;
   select contact_jid into jid from public.lucia_conversations where id=m.conversation_id;
   update public.lucia_messages set delivery_status='sending',attempts=attempts+1,sent_at=now() where id=m.id;
   return jsonb_build_object('kind','customer','id',m.id,'conversation_id',m.conversation_id,'jid',jid,'content',m.content,
     'message_type',m.message_type,'media_path',m.media_path);
 end if;

 select * into sm from public.lucia_staff_messages where company_id=target_company and delivery_status='queued' order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 if sm.attempts>=3 then
   update public.lucia_staff_messages set delivery_status='failed',error_message=coalesce(error_message,'Se agotaron los reintentos') where id=sm.id;
   return null;
 end if;
 update public.lucia_staff_messages set delivery_status='sending',attempts=attempts+1,sent_at=now() where id=sm.id;
 return jsonb_build_object('kind','staff','id',sm.id,'conversation_id',sm.conversation_id,'jid',substr(sm.to_phone,2)||'@s.whatsapp.net','content',sm.content);
end $$;

create or replace function public.lucia_verify_payment(target_conversation uuid,paid_amount numeric,operation text) returns void language plpgsql security definer set search_path='' as $$
declare c public.lucia_conversations; h public.lucia_hostels;
begin
 c:=public.lucia_conversation_for_reply(target_conversation);
 select * into h from public.lucia_hostels where company_id=c.company_id and business_unit_id=c.business_unit_id;
 if not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Hostal no autorizada'; end if;
 if c.booking_status not in('awaiting_payment','proof_received') then raise exception 'No hay un pago pendiente en esta conversación'; end if;
 if paid_amount is null or paid_amount<=0 then raise exception 'Indica el monto recibido'; end if;
 if not exists(select 1 from public.lodging_reservations where id=c.reservation_id and status='pending') then
   raise exception 'La reserva pendiente ya no está vigente (pudo vencer o anularse)';
 end if;
 insert into public.lodging_reservation_payments(company_id,business_unit_id,reservation_id,type,payment_method,amount,operation_number,notes,registered_by)
 values(c.company_id,c.business_unit_id,c.reservation_id,case when paid_amount>=c.booking_total then 'total' else 'deposit' end,'transfer',paid_amount,
   nullif(trim(operation),''),'Pago por transferencia recibido vía WhatsApp (Lucía)',auth.uid());
 update public.lodging_reservations set status='confirmed',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=c.reservation_id;
 update public.lucia_conversations set booking_status='confirmed',prospect_status='confirmed',hold_expires_at=null,
   payment_verified_by=auth.uid(),payment_verified_at=now(),needs_review=false,review_reason=null,updated_at=now()
 where id=c.id returning * into c;
 perform public.lucia_enqueue_outbound(c,'lucia',null,
   '🎉 ¡Recibimos tu pago de '||public.lucia_clp(paid_amount)||' y tu reserva quedó confirmada!'||E'\n'||public.lucia_booking_summary(c)||E'\n\n'||
   case when paid_amount<c.booking_total then 'El saldo de '||public.lucia_clp(c.booking_total-paid_amount)||' se paga al llegar. ' else '' end||
   '¡Te esperamos! 🙌'||
   coalesce(E'\n\n'||'📸 Aquí puedes ver más fotos de '||h.display_name||': '||nullif(trim(h.photos_url),''),''),null);
end $$;

commit;
