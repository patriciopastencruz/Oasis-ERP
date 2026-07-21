begin;

-- El primer Superadministrador queda vinculado (via user_business_units)
-- solo a las unidades de negocio que existían en el momento del /setup
-- inicial (bootstrapSuperadminAction). No existe ningún mecanismo que le
-- otorgue acceso automáticamente a unidades creadas después (por ejemplo
-- Distribuidora Altiplánica, agregada en una migración posterior). Como
-- can_access_unit() exige una fila explícita en user_business_units sin
-- excepción por rol, un Superadministrador puede terminar sin ver datos
-- de unidades reales pese a tener todos los permisos (ej. Panel de Caja
-- Chica mostrando todo en cero). Se completa el acceso faltante para
-- cualquier superadmin activo, a todas las unidades activas.
insert into public.user_companies(user_id, company_id, created_by)
select distinct p.id, bu.company_id, p.id
from public.profiles p
join public.roles r on r.id = p.role_id and r.key = 'superadmin'
cross join public.business_units bu
where p.active and p.deleted_at is null and bu.active and bu.deleted_at is null
on conflict (user_id, company_id) do nothing;

insert into public.user_business_units(user_id, company_id, business_unit_id, created_by)
select p.id, bu.company_id, bu.id, p.id
from public.profiles p
join public.roles r on r.id = p.role_id and r.key = 'superadmin'
cross join public.business_units bu
where p.active and p.deleted_at is null and bu.active and bu.deleted_at is null
on conflict (user_id, business_unit_id) do nothing;

commit;
