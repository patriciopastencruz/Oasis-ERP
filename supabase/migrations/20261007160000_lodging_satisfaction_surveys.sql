begin;

-- Encuesta de satisfacción de huéspedes. Cada habitación tiene un link
-- público con un token opaco (el QR pegado en la habitación apunta a él), de
-- modo que la respuesta ya queda asociada a la habitación y, si hay una
-- estadía vigente, a la reserva. Las respuestas son anónimas salvo que el
-- huésped deje nombre o contacto. La escritura pasa solo por
-- submit_lodging_survey (service_role): anon no tiene acceso a ninguna tabla.

insert into public.permissions(key,module,description) values
 ('lodging.surveys.view','lodging','Ver resultados de las encuestas de satisfacción y los códigos QR por habitación')
on conflict(key) do update set description=excluded.description,active=true;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='lodging.surveys.view' and r.key in('administrator','superadmin','general_manager')
on conflict do nothing;

alter table public.lodging_rooms
  add column survey_token text not null default encode(extensions.gen_random_bytes(16),'hex')
    check (survey_token ~ '^[a-f0-9]{32}$');
create unique index lodging_rooms_survey_token_key on public.lodging_rooms(survey_token);

create table public.lodging_satisfaction_surveys(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 room_id uuid not null references public.lodging_rooms(id),
 reservation_id uuid references public.lodging_reservations(id) on delete set null,
 cleanliness smallint not null check(cleanliness between 1 and 5),
 comfort smallint not null check(comfort between 1 and 5),
 staff smallint not null check(staff between 1 and 5),
 value_for_money smallint not null check(value_for_money between 1 and 5),
 recommend smallint not null check(recommend between 0 and 10),
 comment text check(comment is null or char_length(comment)<=1000),
 guest_name text check(guest_name is null or char_length(guest_name)<=120),
 contact text check(contact is null or char_length(contact)<=160),
 created_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lodging_surveys_unit_created_idx on public.lodging_satisfaction_surveys(business_unit_id,created_at desc);
create index lodging_surveys_room_created_idx on public.lodging_satisfaction_surveys(room_id,created_at desc);

alter table public.lodging_satisfaction_surveys enable row level security;
create policy lodging_surveys_read on public.lodging_satisfaction_surveys for select to authenticated
  using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.surveys.view'));
revoke all on public.lodging_satisfaction_surveys from public,anon,authenticated;
grant select on public.lodging_satisfaction_surveys to authenticated;
grant select,insert on public.lodging_satisfaction_surveys to service_role;

create or replace function public.submit_lodging_survey(p_token text,p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.lodging_rooms; rid uuid; resv uuid; sid uuid:=gen_random_uuid();
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
    or coalesce(v_rec,-1) not between 0 and 10 then
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
