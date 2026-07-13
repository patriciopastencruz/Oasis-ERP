begin;

create or replace function public.notify_finance_payment_status()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status=new.status or new.status not in ('scheduled','paid') then return new; end if;
  insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
  select new.company_id,new.business_unit_id,p.id,'payment_request.'||new.status::text,
    case new.status when 'scheduled' then 'Pago programado' else 'Pago ejecutado' end,
    'La solicitud '||new.request_number||case new.status when 'scheduled' then ' fue programada para pago.' else ' fue pagada.' end,
    'payment_request',new.id,auth.uid()
  from public.profiles p
  join public.user_business_units ubu on ubu.user_id=p.id and ubu.company_id=new.company_id and ubu.business_unit_id=new.business_unit_id
  where p.active and p.deleted_at is null and p.id<>new.requester_id
    and exists(select 1 from public.role_permissions rp join public.permissions permission on permission.id=rp.permission_id where rp.role_id=p.role_id and permission.key='finance.payments.view' and permission.active)
    and not exists(select 1 from public.notifications n where n.recipient_id=p.id and n.entity_type='payment_request' and n.entity_id=new.id and n.event_key='payment_request.'||new.status::text and n.status='unread');
  return new;
end $$;

create trigger notify_finance_payment_status after update of status on public.payment_requests
for each row execute function public.notify_finance_payment_status();
revoke execute on function public.notify_finance_payment_status() from public,anon,authenticated;

commit;
