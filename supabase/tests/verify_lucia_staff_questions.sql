\set ON_ERROR_STOP on
begin;

-- Preguntas a recepción: cada recepcionista guarda y corrige solo su propia
-- respuesta, varias pueden responder la misma pregunta, las preguntas de una
-- hostal solo se responden para esa hostal y solo se ven las hostales propias.

select id as company_id from public.companies where code='OASIS' \gset
select id as hob from public.business_units where company_id=:'company_id' and code='HOB' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set ana '00000000-0000-4000-8000-0000000a1001'
\set bea '00000000-0000-4000-8000-0000000a1002'
\set aseo '00000000-0000-4000-8000-0000000a1003'

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r, public.permissions p
where r.key='receptionist' and p.key in('lucia.inbox.view','lucia.inbox.reply')
on conflict do nothing;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 (:'ana','authenticated','authenticated','ana-recep@local.test','x',now(),now(),now()),
 (:'bea','authenticated','authenticated','bea-recep@local.test','x',now(),now(),now()),
 (:'aseo','authenticated','authenticated','aseo-recep@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'ana',(select id from public.roles where key='receptionist'),'Ana','Cobija','ana-recep@local.test','Recepcionista',:'ana'),
 (:'bea',(select id from public.roles where key='receptionist'),'Bea','Ambas','bea-recep@local.test','Recepcionista',:'ana'),
 (:'aseo',(select id from public.roles where key='housekeeping'),'Sin','Permiso','aseo-recep@local.test','Aseo',:'ana');
insert into public.user_companies(user_id,company_id) values(:'ana',:'company_id'),(:'bea',:'company_id'),(:'aseo',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values
 (:'ana',:'company_id',:'hob'),(:'bea',:'company_id',:'hob'),(:'bea',:'company_id',:'hoc'),(:'aseo',:'company_id',:'hob');

set local role authenticated;
select set_config('test.hob',:'hob',true), set_config('test.hoc',:'hoc',true),
       set_config('test.ana',:'ana',true), set_config('test.bea',:'bea',true), set_config('test.aseo',:'aseo',true);

-- Ana responde B1 y G1 para Cobija, y corrige B1.
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'ana'),true);
do $$
declare hob uuid:=current_setting('test.hob')::uuid; hoc uuid:=current_setting('test.hoc')::uuid; ok boolean;
begin
  perform public.lucia_save_staff_answer(jsonb_build_object('question_code','B1','business_unit_id',hob,'answer','Sofá cama en C1'));
  perform public.lucia_save_staff_answer(jsonb_build_object('question_code','b1','business_unit_id',hob,'answer','Sofá cama en C1 y C2'));
  perform public.lucia_save_staff_answer(jsonb_build_object('question_code','G1','business_unit_id',hob,'answer','Incluye IVA'));
  if (select count(*) from public.lucia_staff_answers where question_code='B1') <> 1 then raise exception 'Corregir no debe duplicar la respuesta'; end if;
  if (select answer from public.lucia_staff_answers where question_code='B1') <> 'Sofá cama en C1 y C2' then raise exception 'No se guardó la corrección'; end if;
  if (select author_name from public.lucia_staff_answers where question_code='B1') <> 'Ana Cobija' then raise exception 'Falta el nombre de quien respondió'; end if;

  -- Una pregunta de Cobija no se responde para otra hostal, ni a una hostal sin acceso.
  ok:=false; begin perform public.lucia_save_staff_answer(jsonb_build_object('question_code','A1','business_unit_id',hob,'answer','x')); exception when others then ok:=true; end;
  if not ok then raise exception 'A1 es de Atacama, no de Cobija'; end if;
  ok:=false; begin perform public.lucia_save_staff_answer(jsonb_build_object('question_code','C1','business_unit_id',hoc,'answer','x')); exception when others then ok:=true; end;
  if not ok then raise exception 'Ana no tiene acceso a Modulares'; end if;
  ok:=false; begin perform public.lucia_save_staff_answer(jsonb_build_object('question_code','G2','business_unit_id',hob,'answer','   ')); exception when others then ok:=true; end;
  if not ok then raise exception 'No se aceptan respuestas vacías'; end if;
  -- No puede escribir directo en la tabla.
  ok:=false; begin update public.lucia_staff_answers set answer='hack'; exception when others then ok:=true; end;
  if not ok then raise exception 'La tabla no se escribe directo'; end if;
end $$;

-- Bea agrega su respuesta a B1 sin pisar la de Ana, y responde C1 en Modulares.
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'bea'),true);
do $$
declare hob uuid:=current_setting('test.hob')::uuid; hoc uuid:=current_setting('test.hoc')::uuid;
begin
  perform public.lucia_save_staff_answer(jsonb_build_object('question_code','B1','business_unit_id',hob,'answer','También C3'));
  perform public.lucia_save_staff_answer(jsonb_build_object('question_code','C1','business_unit_id',hoc,'answer','Cama de 2 plazas'));
  if (select count(*) from public.lucia_staff_answers where question_code='B1') <> 2 then raise exception 'Deben quedar las dos respuestas de B1'; end if;
  if (select answer from public.lucia_staff_answers where question_code='B1' and user_id=current_setting('test.ana')::uuid) <> 'Sofá cama en C1 y C2' then raise exception 'Bea no debe pisar a Ana'; end if;
end $$;

-- Ana ve las respuestas de Cobija, no las de Modulares.
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'ana'),true);
do $$
begin
  if (select count(*) from public.lucia_staff_answers) <> 3 then raise exception 'Ana debe ver solo las 3 respuestas de Cobija'; end if;
end $$;

-- Sin permiso de Lucía no se responde ni se ve nada.
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'aseo'),true);
do $$
declare ok boolean:=false;
begin
  begin perform public.lucia_save_staff_answer(jsonb_build_object('question_code','B2','business_unit_id',current_setting('test.hob')::uuid,'answer','x')); exception when others then ok:=true; end;
  if not ok then raise exception 'Aseo no responde'; end if;
  if (select count(*) from public.lucia_staff_answers) <> 0 then raise exception 'Aseo no ve respuestas'; end if;
end $$;

select 'lucia staff questions ok' as result;
rollback;
