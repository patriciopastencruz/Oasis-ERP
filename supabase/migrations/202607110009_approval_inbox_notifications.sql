begin;

drop policy if exists storage_request_insert on storage.objects;
create policy storage_request_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'payment-request-attachments'
  and public.can_access_company(public.storage_company_id(name))
  and (
    public.has_permission('finance.payment_requests.create')
    or public.has_permission('finance.approvals.decide')
  )
);

create or replace function public.notify_next_payment_request_approvers()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.action <> 'approve' then return new; end if;

  insert into public.notifications(
    company_id,business_unit_id,recipient_id,event_key,title,body,
    entity_type,entity_id,created_by
  )
  select s.company_id,s.business_unit_id,p.id,'payment_request.approval_assigned',
    'Aprobación pendiente','La solicitud '||pr.request_number||' requiere revisión.',
    'payment_request',s.payment_request_id,new.approver_id
  from public.payment_request_approval_steps s
  join public.payment_request_approval_instances i on i.id=s.approval_instance_id
  join public.payment_requests pr on pr.id=s.payment_request_id
  join public.profiles p on p.active and p.deleted_at is null
  join public.roles r on r.id=p.role_id
  join public.user_business_units ubu on ubu.user_id=p.id
    and ubu.company_id=s.company_id and ubu.business_unit_id=s.business_unit_id
  where s.approval_instance_id=new.approval_instance_id
    and s.status='pending' and i.status='pending'
    and (
      p.role_id=s.required_role_id
      or (s.allow_higher_role_substitution and r.key in ('general_manager','superadmin'))
    )
    and exists (
      select 1 from public.role_permissions rp
      join public.permissions permission on permission.id=rp.permission_id
      where rp.role_id=p.role_id and permission.key='finance.approvals.decide' and permission.active
    )
    and not exists (
      select 1 from public.payment_request_approval_steps prior
      where prior.approval_instance_id=s.approval_instance_id and prior.is_required
        and prior.sequence_order<s.sequence_order and prior.status<>'approved'
    )
    and not exists (
      select 1 from public.notifications n
      where n.recipient_id=p.id and n.entity_type='payment_request'
        and n.entity_id=s.payment_request_id
        and n.event_key='payment_request.approval_assigned' and n.status='unread'
    );
  return new;
end $$;

create trigger notify_next_approval_steps
after insert on public.payment_request_approval_decisions
for each row execute function public.notify_next_payment_request_approvers();

revoke execute on function public.notify_next_payment_request_approvers() from public,anon,authenticated;

commit;
