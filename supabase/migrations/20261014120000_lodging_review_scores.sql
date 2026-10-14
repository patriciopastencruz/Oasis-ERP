begin;

-- Seguimiento del puntaje de reseñas de cada hostal en Booking. Booking no
-- entrega estos datos por API a una propiedad individual, así que se registran
-- (a mano o por lectura periódica de la ficha pública) y el ERP guarda el
-- historial para ver la evolución. Un registro por hostal, fuente y día.

insert into public.permissions(key,module,description) values
 ('lodging.reviews.view','lodging','Ver y registrar el puntaje de reseñas de los hostales (Booking)')
on conflict(key) do update set description=excluded.description,active=true;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='lodging.reviews.view' and r.key in('administrator','superadmin','general_manager')
on conflict do nothing;

create table public.lodging_review_scores(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 source text not null default 'booking' check(source in('booking','airbnb','google','other')),
 recorded_on date not null default (now() at time zone 'America/Santiago')::date,
 score numeric(3,1) not null check(score between 0 and 10),
 review_count integer not null check(review_count>=0),
 -- cleanliness, comfort, facilities, location, staff, value, wifi (0 a 10)
 categories jsonb not null default '{}'::jsonb check(jsonb_typeof(categories)='object'),
 listing_name text check(listing_name is null or char_length(listing_name)<=160),
 recorded_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(business_unit_id,source,recorded_on)
);
create index lodging_review_scores_unit_idx on public.lodging_review_scores(business_unit_id,source,recorded_on desc);

alter table public.lodging_review_scores enable row level security;
create policy lodging_review_scores_read on public.lodging_review_scores for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reviews.view'));
revoke all on public.lodging_review_scores from public,anon,authenticated;
grant select on public.lodging_review_scores to authenticated;
grant select,insert,update on public.lodging_review_scores to service_role;

create or replace function public.lodging_record_review_score(target_unit uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare unit public.business_units; sid uuid; v_score numeric; v_count int; v_date date; v_source text; cats jsonb:='{}'::jsonb; k text; v numeric;
 today date:=(now() at time zone 'America/Santiago')::date;
begin
 if not public.has_permission('lodging.reviews.view') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 v_score:=(payload->>'score')::numeric; v_count:=(payload->>'review_count')::int;
 v_date:=coalesce(nullif(payload->>'recorded_on','')::date,today);
 v_source:=coalesce(nullif(payload->>'source',''),'booking');
 if v_score is null or v_score<0 or v_score>10 then raise exception 'El puntaje debe estar entre 0 y 10'; end if;
 if v_count is null or v_count<0 then raise exception 'La cantidad de comentarios no es valida'; end if;
 if v_date>today then raise exception 'No se puede registrar una fecha futura'; end if;
 foreach k in array array['cleanliness','comfort','facilities','location','staff','value','wifi'] loop
  if nullif(payload->'categories'->>k,'') is not null then
   v:=(payload->'categories'->>k)::numeric;
   if v<0 or v>10 then raise exception 'Las categorias deben estar entre 0 y 10'; end if;
   cats:=cats||jsonb_build_object(k,v);
  end if;
 end loop;
 insert into public.lodging_review_scores(company_id,business_unit_id,source,recorded_on,score,review_count,categories,listing_name,recorded_by)
 values(unit.company_id,unit.id,v_source,v_date,v_score,v_count,cats,nullif(btrim(payload->>'listing_name'),''),auth.uid())
 on conflict(business_unit_id,source,recorded_on) do update set score=excluded.score,review_count=excluded.review_count,categories=excluded.categories,
  listing_name=coalesce(excluded.listing_name,public.lodging_review_scores.listing_name),recorded_by=excluded.recorded_by
 returning id into sid;
 return sid;
end $$;
revoke execute on function public.lodging_record_review_score(uuid,jsonb) from public,anon;
grant execute on function public.lodging_record_review_score(uuid,jsonb) to authenticated;

-- Primer registro: lectura de las fichas públicas de Booking.
insert into public.lodging_review_scores(company_id,business_unit_id,source,score,review_count,categories,listing_name)
select u.company_id,u.id,'booking',v.score,v.cnt,v.cats::jsonb,v.listing
from public.business_units u join (values
 ('HU',7.3,11,'{"cleanliness":8.4,"comfort":8.2,"facilities":8.2,"location":7.0,"staff":8.0,"value":8.6,"wifi":5.0}','Hostal Atacama Oasis'),
 ('HOB',7.0,324,'{"cleanliness":7.6,"comfort":7.4,"facilities":7.2,"location":7.0,"staff":8.1,"value":7.7}','Oasis Mini Deptos'),
 ('HOC',6.9,465,'{"cleanliness":7.6,"comfort":7.4,"facilities":7.1,"location":7.7,"staff":7.9,"value":7.5,"wifi":7.6}','Hospedaje Oasis Modulares')
) as v(code,score,cnt,cats,listing) on v.code=u.code
where u.deleted_at is null
on conflict(business_unit_id,source,recorded_on) do nothing;

commit;
