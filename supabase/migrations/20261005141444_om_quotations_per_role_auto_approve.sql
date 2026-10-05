begin;

-- Excepción puntual: las cotizaciones de Keyla (rol Administrativo) sí
-- necesitan autorización de alguien con sales.quotations.approve, aunque
-- desde 20260925153415 el resto de los roles las genera de inmediato sin
-- aprobación. En vez de volver a condicionar todo a sales.quotations.approve
-- (que dejaría también a Vendedor/a y Administrador pidiendo aprobación,
-- cosa que nadie pidió), se agrega un permiso aparte -- sales.quotations.auto_approve --
-- y se le da a todos los roles que hoy pueden crear cotizaciones excepto
-- administrative. Así el criterio sigue siendo un permiso persistido, no un
-- id de usuario en la función.
insert into public.permissions(key,module,description) values
  ('sales.quotations.auto_approve','sales','Generar cotizaciones propias sin pasar por aprobación')
on conflict (key) do update set description=excluded.description, active=true;

insert into public.role_permissions(role_id,permission_id)
select rp.role_id, p.id
from public.role_permissions rp
join public.permissions create_perm on create_perm.id=rp.permission_id and create_perm.key='sales.quotations.create'
join public.roles r on r.id=rp.role_id and r.key<>'administrative'
cross join public.permissions p
where p.key='sales.quotations.auto_approve'
on conflict do nothing;

create or replace function public.om_submit_quotation(target_quotation uuid) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); q public.om_quotations; yr smallint; seq bigint; auto_approve boolean;
begin
 select * into strict q from public.om_quotations where id=target_quotation and deleted_at is null for update;
 if q.created_by<>me or not public.has_permission('sales.quotations.create') then raise exception 'Sin autorizacion'; end if;
 if q.status not in('draft','rejected') then raise exception 'La cotizacion ya fue enviada'; end if;
 if not exists(select 1 from public.om_quotation_lines where quotation_id=q.id) then raise exception 'La cotizacion requiere items'; end if;
 auto_approve:=public.has_permission('sales.quotations.auto_approve');
 if q.quotation_number is null then
  yr:=extract(year from now() at time zone 'America/Santiago')::smallint;
  seq:=public.om_next_quotation_sequence(q.business_unit_id,yr);
  update public.om_quotations set quotation_number=format('COT-%s-%s',yr,lpad(seq::text,6,'0')),sequence_year=yr,sequence_value=seq,
    status=case when auto_approve then 'approved' else 'pending' end,submitted_at=now(),
    reviewed_by=case when auto_approve then me end,reviewed_at=case when auto_approve then now() end,
    resolution_comment=null,updated_by=me,updated_at=now() where id=q.id;
 else
  update public.om_quotations set
    status=case when auto_approve then 'approved' else 'pending' end,submitted_at=now(),
    reviewed_by=case when auto_approve then me end,reviewed_at=case when auto_approve then now() end,
    resolution_comment=null,updated_by=me,updated_at=now() where id=q.id;
 end if;
end $$;

commit;
