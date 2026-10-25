begin;

-- Asistente de pedidos de la distribuidora, funciones de apoyo (solo service_role).

-- Lista de productos con el precio vigente del cliente (null si no tiene precio).
create or replace function public.dist_wa_price_list(target_unit uuid,target_customer uuid) returns table(product_id uuid,code text,name text,ice_weight_kg numeric,unit_price numeric) language sql stable security definer set search_path='' as $$
 select p.id,p.code,p.name,p.ice_weight_kg,
  (select r.amount from public.dist_resolve_price(p.id,target_customer,(now() at time zone 'America/Santiago')::date) r limit 1)
 from public.dist_products p
 where p.business_unit_id=target_unit and p.active and p.deleted_at is null
 order by p.name
$$;
revoke execute on function public.dist_wa_price_list(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dist_wa_price_list(uuid,uuid) to service_role;

-- Suma el consumo de Claude del día.
create or replace function public.dist_wa_record_usage(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare unit public.business_units;
begin
 select * into unit from public.business_units where id=(payload->>'business_unit_id')::uuid and code='DA';
 if unit.id is null then raise exception 'Unidad no valida'; end if;
 insert into public.dist_wa_usage_daily(company_id,business_unit_id,usage_date,requests,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd)
 values(unit.company_id,unit.id,(now() at time zone 'America/Santiago')::date,1,coalesce((payload->>'input_tokens')::bigint,0),coalesce((payload->>'output_tokens')::bigint,0),
  coalesce((payload->>'cache_read_tokens')::bigint,0),coalesce((payload->>'cache_write_tokens')::bigint,0),coalesce((payload->>'cost_usd')::numeric,0))
 on conflict(business_unit_id,usage_date) do update set requests=public.dist_wa_usage_daily.requests+1,
  input_tokens=public.dist_wa_usage_daily.input_tokens+excluded.input_tokens,output_tokens=public.dist_wa_usage_daily.output_tokens+excluded.output_tokens,
  cache_read_tokens=public.dist_wa_usage_daily.cache_read_tokens+excluded.cache_read_tokens,cache_write_tokens=public.dist_wa_usage_daily.cache_write_tokens+excluded.cache_write_tokens,
  cost_usd=public.dist_wa_usage_daily.cost_usd+excluded.cost_usd,updated_at=now();
end $$;
revoke execute on function public.dist_wa_record_usage(jsonb) from public,anon,authenticated;
grant execute on function public.dist_wa_record_usage(jsonb) to service_role;

-- El asistente pide ayuda al encargado: marca la conversación, deja el resumen en la bitácora y avisa dentro del ERP.
create or replace function public.dist_wa_flag_conversation(target_conversation uuid,reason text,summary text,simulated boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare conv public.dist_wa_conversations; manager record; v_reason text:=left(btrim(coalesce(reason,'')),300); v_summary text:=left(btrim(coalesce(summary,'')),1500);
begin
 select * into conv from public.dist_wa_conversations where id=target_conversation for update;
 if conv.id is null then raise exception 'Conversacion no encontrada'; end if;
 update public.dist_wa_conversations set needs_review=true,review_reason=nullif(v_reason,'') where id=conv.id;
 insert into public.dist_wa_events(company_id,business_unit_id,conversation_id,severity,event_type,message,context)
 values(conv.company_id,conv.business_unit_id,conv.id,'warning','needs_manager',coalesce(nullif(v_reason,''),'El asistente pide ayuda del encargado'),jsonb_build_object('summary',v_summary,'simulated',simulated));
 if not simulated then
  for manager in
   select distinct pr.id from public.profiles pr join public.role_permissions rp on rp.role_id=pr.role_id join public.permissions pm on pm.id=rp.permission_id
   join public.user_business_units ubu on ubu.user_id=pr.id and ubu.business_unit_id=conv.business_unit_id
   where pm.key='finance.distribution.orders.manage' and pm.active and pr.active and pr.deleted_at is null
  loop
   insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id)
   values(conv.company_id,conv.business_unit_id,manager.id,'dist_wa_needs_manager','Un cliente necesita al encargado (WhatsApp)',
    left(coalesce(nullif(v_reason,''),'')||case when v_summary<>'' then ' · '||v_summary else '' end,500),'dist_wa_conversation',conv.id);
  end loop;
 end if;
end $$;
revoke execute on function public.dist_wa_flag_conversation(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.dist_wa_flag_conversation(uuid,text,text,boolean) to service_role;

commit;
