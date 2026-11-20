-- El maestro puede corregir su pedido mientras bodega no lo haya pasado a una lista de compras.
begin;

create or replace function public.om_supply_save_request(p_request uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); u public.business_units; pr public.om_projects; r public.om_supply_requests; mat public.inventory_materials;
 rid uuid; was_sent boolean:=false; ln jsonb; qty numeric; nm text; un text; n int:=0; me_name text;
 today date:=(now() at time zone 'America/Santiago')::date;
 v_from date; v_to date;
 v_submit boolean:=coalesce((p_payload->>'submit')::boolean,false);
 v_urgent boolean:=coalesce((p_payload->>'urgent')::boolean,false);
 v_reason text:=left(nullif(btrim(coalesce(p_payload->>'urgent_reason','')),''),300);
 v_notes text:=left(nullif(btrim(coalesce(p_payload->>'notes','')),''),1000);
 lines jsonb:=coalesce(p_payload->'lines','[]'::jsonb);
begin
 if me is null or not public.has_permission('inventory.supply.request') then raise exception 'Sin autorizacion'; end if;
 u:=public.om_supply_unit();
 select * into pr from public.om_projects where id=nullif(p_payload->>'project_id','')::uuid and business_unit_id=u.id and deleted_at is null;
 if pr.id is null then raise exception 'Proyecto no encontrado'; end if;
 if pr.status::text not in('pending','manufacturing','installation') then raise exception 'El proyecto no esta activo'; end if;
 if not public.has_permission('inventory.supply.consolidate') and pr.responsible_id is distinct from me
    and not exists(select 1 from public.om_project_members m where m.project_id=pr.id and m.profile_id=me) then
  raise exception 'No tienes asignado ese proyecto'; end if;
 v_from:=nullif(p_payload->>'cover_from','')::date; v_to:=nullif(p_payload->>'cover_to','')::date;
 if v_from is null or v_to is null or v_to<v_from then raise exception 'Indica los dias que cubre el pedido'; end if;
 if v_from<today and not exists(select 1 from public.om_supply_requests x where x.id=p_request and x.status='submitted' and x.cover_from=v_from) then
  raise exception 'El pedido no puede empezar antes de hoy'; end if;
 if v_to>v_from+6 then raise exception 'El pedido cubre como maximo 7 dias'; end if;
 select btrim(coalesce(first_name,'')||' '||coalesce(last_name,'')) into me_name from public.profiles where id=me;
 if jsonb_typeof(lines)<>'array' or jsonb_array_length(lines) not between 1 and 80 then raise exception 'Agrega entre 1 y 80 materiales'; end if;
 if v_urgent and v_submit and (v_reason is null or char_length(v_reason)<3) then raise exception 'Indica por que es urgente'; end if;

 if p_request is not null then
  select * into r from public.om_supply_requests where id=p_request for update;
  if r.id is null or r.business_unit_id<>u.id or (r.requested_by<>me and not public.has_permission('inventory.supply.consolidate')) then raise exception 'Pedido no encontrado'; end if;
  if r.status not in('draft','submitted') then raise exception 'El pedido ya esta en una lista de compras o anulado'; end if;
  was_sent:=r.status='submitted'; rid:=r.id;
  if was_sent and v_urgent and (v_reason is null or char_length(v_reason)<3) then raise exception 'Indica por que es urgente'; end if;
 else
  select id into rid from public.om_supply_requests where project_id=pr.id and requested_by=me and status='draft' for update;
 end if;
 if rid is null then
  insert into public.om_supply_requests(company_id,business_unit_id,project_id,project_number,project_name,requester_name,cover_from,cover_to,urgent,urgent_reason,notes,requested_by)
  values(u.company_id,u.id,pr.id,pr.project_number,pr.name,nullif(me_name,''),v_from,v_to,v_urgent,case when v_urgent then v_reason end,v_notes,me) returning id into rid;
 else
  update public.om_supply_requests set project_id=pr.id,project_number=pr.project_number,project_name=pr.name,cover_from=v_from,cover_to=v_to,urgent=v_urgent,
   urgent_reason=case when v_urgent then v_reason end,notes=v_notes where id=rid;
 end if;

 delete from public.om_supply_request_lines where request_id=rid;
 for ln in select * from jsonb_array_elements(lines) loop
  qty:=nullif(ln->>'quantity','')::numeric;
  if qty is null or qty<=0 or qty>=1000000 then raise exception 'Cada material necesita una cantidad mayor que cero'; end if;
  if nullif(ln->>'material_id','') is not null then
   select * into mat from public.inventory_materials where id=(ln->>'material_id')::uuid and business_unit_id=u.id and status::text='active';
   if mat.id is null then raise exception 'Material no encontrado en el catalogo'; end if;
   insert into public.om_supply_request_lines(company_id,business_unit_id,request_id,material_id,name,unit,quantity,note)
   values(u.company_id,u.id,rid,mat.id,mat.name,mat.unit_of_measure,qty,left(nullif(btrim(coalesce(ln->>'note','')),''),300));
  else
   nm:=left(btrim(coalesce(ln->>'custom_name','')),160); un:=left(btrim(coalesce(ln->>'unit','')),40);
   if char_length(nm)<2 then raise exception 'Escribe el nombre del material que no esta en el catalogo'; end if;
   if un='' then un:='un'; end if;
   insert into public.om_supply_request_lines(company_id,business_unit_id,request_id,name,unit,quantity,note)
   values(u.company_id,u.id,rid,nm,un,qty,left(nullif(btrim(coalesce(ln->>'note','')),''),300));
  end if;
  n:=n+1;
 end loop;

 if was_sent then
  perform public.om_supply_notify(u,'inventory.supply.consolidate',me,'inventory.supply.request_updated','Pedido de materiales modificado',
   coalesce(nullif(me_name,''),'Un maestro')||' modifico su pedido para '||coalesce(pr.project_number||' · ','')||pr.name
    ||' (ahora '||n||case when n=1 then ' material' else ' materiales' end||'). Revisalo antes de armar la lista.','om_supply_request',rid);
 elsif v_submit then
  update public.om_supply_requests set status='submitted',submitted_at=now() where id=rid;
  perform public.om_supply_notify(u,'inventory.supply.consolidate',me,
   case when v_urgent then 'inventory.supply_urgent.review_assigned' else 'inventory.supply.request_submitted' end,
   case when v_urgent then 'Pedido URGENTE de materiales' else 'Pedido de materiales por revisar' end,
   coalesce(nullif(me_name,''),'Un maestro')||' pidio '||n||case when n=1 then ' material' else ' materiales' end||' para '
    ||coalesce(pr.project_number||' · ','')||pr.name||' (del '||to_char(v_from,'DD-MM')||' al '||to_char(v_to,'DD-MM')||')'
    ||case when v_urgent then '. Urgente: '||left(v_reason,120) else '' end,
   'om_supply_request',rid);
 end if;
 return rid;
end $$;

revoke execute on function public.om_supply_save_request(uuid,jsonb) from public,anon;
grant execute on function public.om_supply_save_request(uuid,jsonb) to authenticated;

commit;
