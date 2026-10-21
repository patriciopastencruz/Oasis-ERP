begin;

-- 1. Opción exacta elegida por el cliente: la herramienta de disponibilidad
--    entrega un código por opción (id de una habitación del grupo) y Lucía lo
--    guarda en la ficha. Al confirmar, se asigna una habitación de ese mismo
--    grupo (tipo, descripción, capacidad y tarifas), no la más barata de la
--    hostal.
-- 2. Cambios con una solicitud en curso:
--    * esperando a recepción: si el cliente cambia hostal, fechas, personas u
--      opción, la solicitud anterior queda sin efecto (se avisa al encargado)
--      y Lucía puede pedir una nueva;
--    * con reserva pendiente o confirmada: no se cambia nada solo; el chat
--      queda para que una persona lo gestione.

alter table public.lucia_conversations add column preferred_room_id uuid references public.lodging_rooms(id);

create or replace function public.lucia_pick_room(c public.lucia_conversations) returns uuid language sql stable security definer set search_path='' as $$
 select r.id from public.lodging_rooms r
 left join public.lodging_rooms p on p.id=c.preferred_room_id
 where r.business_unit_id=c.business_unit_id and r.active and r.status not in('maintenance','out_of_service') and r.capacity>=c.guests
  and not exists(select 1 from public.lodging_reservations x where x.room_id=r.id and x.status not in('cancelled','conflict')
    and x.check_in<c.check_out and x.check_out>c.check_in)
 order by
  (p.id is not null and r.room_type=p.room_type and coalesce(r.description,'')=coalesce(p.description,'')
    and r.capacity=p.capacity and r.base_rate=p.base_rate and coalesce(r.rates_by_guests,'{}')=coalesce(p.rates_by_guests,'{}')) desc,
  (c.room_type is not null and c.room_type ilike r.room_type||'%') desc,
  public.lucia_rate_for_guests(r.base_rate,r.rates_by_guests,c.guests),r.display_order,r.code
 limit 1
$$;
revoke execute on function public.lucia_pick_room(public.lucia_conversations) from public,anon,authenticated;

