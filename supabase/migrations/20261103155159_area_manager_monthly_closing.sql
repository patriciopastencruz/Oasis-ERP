begin;

-- El Gerente de área (Gerente de Operaciones) ve, prepara y cierra el cierre mensual
-- gerencial de los hostales a los que tiene acceso (HU, HOC, HOB).
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='area_manager'
  and p.key in('lodging.monthly_closing.view','lodging.monthly_closing.manage','lodging.monthly_closing.close')
on conflict do nothing;

commit;
