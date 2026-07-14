-- El perfil propio y el catálogo de roles ya son legibles mediante RLS, por lo
-- que la comprobación no necesita privilegios del propietario de la función.
create or replace function public.current_user_has_role(target_role text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
      join public.roles r on r.id = p.role_id
     where p.id = (select auth.uid())
       and p.active
       and p.deleted_at is null
       and r.active
       and r.deleted_at is null
       and r.key = target_role
  )
$$;

revoke execute on function public.current_user_has_role(text) from public, anon;
grant execute on function public.current_user_has_role(text) to authenticated;
