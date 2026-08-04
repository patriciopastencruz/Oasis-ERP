begin;

-- Color identificador por unidad de negocio (hex), pensado en primer
-- lugar para distinguir tarjetas del tablero de tareas por unidad, pero
-- queda en business_units (no en tasks) porque es un atributo propio de
-- la unidad, reutilizable en cualquier otra pantalla futura.
alter table public.business_units add column color text check(color ~ '^#[0-9a-f]{6}$');

-- create or replace no permite cambiar las columnas de un returns table;
-- hay que borrar la función anterior antes de recrearla con la columna
-- color agregada.
drop function if exists public.tasks_list_company_units(uuid);
create function public.tasks_list_company_units(target_company uuid) returns table(id uuid,code text,name text,color text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_access_company(target_company) then raise exception 'Compania no autorizada'; end if;
 return query select bu.id,bu.code,bu.name,bu.color from public.business_units bu
   where bu.company_id=target_company and bu.active and bu.deleted_at is null
   order by bu.name;
end $$;
revoke execute on function public.tasks_list_company_units(uuid) from public,anon;
grant execute on function public.tasks_list_company_units(uuid) to authenticated;

commit;
