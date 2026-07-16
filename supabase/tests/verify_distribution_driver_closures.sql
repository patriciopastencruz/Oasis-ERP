\set ON_ERROR_STOP on
begin;
select id as company_id from public.companies where code='OASIS' \gset
select id as unit_id from public.business_units where company_id=:'company_id' and code='DA' \gset
\set admin_id '00000000-0000-4000-8000-00000000f901'
\set driver_id '00000000-0000-4000-8000-00000000f902'
\set other_driver_id '00000000-0000-4000-8000-00000000f903'
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
(:'admin_id','authenticated','authenticated','close-admin@local.test','x',now(),now(),now()),
(:'driver_id','authenticated','authenticated','close-driver@local.test','x',now(),now(),now()),
(:'other_driver_id','authenticated','authenticated','close-other-driver@local.test','x',now(),now(),now());
insert into public.profiles(id,role_id,first_name,last_name,email,job_title,created_by) values
(:'admin_id',(select id from public.roles where key='administrator'),'Admin','Cierre','close-admin@local.test','Administrador',:'admin_id'),
(:'driver_id',(select id from public.roles where key='driver'),'Chofer','Uno','close-driver@local.test','Chofer',:'admin_id'),
(:'other_driver_id',(select id from public.roles where key='driver'),'Chofer','Dos','close-other-driver@local.test','Chofer',:'admin_id');
insert into public.user_companies(user_id,company_id) values(:'admin_id',:'company_id'),(:'driver_id',:'company_id'),(:'other_driver_id',:'company_id');
insert into public.user_business_units(user_id,company_id,business_unit_id) values(:'admin_id',:'company_id',:'unit_id'),(:'driver_id',:'company_id',:'unit_id'),(:'other_driver_id',:'company_id',:'unit_id');

select set_config('app.company',:'company_id',true);
select set_config('app.unit',:'unit_id',true);
select set_config('app.driver',:'driver_id',true);

set local role authenticated;

-- El chofer declara su cierre de caja del día.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f902","role":"authenticated"}',true);
insert into public.dist_driver_closures(company_id,business_unit_id,driver_id,closure_date,declared_cash,pending_amount,observations,created_by)
values(:'company_id',:'unit_id',:'driver_id',current_date,50000,12000,'Cliente Freirina pagó con billete roto.',:'driver_id')
returning id as closure_id \gset
select set_config('app.closure_id',:'closure_id',true);

-- Puede corregir su propia declaración el mismo día.
update public.dist_driver_closures set declared_cash=52000 where id=:'closure_id';
do $$begin
 if (select declared_cash from public.dist_driver_closures where id=current_setting('app.closure_id',true)::uuid)<>52000 then
  raise exception 'El chofer no pudo corregir su propia declaración';
 end if;
end$$;

-- Otro chofer no puede leer ni editar la declaración ajena.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f903","role":"authenticated"}',true);
do $$begin
 if exists(select 1 from public.dist_driver_closures where id=current_setting('app.closure_id',true)::uuid) then
  raise exception 'Un chofer distinto pudo leer la declaración ajena';
 end if;
end$$;
do $$begin
 update public.dist_driver_closures set declared_cash=0 where id=current_setting('app.closure_id',true)::uuid;
 if found then raise exception 'Un chofer distinto pudo editar la declaración ajena'; end if;
end$$;

-- El Administrador ve la declaración y la encuentra dentro del snapshot del cierre diario.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f901","role":"authenticated"}',true);
do $$begin
 if not exists(select 1 from public.dist_driver_closures where id=current_setting('app.closure_id',true)::uuid) then
  raise exception 'El Administrador no pudo leer la declaración del chofer';
 end if;
end$$;
select public.dist_daily_summary(:'unit_id',current_date) as summary \gset
select set_config('app.summary',:'summary',true);
do $$begin
 if not exists(
   select 1 from jsonb_array_elements(current_setting('app.summary',true)::jsonb->'driver_closures') d
   where (d->>'driver_id')=current_setting('app.driver',true) and (d->>'declared_cash')::numeric=52000
 ) then
  raise exception 'La declaración del chofer no quedó en el snapshot del cierre diario';
 end if;
end$$;

-- El Administrador cierra formalmente la jornada: el chofer ya no puede declarar/corregir.
insert into public.dist_daily_closures(company_id,business_unit_id,closure_date,status,snapshot,closed_by,closed_at,created_by)
values(:'company_id',:'unit_id',current_date,'closed',:'summary'::jsonb,:'admin_id',now(),:'admin_id');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f902","role":"authenticated"}',true);
do $$begin
 update public.dist_driver_closures set declared_cash=1 where id=current_setting('app.closure_id',true)::uuid;
 if found then raise exception 'El chofer pudo corregir su cierre tras el cierre formal de la jornada'; end if;
end$$;
do $$begin
 begin
  insert into public.dist_driver_closures(company_id,business_unit_id,driver_id,closure_date,declared_cash,pending_amount,created_by)
  values(current_setting('app.company',true)::uuid,current_setting('app.unit',true)::uuid,current_setting('app.driver',true)::uuid,current_date,1,0,current_setting('app.driver',true)::uuid);
  raise exception 'El chofer pudo declarar un cierre nuevo tras el cierre formal de la jornada';
 exception when others then
  if sqlerrm='El chofer pudo declarar un cierre nuevo tras el cierre formal de la jornada' then raise; end if;
 end;
end$$;

reset role;
rollback;
\echo 'OK: cierre de caja simple del chofer verificado (declaración, corrección, RLS y bloqueo tras cierre formal).'
