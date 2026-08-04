begin;

-- El tablero de tareas sigue siendo transversal a toda la compañía (no se
-- filtra ni se restringe por unidad), pero cada tarjeta ahora puede
-- etiquetarse con la unidad de negocio a la que corresponde, para que se
-- vea de un vistazo en el tablero. Opcional: una tarea puede quedar sin
-- unidad si es de coordinación general de la compañía.

alter table public.task_cards add column business_unit_id uuid;
alter table public.task_cards
  add constraint task_cards_business_unit_fkey
  foreign key(company_id,business_unit_id) references public.business_units(company_id,id);
create index task_cards_business_unit_idx on public.task_cards(business_unit_id) where deleted_at is null;

create or replace function public.tasks_create_card(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); target_company uuid; assignee uuid; unit uuid; card_id uuid:=gen_random_uuid(); next_order int;
begin
 if not public.has_permission('tasks.board.manage') then raise exception 'Sin autorizacion'; end if;
 target_company:=nullif(payload->>'company_id','')::uuid;
 if target_company is null or not public.can_access_company(target_company) then raise exception 'Compania no autorizada'; end if;
 if nullif(trim(payload->>'title'),'') is null then raise exception 'El titulo es obligatorio'; end if;
 assignee:=nullif(payload->>'assignee_id','')::uuid;
 if assignee is not null and not exists(select 1 from public.user_companies uc where uc.user_id=assignee and uc.company_id=target_company) then
   raise exception 'El responsable no pertenece a esta compania';
 end if;
 unit:=nullif(payload->>'business_unit_id','')::uuid;
 if unit is not null and not exists(select 1 from public.business_units bu where bu.id=unit and bu.company_id=target_company and bu.active and bu.deleted_at is null) then
   raise exception 'La unidad de negocio no pertenece a esta compania';
 end if;
 select coalesce(max(sort_order)+1,0) into next_order from public.task_cards where company_id=target_company and status='pending' and deleted_at is null;
 insert into public.task_cards(id,company_id,business_unit_id,title,description,assignee_id,due_date,sort_order,created_by)
 values(card_id,target_company,unit,trim(payload->>'title'),nullif(trim(payload->>'description'),''),assignee,
   nullif(payload->>'due_date','')::date,next_order,me);
 return card_id;
end $$;

create or replace function public.tasks_update_card(target_card uuid,payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); c public.task_cards; assignee uuid; unit uuid;
begin
 if not public.has_permission('tasks.board.manage') then raise exception 'Sin autorizacion'; end if;
 select * into strict c from public.task_cards where id=target_card and deleted_at is null for update;
 if not public.can_access_company(c.company_id) then raise exception 'Compania no autorizada'; end if;
 if nullif(trim(payload->>'title'),'') is null then raise exception 'El titulo es obligatorio'; end if;
 assignee:=nullif(payload->>'assignee_id','')::uuid;
 if assignee is not null and not exists(select 1 from public.user_companies uc where uc.user_id=assignee and uc.company_id=c.company_id) then
   raise exception 'El responsable no pertenece a esta compania';
 end if;
 unit:=nullif(payload->>'business_unit_id','')::uuid;
 if unit is not null and not exists(select 1 from public.business_units bu where bu.id=unit and bu.company_id=c.company_id and bu.active and bu.deleted_at is null) then
   raise exception 'La unidad de negocio no pertenece a esta compania';
 end if;
 update public.task_cards set
   title=trim(payload->>'title'),
   description=nullif(trim(payload->>'description'),''),
   assignee_id=assignee,
   business_unit_id=unit,
   due_date=nullif(payload->>'due_date','')::date,
   updated_by=me,updated_at=now()
 where id=c.id;
end $$;

create or replace function public.tasks_list_company_units(target_company uuid) returns table(id uuid,code text,name text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_access_company(target_company) then raise exception 'Compania no autorizada'; end if;
 return query select bu.id,bu.code,bu.name from public.business_units bu
   where bu.company_id=target_company and bu.active and bu.deleted_at is null
   order by bu.name;
end $$;
revoke execute on function public.tasks_list_company_units(uuid) from public,anon;
grant execute on function public.tasks_list_company_units(uuid) to authenticated;

commit;
