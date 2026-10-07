begin;

-- "¿Qué tan probable es que nos recomiendes?" pasa de escala 0-10 a 1-5, igual
-- que el resto de las preguntas. Las respuestas ya guardadas (escala 0-10) se
-- convierten a 1-5 para no mezclar escalas.

alter table public.lodging_satisfaction_surveys
  drop constraint lodging_satisfaction_surveys_recommend_check;
update public.lodging_satisfaction_surveys
  set recommend = case when recommend<=2 then 1 when recommend<=4 then 2 when recommend<=6 then 3 when recommend<=8 then 4 else 5 end
  where recommend>5 or recommend=0;
alter table public.lodging_satisfaction_surveys
  add constraint lodging_satisfaction_surveys_recommend_check check(recommend between 1 and 5);

create or replace function public.submit_lodging_survey(p_token text,p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.lodging_rooms; resv uuid; sid uuid:=gen_random_uuid();
 v_clean int; v_comfort int; v_staff int; v_value int; v_rec int;
 today date:=(now() at time zone 'America/Santiago')::date;
begin
 select * into r from public.lodging_rooms where survey_token=p_token and active;
 if r.id is null then raise exception 'Encuesta no disponible'; end if;
 -- Freno simple contra spam desde un QR público.
 if (select count(*) from public.lodging_satisfaction_surveys where room_id=r.id and created_at>now()-interval '1 hour')>=10 then
  raise exception 'Demasiadas respuestas, intenta más tarde';
 end if;
 v_clean:=(p_payload->>'cleanliness')::int; v_comfort:=(p_payload->>'comfort')::int;
 v_staff:=(p_payload->>'staff')::int; v_value:=(p_payload->>'value_for_money')::int; v_rec:=(p_payload->>'recommend')::int;
 if coalesce(v_clean,0) not between 1 and 5 or coalesce(v_comfort,0) not between 1 and 5
    or coalesce(v_staff,0) not between 1 and 5 or coalesce(v_value,0) not between 1 and 5
    or coalesce(v_rec,0) not between 1 and 5 then
  raise exception 'Puntaje invalido';
 end if;
 select res.id into resv from public.lodging_reservations res
  where res.room_id=r.id and res.status in('confirmed','checked_in') and res.check_in<=today and res.check_out>=today
  order by res.check_in desc limit 1;
 insert into public.lodging_satisfaction_surveys(id,company_id,business_unit_id,room_id,reservation_id,cleanliness,comfort,staff,value_for_money,recommend,comment,guest_name,contact)
 values(sid,r.company_id,r.business_unit_id,r.id,resv,v_clean,v_comfort,v_staff,v_value,v_rec,
  nullif(left(trim(coalesce(p_payload->>'comment','')),1000),''),
  nullif(left(trim(coalesce(p_payload->>'guest_name','')),120),''),
  nullif(left(trim(coalesce(p_payload->>'contact','')),160),''));
 return sid;
end $$;
revoke execute on function public.submit_lodging_survey(text,jsonb) from public,anon,authenticated;
grant execute on function public.submit_lodging_survey(text,jsonb) to service_role;

commit;
