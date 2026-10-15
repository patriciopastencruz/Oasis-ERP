begin;

-- Encuesta de satisfacción: evita respuestas duplicadas por doble envío y
-- quita el duplicado del 12-10-2026 (Pieza 18, Hostal Oasis Centro), enviado
-- 1,4 segundos después de la respuesta original con el mismo contenido. La
-- fila eliminada queda en audit_logs.

CREATE OR REPLACE FUNCTION public.submit_lodging_survey(p_token text, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.lodging_rooms; resv uuid; sid uuid:=gen_random_uuid(); dup uuid;
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
 -- Doble envío (doble toque o reintento): la misma respuesta para la misma
 -- habitación y reserva en los últimos 10 minutos no se guarda de nuevo.
 select s.id into dup from public.lodging_satisfaction_surveys s
  where s.room_id=r.id and s.reservation_id is not distinct from resv and s.created_at>now()-interval '10 minutes'
   and s.cleanliness=v_clean and s.comfort=v_comfort and s.staff=v_staff and s.value_for_money=v_value and s.recommend=v_rec
   and s.comment is not distinct from nullif(left(trim(coalesce(p_payload->>'comment','')),1000),'')
   and s.guest_name is not distinct from nullif(left(trim(coalesce(p_payload->>'guest_name','')),120),'')
   and s.contact is not distinct from nullif(left(trim(coalesce(p_payload->>'contact','')),160),'')
  order by s.created_at limit 1;
 if dup is not null then return dup; end if;
 insert into public.lodging_satisfaction_surveys(id,company_id,business_unit_id,room_id,reservation_id,cleanliness,comfort,staff,value_for_money,recommend,comment,guest_name,contact)
 values(sid,r.company_id,r.business_unit_id,r.id,resv,v_clean,v_comfort,v_staff,v_value,v_rec,
  nullif(left(trim(coalesce(p_payload->>'comment','')),1000),''),
  nullif(left(trim(coalesce(p_payload->>'guest_name','')),120),''),
  nullif(left(trim(coalesce(p_payload->>'contact','')),160),''));
 return sid;
end $function$;

with dup as (
 select d.* from public.lodging_satisfaction_surveys d
 join public.lodging_satisfaction_surveys o on o.id='fe02577d-4595-4a30-9cc0-0330b03e5c66'
  and o.room_id=d.room_id and o.reservation_id is not distinct from d.reservation_id
  and o.cleanliness=d.cleanliness and o.comfort=d.comfort and o.staff=d.staff and o.value_for_money=d.value_for_money and o.recommend=d.recommend
  and o.comment is not distinct from d.comment and o.guest_name is not distinct from d.guest_name and o.contact is not distinct from d.contact
  and d.created_at between o.created_at and o.created_at+interval '1 minute'
 where d.id='ca461be6-4db3-4472-b183-92343ecc8b25'
), logged as (
 insert into public.audit_logs(company_id,business_unit_id,actor_id,action,entity_type,entity_id,old_data,new_data)
 select company_id,business_unit_id,null,'delete_duplicate','lodging_satisfaction_surveys',id,to_jsonb(dup),
  jsonb_build_object('reason','Respuesta duplicada por doble envío','duplicate_of','fe02577d-4595-4a30-9cc0-0330b03e5c66')
 from dup returning entity_id
)
delete from public.lodging_satisfaction_surveys s using logged where s.id=logged.entity_id;

commit;
