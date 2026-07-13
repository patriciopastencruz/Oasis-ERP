begin;

create or replace function public.notify_payment_request_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = new.status then return new; end if;
  if new.status = 'pending_approval' then
    insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
    select distinct new.company_id,new.business_unit_id,p.id,'payment_request.approval_assigned','Aprobación pendiente',
      'La solicitud '||new.request_number||' requiere revisión.','payment_request',new.id,auth.uid()
    from public.payment_request_approval_steps s
    join public.profiles p on p.active and p.deleted_at is null
    join public.roles r on r.id=p.role_id
    join public.user_business_units ubu on ubu.user_id=p.id and ubu.company_id=s.company_id and ubu.business_unit_id=s.business_unit_id
    where s.approval_instance_id=new.approval_instance_id and s.status='pending'
      and s.sequence_order=(select min(x.sequence_order) from public.payment_request_approval_steps x where x.approval_instance_id=s.approval_instance_id and x.is_required)
      and (p.role_id=s.required_role_id or (s.allow_higher_role_substitution and r.key in ('general_manager','superadmin')))
      and exists(select 1 from public.role_permissions rp join public.permissions permission on permission.id=rp.permission_id where rp.role_id=p.role_id and permission.key='finance.approvals.decide' and permission.active)
      and not exists(select 1 from public.notifications n where n.recipient_id=p.id and n.entity_type='payment_request' and n.entity_id=new.id and n.event_key='payment_request.approval_assigned' and n.status='unread');
  elsif new.status in ('approved','rejected','correction_requested','scheduled','paid','cancelled') then
    insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
    values(new.company_id,new.business_unit_id,new.requester_id,'payment_request.'||new.status::text,
      'Solicitud '||replace(new.status::text,'_',' '),'La solicitud '||coalesce(new.request_number,new.id::text)||' cambió de estado.',
      'payment_request',new.id,auth.uid());
  end if;
  return new;
end $$;

revoke execute on function public.notify_payment_request_change() from public,anon,authenticated;

commit;
