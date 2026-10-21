begin;

-- Las conversaciones del simulador no avisan al equipo: ni WhatsApp al
-- encargado (ya era así) ni notificaciones en el ERP.

create or replace function public.lucia_notify_unit(c public.lucia_conversations,ekey text,ttl text,msg text) returns void language plpgsql security definer set search_path='' as $$
begin
 if c.channel='simulator' then return; end if;
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 select c.company_id,c.business_unit_id,p.id,ekey,ttl,msg,'lucia_conversation',c.id,null
 from public.profiles p
 join public.user_business_units ubu on ubu.user_id=p.id and ubu.company_id=c.company_id and ubu.business_unit_id=c.business_unit_id
 where p.active and p.deleted_at is null
  and exists(select 1 from public.role_permissions rp join public.permissions perm on perm.id=rp.permission_id where rp.role_id=p.role_id and perm.key='lucia.inbox.reply' and perm.active)
  and not exists(select 1 from public.notifications n where n.recipient_id=p.id and n.event_key=ekey and n.entity_id=c.id and n.status='unread');
end $$;
revoke execute on function public.lucia_notify_unit(public.lucia_conversations,text,text,text) from public,anon,authenticated;

commit;
