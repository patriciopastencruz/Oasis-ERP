\set ON_ERROR_STOP on
begin;

-- Verifica el check-in online: solo recepción con permiso crea el link, uno
-- vigente por reserva, el huésped ve su estadía sin precios, envía sus datos
-- (que pasan a la ficha y a la reserva) y el link deja de servir al revocarlo
-- o anular la reserva. La foto del documento es obligatoria y debe estar en
-- la carpeta de la reserva.

select id as company_id from public.companies where code='OASIS' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set clerk '00000000-0000-4000-8000-0000000d4001'
\set maid '00000000-0000-4000-8000-0000000d4002'
\set room '00000000-0000-4000-8000-0000000d4101'
\set guest '00000000-0000-4000-8000-0000000d4201'
\set res '00000000-0000-4000-8000-0000000d4301'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select v::uuid,'authenticated','authenticated',v||'@checkin.test','x',now(),now(),now() from unnest(array[:'clerk',:'maid']) v;
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'clerk',(select id from public.roles where key='receptionist'),'Carla','Recepción',:'clerk'||'@checkin.test','Pruebas',:'clerk'),
 (:'maid',(select id from public.roles where key='housekeeping'),'María','Aseo',:'maid'||'@checkin.test','Pruebas',:'clerk');
insert into public.user_companies(user_id,company_id) select v::uuid,:'company_id' from unnest(array[:'clerk',:'maid']) v;
insert into public.user_business_units(user_id,company_id,business_unit_id) select v::uuid,:'company_id',:'hoc' from unnest(array[:'clerk',:'maid']) v;
insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,display_order) values(:'room',:'company_id',:'hoc','CK1','Check 1',96);
insert into public.lodging_guests(id,company_id,business_unit_id,full_name,phone) values(:'guest',:'company_id',:'hoc','Reserva Booking — información pendiente','0');
insert into public.lodging_reservations(id,company_id,business_unit_id,room_id,guest_id,origin,status,check_in,check_out,nightly_rate,total_value)
values(:'res',:'company_id',:'hoc',:'room',:'guest','booking','confirmed',current_date+1,current_date+3,30000,60000);

create temp table ctx(token text);
grant select,insert,update on ctx to authenticated,service_role;
set local role authenticated;

-- ---------- Aseo no crea links; recepción sí ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'maid'),true);
do $$ declare failed boolean := false;
begin
  begin perform public.lodging_checkin_link_create('00000000-0000-4000-8000-0000000d4301'); exception when others then failed := sqlerrm like '%Sin autorizacion%'; end;
  if not failed then raise exception 'Aseo creó un link'; end if;
end $$;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk'),true);
do $$ declare t1 text; t2 text;
begin
  t1 := public.lodging_checkin_link_create('00000000-0000-4000-8000-0000000d4301');
  t2 := public.lodging_checkin_link_create('00000000-0000-4000-8000-0000000d4301');
  if t1 = t2 or t2 !~ '^[a-f0-9]{48}$' then raise exception 'Token nuevo'; end if;
  if (select count(*) from public.lodging_checkin_links where reservation_id='00000000-0000-4000-8000-0000000d4301' and revoked_at is null) is distinct from 1::bigint then raise exception 'Un solo link vigente'; end if;
  insert into ctx values(t2);
  -- El huésped no puede usar funciones de servicio desde una sesión normal.
  begin perform public.lodging_checkin_get(t2); raise exception 'get expuesto'; exception when insufficient_privilege then null; end;
end $$;

