\set ON_ERROR_STOP on
begin;

-- Verifica que un doble envío de la encuesta (misma respuesta, misma
-- habitación, en minutos) no se guarde dos veces, y que una respuesta
-- distinta sí se guarde.

select id as company_id from public.companies where code='OASIS' \gset
select id as hoc from public.business_units where company_id=:'company_id' and code='HOC' \gset
\set room '00000000-0000-4000-8000-0000000d3001'
insert into public.lodging_rooms(id,company_id,business_unit_id,code,name,display_order,survey_token)
values(:'room',:'company_id',:'hoc','SV1','Encuesta 1',95,'0123456789abcdef0123456789abcdef');

set local role service_role;
do $$
declare a uuid; b uuid; c uuid; payload jsonb := '{"cleanliness":"4","comfort":"5","staff":"5","value_for_money":"4","recommend":"5","comment":"Muy bien"}';
begin
  a := public.submit_lodging_survey('0123456789abcdef0123456789abcdef',payload);
  b := public.submit_lodging_survey('0123456789abcdef0123456789abcdef',payload);
  if a is distinct from b then raise exception 'El doble envío creó otra respuesta'; end if;
  c := public.submit_lodging_survey('0123456789abcdef0123456789abcdef',payload||'{"comment":"Otra opinión"}');
  if c = a then raise exception 'Una respuesta distinta debe guardarse'; end if;
  if (select count(*) from public.lodging_satisfaction_surveys where room_id='00000000-0000-4000-8000-0000000d3001') is distinct from 2::bigint then raise exception 'Deben quedar 2 respuestas'; end if;
end $$;

select 'lodging survey dedupe ok' as result;
rollback;
