begin;

-- Gerentes de área pueden levantar solicitudes cuando no hay un solicitante
-- operativo disponible. El flujo de aprobación sigue determinando quién debe
-- aprobar cada solicitud enviada.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.key = 'finance.payment_requests.create'
where r.key = 'area_manager'
on conflict do nothing;

commit;