-- ---------- Huésped (vía servidor con service_role) ----------
reset role;
set local role service_role;
do $$ declare t text := (select token from ctx); g jsonb; failed boolean := false;
begin
  if public.lodging_checkin_get('0'||substr(t,2)) is not null and substr(t,1,1)<>'0' then raise exception 'Token ajeno'; end if;
  g := public.lodging_checkin_get(t);
  if g->>'room' is distinct from 'Check 1' or g ? 'total_value' or g::text like '%60000%' then raise exception 'Datos visibles: %',g; end if;
  if g->'data'->>'full_name' is not null then raise exception 'No muestra el texto de Booking como nombre'; end if;
  begin perform public.lodging_checkin_submit(t,'{"full_name":"Juan Pérez","document":"12345678-9","nationality":"Chilena","phone":"+56911111111"}'); exception when others then failed := sqlerrm like '%normas%'; end;
  if not failed then raise exception 'Debe aceptar normas'; end if;
  -- Sin foto del documento no se envía; una ruta fuera de la carpeta de la reserva se rechaza.
  failed := false;
  begin perform public.lodging_checkin_submit(t,'{"full_name":"Juan Pérez","document":"12345678-9","nationality":"Chilena","phone":"+56911111111","accept_rules":true}'); exception when others then failed := sqlerrm like '%foto de tu documento%'; end;
  if not failed then raise exception 'Exige la foto'; end if;
  failed := false;
  begin perform public.lodging_checkin_submit(t,jsonb_build_object('full_name','Juan Pérez','document','12345678-9','nationality','Chilena','phone','+56911111111','accept_rules',true,
    'document_front_path','00000000-0000-0000-0000-000000000000/x/y/a.jpg')); exception when others then failed := sqlerrm like '%Foto invalida%'; end;
  if not failed then raise exception 'Ruta ajena'; end if;
  if public.lodging_checkin_upload_prefix(t) is distinct from (select company_id||'/'||business_unit_id||'/'||id||'/' from public.lodging_reservations where id='00000000-0000-4000-8000-0000000d4301') then raise exception 'Carpeta'; end if;
  perform public.lodging_checkin_submit(t,'{"full_name":"Juan Pérez","document":"12345678-9","nationality":"Chilena","email":"JUAN@MAIL.CL","phone":"+56911111111","estimated_arrival":"15:30","estimated_departure":"11:00","license_plate":"ab12cd","accept_rules":true,"companions":[{"full_name":"Ana Soto","document":"98765432-1"},{"full_name":""}]}'::jsonb
    ||jsonb_build_object('document_front_path',public.lodging_checkin_upload_prefix(t)||'11111111-1111-4111-8111-111111111111.jpg'));
  g := public.lodging_checkin_get(t);
  if g->>'submitted_at' is null or jsonb_array_length(g->'data'->'companions') <> 1 or not (g->>'has_document_front')::boolean then raise exception 'Envío guardado: %',g; end if;
  -- Corrección sin foto nueva conserva la anterior; con foto nueva informa la reemplazada.
  perform public.lodging_checkin_submit(t,'{"full_name":"Juan Pérez","document":"12345678-9","nationality":"Chilena","phone":"+56911111111","accept_rules":true}');
  if (public.lodging_checkin_submit(t,jsonb_build_object('full_name','Juan Pérez','document','12345678-9','nationality','Chilena','phone','+56911111111','accept_rules',true,
      'document_front_path',public.lodging_checkin_upload_prefix(t)||'22222222-2222-4222-8222-222222222222.jpg'))->'replaced'->>0) not like '%11111111-1111%' then raise exception 'Foto reemplazada'; end if;
end $$;
reset role;
do $$
begin
  if (select full_name||'|'||document||'|'||email from public.lodging_guests where id='00000000-0000-4000-8000-0000000d4201') is distinct from 'Juan Pérez|12345678-9|juan@mail.cl' then raise exception 'Ficha del huésped'; end if;
  if (select to_char(estimated_arrival,'HH24:MI')||'|'||to_char(estimated_departure,'HH24:MI')||'|'||license_plate from public.lodging_reservations where id='00000000-0000-4000-8000-0000000d4301') is distinct from '15:30|11:00|AB12CD' then raise exception 'Reserva'; end if;
  if not exists(select 1 from public.notifications where recipient_id='00000000-0000-4000-8000-0000000d4001' and event_key='lodging.checkin.submitted') then raise exception 'Aviso a recepción'; end if;
  if (select document_front_path from public.lodging_checkin_links where token=(select token from ctx)) not like '%22222222-2222%' then raise exception 'Ruta guardada'; end if;
  -- Al anular la reserva, el link deja de funcionar.
  update public.lodging_reservations set status='cancelled' where id='00000000-0000-4000-8000-0000000d4301';
  if public.lodging_checkin_get((select token from ctx)) is not null then raise exception 'Link de reserva anulada'; end if;
end $$;

select 'lodging checkin links ok' as result;
rollback;
