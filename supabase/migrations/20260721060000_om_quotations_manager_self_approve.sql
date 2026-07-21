begin;

-- Quien ya tiene permiso para aprobar cotizaciones (Gerente de Operaciones,
-- Gerente General, Superadministrador) no necesita pedirle autorizacion a
-- otro para las suyas propias: puede crearlas y quedan aprobadas de
-- inmediato al enviarlas, sin pasar por el estado 'pending'.

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in ('operations_manager','general_manager') and p.key='sales.quotations.create'
on conflict do nothing;

create or replace function public.om_submit_quotation(target_quotation uuid) returns void language plpgsql security invoker set search_path='' as $$
declare me uuid:=auth.uid(); q public.om_quotations; yr smallint; seq bigint; auto_approve boolean;
begin
 select * into strict q from public.om_quotations where id=target_quotation and deleted_at is null for update;
 if q.created_by<>me or not public.has_permission('sales.quotations.create') then raise exception 'Sin autorizacion'; end if;
 if q.status not in('draft','rejected') then raise exception 'La cotizacion ya fue enviada'; end if;
 if not exists(select 1 from public.om_quotation_lines where quotation_id=q.id) then raise exception 'La cotizacion requiere items'; end if;
 auto_approve:=public.has_permission('sales.quotations.approve');
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

create or replace function public.om_notify_quotation_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status=old.status then return new; end if;
 if new.status='pending' then
  insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
  select new.company_id,new.business_unit_id,p.id,'om_quotation.approval_pending','Cotizacion pendiente de aprobacion',
    'La cotizacion '||coalesce(new.quotation_number,'(sin numero)')||' de '||new.client_company||' requiere tu revision.',
    'om_quotation',new.id,new.created_by
  from public.profiles p
  join public.user_business_units ubu on ubu.user_id=p.id and ubu.company_id=new.company_id and ubu.business_unit_id=new.business_unit_id
  where p.active and p.deleted_at is null
   and exists(select 1 from public.role_permissions rp join public.permissions perm on perm.id=rp.permission_id where rp.role_id=p.role_id and perm.key='sales.quotations.approve' and perm.active)
   and not exists(select 1 from public.notifications n where n.recipient_id=p.id and n.entity_type='om_quotation' and n.entity_id=new.id and n.event_key='om_quotation.approval_pending' and n.status='unread');
 elsif new.status in('approved','rejected') and new.reviewed_by is distinct from new.created_by then
  insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
  values(new.company_id,new.business_unit_id,new.created_by,
   'om_quotation.'||new.status,
   case when new.status='approved' then 'Cotizacion aprobada' else 'Cotizacion rechazada' end,
   'La cotizacion '||coalesce(new.quotation_number,'(sin numero)')||' de '||new.client_company||
     case when new.status='rejected' and coalesce(new.resolution_comment,'')<>'' then ': '||new.resolution_comment else '' end,
   'om_quotation',new.id,coalesce(new.reviewed_by,new.created_by));
 end if;
 return new;
end $$;

commit;
