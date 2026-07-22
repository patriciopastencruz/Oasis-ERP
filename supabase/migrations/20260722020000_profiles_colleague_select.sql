begin;

-- Antes de esto, un aprobador solo podia leer su propio perfil o el de
-- otros si tenia administration.users.manage (solo superadmin). Eso
-- dejaba en blanco el nombre del solicitante/vendedor en cualquier
-- bandeja de aprobacion vista por un gerente sin ese permiso (Solicitud
-- de Pagos, Caja Chica, Inventario, Cotizaciones, Distribuidora, y la
-- bandeja unificada de Administracion General).
--
-- Se agrega una politica que permite ver el perfil de un colega con
-- quien se comparte al menos una unidad de negocio (misma frontera de
-- acceso que ya usa can_access_unit en el resto del sistema). La
-- funcion es security definer porque user_business_units tiene su
-- propia RLS restringida a las filas propias (user_units_self); sin
-- esto, la subconsulta de "colega" nunca veria las filas del otro
-- usuario y la politica quedaria siempre en falso.

create or replace function public.shares_business_unit(target_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_business_units mine
    join public.user_business_units theirs
      on theirs.business_unit_id = mine.business_unit_id
    where mine.user_id = auth.uid() and theirs.user_id = target_profile
  )
$$;
revoke execute on function public.shares_business_unit(uuid) from public,anon;
grant execute on function public.shares_business_unit(uuid) to authenticated;

create policy profiles_colleague_select on public.profiles for select to authenticated using (
  public.shares_business_unit(id)
);

commit;
