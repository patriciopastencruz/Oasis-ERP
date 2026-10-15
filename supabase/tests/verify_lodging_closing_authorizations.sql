\set ON_ERROR_STOP on
begin;

-- Verifica el cierre de fechas anteriores con autorización: recepción no
-- cierra antes de ayer sin autorización, la pide con motivo, administración
-- aprueba o rechaza, la aprobación habilita guardar y emitir esa fecha durante
-- 48 horas y quien puede autorizar queda aprobado al pedirla.

select id as company_id from public.companies where code='OASIS' \gset
select id as hu from public.business_units where company_id=:'company_id' and code='HU' \gset
\set admin '00000000-0000-4000-8000-0000000d2001'
\set clerk '00000000-0000-4000-8000-0000000d2002'

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select v::uuid,'authenticated','authenticated',v||'@closeauth.test','x',now(),now(),now() from unnest(array[:'admin',:'clerk']) v;
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
 (:'admin',(select id from public.roles where key='administrator'),'Ana','Admin',:'admin'||'@closeauth.test','Pruebas',:'admin'),
 (:'clerk',(select id from public.roles where key='receptionist'),'Carla','Recepción',:'clerk'||'@closeauth.test','Pruebas',:'admin');
insert into public.user_companies(user_id,company_id) select v::uuid,:'company_id' from unnest(array[:'admin',:'clerk']) v;
insert into public.user_business_units(user_id,company_id,business_unit_id) select v::uuid,:'company_id',:'hu' from unnest(array[:'admin',:'clerk']) v;
-- La prueba no depende de cierres existentes en esas fechas.
delete from public.lodging_daily_closings where business_unit_id=:'hu' and closing_date in(current_date-20,current_date-21,current_date-22);

create function pg_temp.expire(u uuid,d date) returns void language sql security definer as $$
 update public.lodging_closing_authorizations set expires_at=now()-interval '1 minute' where business_unit_id=u and closing_date=d and status='approved' $$;
create temp table ctx(id uuid);
grant select,insert,update on ctx to authenticated;
set local role authenticated;

-- ---------- Recepción: sin autorización no cierra ni pide hoy/ayer ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk'),true);
do $$ declare failed boolean := false; hu uuid := (select id from public.business_units where code='HU'); d date := (now() at time zone 'America/Santiago')::date-20; r jsonb;
begin
  begin perform public.lodging_save_daily_closing(hu,d,'{}'); exception when others then failed := sqlerrm like '%necesitas autorizacion%'; end;
  if not failed then raise exception 'Cerró sin autorización'; end if;
  failed := false;
  begin perform public.lodging_closing_authorization_request(hu,d+19,'Olvidé cerrar'); exception when others then failed := sqlerrm like '%sin autorizacion%'; end;
  if not failed then raise exception 'Ayer no requiere autorización'; end if;
  failed := false;
  begin perform public.lodging_closing_authorization_request(hu,d,'x'); exception when others then failed := sqlerrm like '%motivo%'; end;
  if not failed then raise exception 'Motivo obligatorio'; end if;
  r := public.lodging_closing_authorization_request(hu,d,'Se cortó la luz y no alcancé a cerrar');
  if (r->>'approved')::boolean then raise exception 'Recepción no se autoriza sola'; end if;
  insert into ctx values((r->>'id')::uuid);
  failed := false;
  begin perform public.lodging_closing_authorization_request(hu,d,'Otra vez la misma fecha'); exception when others then failed := sqlerrm like '%pendiente%'; end;
  if not failed then raise exception 'Duplicada'; end if;
  failed := false;
  begin perform public.lodging_closing_authorization_decide((select id from ctx),true,null); exception when others then failed := sqlerrm like '%Sin autorizacion%'; end;
  if not failed then raise exception 'Recepción se aprobó'; end if;
end $$;

reset role;
do $$
begin
  if not exists(select 1 from public.notifications where recipient_id='00000000-0000-4000-8000-0000000d2001' and event_key='lodging.closing_authorization.review_assigned') then raise exception 'Aviso al administrador'; end if;
end $$;
set local role authenticated;

-- ---------- Administración aprueba ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin'),true);
do $$ declare failed boolean := false;
begin
  begin perform public.lodging_closing_authorization_decide((select id from ctx),false,''); exception when others then failed := sqlerrm like '%motivo del rechazo%'; end;
  if not failed then raise exception 'Rechazo sin motivo'; end if;
  perform public.lodging_closing_authorization_decide((select id from ctx),true,null);
  failed := false;
  begin perform public.lodging_closing_authorization_decide((select id from ctx),true,null); exception when others then failed := sqlerrm like '%ya fue resuelta%'; end;
  if not failed then raise exception 'Doble decisión'; end if;
end $$;

-- ---------- Recepción cierra la fecha autorizada ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk'),true);
do $$ declare hu uuid := (select id from public.business_units where code='HU'); d date := (now() at time zone 'America/Santiago')::date-20; cid uuid; failed boolean := false;
begin
  cid := public.lodging_save_daily_closing(hu,d,'{"observations":"Cierre atrasado autorizado"}');
  perform public.lodging_issue_daily_closing(cid);
  if (select status from public.lodging_daily_closings where id=cid) is distinct from 'issued' then raise exception 'Emitido'; end if;
  -- Otra fecha sigue bloqueada.
  begin perform public.lodging_save_daily_closing(hu,d-1,'{}'); exception when others then failed := sqlerrm like '%necesitas autorizacion%'; end;
  if not failed then raise exception 'La autorización es solo para su fecha'; end if;
  -- Vencida, vuelve a bloquear.
  perform pg_temp.expire(hu,d);
  failed := false;
  begin perform public.lodging_save_daily_closing(hu,d,'{}'); exception when others then failed := sqlerrm like '%necesitas autorizacion%'; end;
  if not failed then raise exception 'Autorización vencida'; end if;
end $$;

-- ---------- Quien autoriza queda aprobado al pedir; rechazo avisa ----------
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin'),true);
do $$ declare hu uuid := (select id from public.business_units where code='HU'); d date := (now() at time zone 'America/Santiago')::date-22; r jsonb;
begin
  r := public.lodging_closing_authorization_request(hu,d,'Corrección pedida por gerencia');
  if not (r->>'approved')::boolean then raise exception 'Administración aprobada al instante'; end if;
end $$;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'clerk'),true);
do $$ declare r jsonb; begin
  r := public.lodging_closing_authorization_request((select id from public.business_units where code='HU'),(now() at time zone 'America/Santiago')::date-21,'Faltó registrar un gasto');
  update ctx set id=(r->>'id')::uuid;
end $$;
select set_config('request.jwt.claims',format('{"sub":"%s","role":"authenticated"}',:'admin'),true);
do $$ begin perform public.lodging_closing_authorization_decide((select id from ctx),false,'Ese día ya está cuadrado'); end $$;

reset role;
do $$
begin
  if not exists(select 1 from public.notifications where recipient_id='00000000-0000-4000-8000-0000000d2002' and event_key='lodging.closing_authorization.decided' and title='Cierre no autorizado') then raise exception 'Aviso de rechazo'; end if;
  if (select count(*) from public.audit_logs where entity_type='lodging_closing_authorizations' and actor_id='00000000-0000-4000-8000-0000000d2001')=0 then raise exception 'Auditoría'; end if;
end $$;

select 'lodging closing authorizations ok' as result;
rollback;
