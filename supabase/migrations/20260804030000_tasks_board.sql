begin;

-- Tablero de tareas transversal (tipo Trello, muy básico): una sola lista
-- de tarjetas por compañía, sin unidad de negocio fija, con 3 columnas
-- (pending/in_progress/done), responsable y plazo opcionales. Pensado como
-- utilidad de coordinación interna, no como módulo de negocio, así que el
-- permiso de gestión se entrega a todos los roles (igual que ver el
-- tablero): cualquier persona activa de la compañía puede crear, asignar,
-- mover o eliminar cualquier tarjeta, como en un Trello compartido.

insert into public.permissions(key,module,description) values
 ('tasks.board.view','tasks','Ver el tablero de tareas'),
 ('tasks.board.manage','tasks','Crear, editar, mover, asignar y eliminar tareas del tablero')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key in('tasks.board.view','tasks.board.manage')
on conflict do nothing;

create table public.task_cards(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 title text not null check(char_length(btrim(title)) between 2 and 200),
 description text,
 status text not null default 'pending' check(status in('pending','in_progress','done')),
 assignee_id uuid references public.profiles(id),
 due_date date,
 sort_order integer not null default 0 check(sort_order>=0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),updated_by uuid references public.profiles(id),
 deleted_at timestamptz
);
create index task_cards_company_idx on public.task_cards(company_id) where deleted_at is null;
create index task_cards_status_idx on public.task_cards(company_id,status,sort_order) where deleted_at is null;
create index task_cards_assignee_idx on public.task_cards(assignee_id) where deleted_at is null;

create trigger task_cards_updated_at before update on public.task_cards for each row execute function public.set_updated_at();
create trigger audit_task_cards after insert or update or delete on public.task_cards for each row execute function public.audit_row_change();

create or replace function public.tasks_create_card(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); target_company uuid; assignee uuid; card_id uuid:=gen_random_uuid(); next_order int;
begin
 if not public.has_permission('tasks.board.manage') then raise exception 'Sin autorizacion'; end if;
 target_company:=nullif(payload->>'company_id','')::uuid;
 if target_company is null or not public.can_access_company(target_company) then raise exception 'Compania no autorizada'; end if;
 if nullif(trim(payload->>'title'),'') is null then raise exception 'El titulo es obligatorio'; end if;
 assignee:=nullif(payload->>'assignee_id','')::uuid;
 if assignee is not null and not exists(select 1 from public.user_companies uc where uc.user_id=assignee and uc.company_id=target_company) then
   raise exception 'El responsable no pertenece a esta compania';
 end if;
 select coalesce(max(sort_order)+1,0) into next_order from public.task_cards where company_id=target_company and status='pending' and deleted_at is null;
 insert into public.task_cards(id,company_id,title,description,assignee_id,due_date,sort_order,created_by)
 values(card_id,target_company,trim(payload->>'title'),nullif(trim(payload->>'description'),''),assignee,
   nullif(payload->>'due_date','')::date,next_order,me);
 return card_id;
end $$;

create or replace function public.tasks_update_card(target_card uuid,payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); c public.task_cards; assignee uuid;
begin
 if not public.has_permission('tasks.board.manage') then raise exception 'Sin autorizacion'; end if;
 select * into strict c from public.task_cards where id=target_card and deleted_at is null for update;
 if not public.can_access_company(c.company_id) then raise exception 'Compania no autorizada'; end if;
 if nullif(trim(payload->>'title'),'') is null then raise exception 'El titulo es obligatorio'; end if;
 assignee:=nullif(payload->>'assignee_id','')::uuid;
 if assignee is not null and not exists(select 1 from public.user_companies uc where uc.user_id=assignee and uc.company_id=c.company_id) then
   raise exception 'El responsable no pertenece a esta compania';
 end if;
 update public.task_cards set
   title=trim(payload->>'title'),
   description=nullif(trim(payload->>'description'),''),
   assignee_id=assignee,
   due_date=nullif(payload->>'due_date','')::date,
   updated_by=me,updated_at=now()
 where id=c.id;
end $$;

create or replace function public.tasks_move_card(target_card uuid,target_status text) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); c public.task_cards; next_order int;
begin
 if not public.has_permission('tasks.board.manage') then raise exception 'Sin autorizacion'; end if;
 if target_status not in('pending','in_progress','done') then raise exception 'Estado invalido'; end if;
 select * into strict c from public.task_cards where id=target_card and deleted_at is null for update;
 if not public.can_access_company(c.company_id) then raise exception 'Compania no autorizada'; end if;
 select coalesce(max(sort_order)+1,0) into next_order from public.task_cards where company_id=c.company_id and status=target_status and deleted_at is null;
 update public.task_cards set status=target_status,sort_order=next_order,updated_by=me,updated_at=now() where id=c.id;
end $$;

create or replace function public.tasks_delete_card(target_card uuid) returns void language plpgsql security invoker set search_path='' as $$
declare c public.task_cards;
begin
 if not public.has_permission('tasks.board.manage') then raise exception 'Sin autorizacion'; end if;
 select * into strict c from public.task_cards where id=target_card and deleted_at is null for update;
 if not public.can_access_company(c.company_id) then raise exception 'Compania no autorizada'; end if;
 update public.task_cards set deleted_at=now(),updated_by=auth.uid(),updated_at=now() where id=c.id;
end $$;

create or replace function public.tasks_list_company_members(target_company uuid) returns table(id uuid,first_name text,last_name text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_access_company(target_company) then raise exception 'Compania no autorizada'; end if;
 return query select p.id,p.first_name,p.last_name from public.profiles p
   join public.user_companies uc on uc.user_id=p.id
   where uc.company_id=target_company and p.active and p.deleted_at is null
   order by p.first_name,p.last_name;
end $$;
revoke execute on function public.tasks_list_company_members(uuid) from public,anon;
grant execute on function public.tasks_list_company_members(uuid) to authenticated;

alter table public.task_cards enable row level security;
create policy task_cards_select on public.task_cards for select to authenticated using(
 public.can_access_company(company_id) and public.has_permission('tasks.board.view')
);
create policy task_cards_write on public.task_cards for all to authenticated using(
 public.can_access_company(company_id) and public.has_permission('tasks.board.manage')
) with check(public.can_access_company(company_id) and public.has_permission('tasks.board.manage'));

commit;
