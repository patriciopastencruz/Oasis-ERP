\set ON_ERROR_STOP on
begin;

-- Derivación a una persona: al marcar revisión se avisa una sola vez por
-- WhatsApp (encargado + administradores de la hostal, o administradores de
-- todas si la hostal no está clara) y en el ERP; el simulador no avisa.

select id as company_id from public.companies where code='OASIS' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set recep '00000000-0000-4000-8000-0000000d3001'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values(:'recep','authenticated','authenticated','lucia-review@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by)
values(:'recep',(select id from public.roles where key='general_manager'),'Recepción','Centro','lucia-review@local.test','Pruebas',:'recep');
insert into public.user_companies(user_id,company_id) values(:'recep',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'recep',:'company_id',:'hoc');

update public.lucia_hostels set manager_phone=null, admin_phones='{}';
update public.lucia_hostels set manager_phone='+56970000101', admin_phones=array['+56970000102'] where business_unit_id=:'hoc';
update public.lucia_hostels set admin_phones=array['+56970000102','+56970000103'] where business_unit_id<>:'hoc';

select set_config('lucia.company',:'company_id',true);
select set_config('lucia.hoc',:'hoc',true);
set local role service_role;

do $$
declare company uuid:=current_setting('lucia.company')::uuid; hoc uuid:=current_setting('lucia.hoc')::uuid; r jsonb; a uuid; b uuid;
begin
  -- A: con hostal asignada (Modulares).
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981230001@s.whatsapp.net','phone','+56981230001','external_id','RV1','push_name','Ana','content','Hola'));
  a:=(r->>'conversation_id')::uuid;
  update public.lucia_conversations set business_unit_id=hoc, hostel_assigned=true where id=a;
  perform public.lucia_record_draft(jsonb_build_object('conversation_id',a,'content','Le aviso al encargado.','intent','other','needs_human',true,'reason','Consulta por una reserva existente','extracted','{}'::jsonb));
  if (select count(*) from public.lucia_staff_messages where conversation_id=a and content like '🔔 Lucía necesita ayuda%Consulta por una reserva existente%') <> 2 then
    raise exception 'Debe avisar al encargado y al administrador de Modulares';
  end if;
  if not exists(select 1 from public.notifications where entity_id=a and event_key='lucia.needs_review') then
    raise exception 'Debe quedar el aviso en el ERP';
  end if;
  -- Un segundo borrador con revisión pendiente no repite el aviso.
  perform public.lucia_record_draft(jsonb_build_object('conversation_id',a,'content','Sigue pendiente.','intent','other','needs_human',true,'reason','Otra vez','extracted','{}'::jsonb));
  if (select count(*) from public.lucia_staff_messages where conversation_id=a and content like '🔔%') <> 2 then
    raise exception 'No se repite el aviso mientras la revisión siga pendiente';
  end if;

  -- B: sin hostal clara: avisa a los administradores de todas, sin duplicar.
  r:=public.lucia_ingest_message(jsonb_build_object('company_id',company,'jid','56981230002@s.whatsapp.net','phone','+56981230002','external_id','RV2','push_name','Kata','content','Ola'));
  b:=(r->>'conversation_id')::uuid;
  update public.lucia_conversations set hostel_assigned=false where id=b;
  perform public.lucia_record_draft(jsonb_build_object('conversation_id',b,'content','Le aviso al encargado.','intent','other','needs_human',true,'reason','Reserva de María Molina','extracted','{}'::jsonb));
  if (select array_agg(to_phone order by to_phone) from public.lucia_staff_messages where conversation_id=b and content like '🔔%')
     <> array['+56970000102','+56970000103'] then
    raise exception 'Sin hostal clara: un aviso a cada administrador, sin duplicar: %',
      (select array_agg(to_phone) from public.lucia_staff_messages where conversation_id=b);
  end if;
end $$;

select 'lucia review alerts ok' as result;
rollback;
