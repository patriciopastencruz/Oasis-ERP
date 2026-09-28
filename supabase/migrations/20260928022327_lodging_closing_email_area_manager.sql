begin;

-- El correo de cierre diario de hostales solo llegaba a administrator y
-- superadmin. Francisco Pasten (Gerente de área) necesita recibirlo
-- también; es el único con ese rol hoy, pero se agrega a nivel de rol (no
-- su correo a mano) para que cualquier futuro Gerente de área lo reciba
-- igual, siguiendo el mismo criterio que el resto de la función.
create or replace function public.lodging_closing_email_recipients(target_closing uuid) returns table(email text,full_name text) language plpgsql stable security definer set search_path='' as $$
declare c public.lodging_daily_closings;
begin
 if not public.has_permission('lodging.closings.create') then raise exception 'Sin autorizacion'; end if;
 select * into c from public.lodging_daily_closings where id=target_closing;
 if c.id is null or not public.can_access_unit(c.company_id,c.business_unit_id) then raise exception 'Cierre no encontrado'; end if;
 return query select distinct p.email::text,(p.first_name||' '||p.last_name)::text
  from public.profiles p join public.roles r on r.id=p.role_id
  join public.user_companies uc on uc.user_id=p.id and uc.company_id=c.company_id
  where r.key in('administrator','superadmin','area_manager') and p.active and p.deleted_at is null and nullif(btrim(p.email),'') is not null;
end $$;

commit;