create or replace function public.lucia_record_draft(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
 c public.lucia_conversations;
 p jsonb:=coalesce(payload->'extracted','{}'::jsonb);
 hostel_unit uuid;
 did uuid;
 cin date; cout date; amount numeric; g smallint; pref uuid; rtype text;
 booking_locked boolean;
 changed boolean;
begin
 select * into strict c from public.lucia_conversations where id=nullif(payload->>'conversation_id','')::uuid for update;
 if c.status='closed' then raise exception 'La conversación está cerrada'; end if;

 if nullif(p->>'hostel_code','') is not null then
   select h.business_unit_id into hostel_unit from public.lucia_hostels h join public.business_units bu on bu.id=h.business_unit_id
   where h.company_id=c.company_id and bu.code=p->>'hostel_code' and h.enabled;
 end if;
 begin cin:=nullif(p->>'check_in','')::date; exception when others then cin:=null; end;
 begin cout:=nullif(p->>'check_out','')::date; exception when others then cout:=null; end;
 begin amount:=nullif(p->>'quoted_amount','')::numeric; exception when others then amount:=null; end;
 if amount is not null and amount<0 then amount:=null; end if;
 g:=case when (p->>'guests') ~ '^[0-9]{1,2}$' and (p->>'guests')::int between 1 and 60 then (p->>'guests')::smallint end;
 rtype:=left(nullif(trim(p->>'room_type'),''),120);
 -- El código de opción debe ser una habitación activa de la hostal indicada.
 if (p->>'option_code') ~ '^[0-9a-f-]{36}$' then
   select r.id into pref from public.lodging_rooms r
   where r.id=(p->>'option_code')::uuid and r.active and r.company_id=c.company_id
     and r.business_unit_id=coalesce(hostel_unit,c.business_unit_id);
 end if;

 cin:=coalesce(cin,c.check_in);
 cout:=coalesce(cout,c.check_out);
 if cin is not null and cout is not null and cout<=cin then cout:=null; end if;

 booking_locked:=c.booking_status in('awaiting_payment','proof_received','confirmed');
 changed:=(hostel_unit is not null and hostel_unit<>c.business_unit_id)
   or (cin is distinct from c.check_in and c.check_in is not null)
   or (cout is distinct from c.check_out and c.check_out is not null)
   or (g is not null and g is distinct from c.guests)
   or (pref is not null and pref is distinct from c.preferred_room_id);

 if booking_locked and changed then
   -- Reserva ya creada: no se modifica sola; una persona gestiona el cambio.
   update public.lucia_conversations set needs_review=true,
     review_reason='El cliente pidió cambiar una reserva en curso (hostal, fechas, personas u opción)',updated_at=now()
   where id=c.id;
   hostel_unit:=null; cin:=c.check_in; cout:=c.check_out; g:=null; pref:=null; rtype:=null;
 elsif c.booking_status='awaiting_reception' and changed then
   -- La solicitud enviada a recepción ya no corresponde a lo que pide el cliente.
   perform public.lucia_message_manager(c,'↩️ La solicitud '||c.booking_code||' quedó sin efecto: el cliente cambió su pedido. No respondas OK a ese código.');
   update public.lucia_conversations set booking_status='none',booking_code=null,booking_requested_at=null,prospect_status='quoted',updated_at=now()
   where id=c.id returning * into c;
 end if;

 if hostel_unit is not null and hostel_unit<>c.business_unit_id then
   update public.lucia_messages set business_unit_id=hostel_unit where conversation_id=c.id;
   update public.lucia_drafts set business_unit_id=hostel_unit where conversation_id=c.id;
 end if;

 update public.lucia_drafts set status='superseded' where conversation_id=c.id and status='pending';

 update public.lucia_conversations set
   business_unit_id=coalesce(hostel_unit,business_unit_id),
   hostel_assigned=hostel_assigned or hostel_unit is not null,
   guest_name=coalesce(left(nullif(trim(p->>'guest_name'),''),160),guest_name),
   check_in=cin,
   check_out=cout,
   guests=coalesce(g,guests),
   room_type=coalesce(rtype,room_type),
   preferred_room_id=case when pref is not null then pref when hostel_unit is not null and hostel_unit<>business_unit_id then null else preferred_room_id end,
   preferences=coalesce(left(nullif(trim(p->>'preferences'),''),500),preferences),
   quoted_amount=coalesce(amount,quoted_amount),
   quoted_at=case when amount is not null then now() else quoted_at end,
   prospect_status=case when amount is not null and prospect_status='new' then 'quoted' else prospect_status end,
   needs_review=needs_review or coalesce((payload->>'needs_human')::boolean,false),
   review_reason=case when coalesce((payload->>'needs_human')::boolean,false) and not needs_review then left(coalesce(nullif(payload->>'reason',''),'Lucía pide revisión humana'),300) else review_reason end,
   updated_at=now()
 where id=c.id;

 insert into public.lucia_drafts(company_id,business_unit_id,conversation_id,content,intent,needs_human,reason,extracted,model,
   input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd)
 values(c.company_id,coalesce(hostel_unit,c.business_unit_id),c.id,left(trim(payload->>'content'),4000),
   left(coalesce(nullif(payload->>'intent',''),'other'),40),coalesce((payload->>'needs_human')::boolean,false),
   left(nullif(payload->>'reason',''),300),p,left(nullif(payload->>'model',''),80),
   coalesce((payload->>'input_tokens')::int,0),coalesce((payload->>'output_tokens')::int,0),
   coalesce((payload->>'cache_read_tokens')::int,0),coalesce((payload->>'cache_write_tokens')::int,0),
   coalesce((payload->>'cost_usd')::numeric,0))
 returning id into did;
 return did;
end $$;
revoke execute on function public.lucia_record_draft(jsonb) from public,anon,authenticated;
grant execute on function public.lucia_record_draft(jsonb) to service_role;

commit;
