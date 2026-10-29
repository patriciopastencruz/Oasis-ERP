begin;

-- Pagos que se pierden por el plazo de 30 minutos:
-- * 10 minutos antes de vencer, Lucía le recuerda al cliente que envíe el
--   comprobante.
-- * Si el comprobante llega hasta 12 horas después de vencido el plazo y la
--   misma habitación sigue libre, se vuelve a guardar (reserva pendiente
--   nueva) y sigue el flujo normal de comprobante recibido. Si ya no está
--   libre, se avisa al equipo con el comprobante para que lo resuelva.

alter table public.lucia_conversations add column hold_reminded_at timestamptz;

create or replace function public.lucia_reinstate_hold(c public.lucia_conversations) returns public.lucia_conversations
language plpgsql security definer set search_path = '' as $$
declare old public.lodging_reservations; rid uuid;
begin
  if c.booking_status <> 'expired' or c.booking_room_id is null then return c; end if;
  select * into old from public.lodging_reservations where id = c.reservation_id;
  if not found then return c; end if;
  if exists (
    select 1 from public.lodging_reservations x
    where x.room_id = c.booking_room_id and x.status not in ('cancelled', 'conflict')
      and x.check_in < c.check_out and x.check_out > c.check_in
  ) then return c; end if;
  insert into public.lodging_reservations(company_id, business_unit_id, room_id, guest_id, origin, status, check_in, check_out,
    guest_count, nightly_rate, total_value, notes, created_by)
  values(c.company_id, c.business_unit_id, c.booking_room_id, old.guest_id, 'whatsapp', 'pending', c.check_in, c.check_out,
    c.guests, old.nightly_rate, old.total_value,
    'Reserva pendiente reactivada por Lucía: el cliente envió el comprobante después de vencer el plazo.', old.created_by)
  returning id into rid;
  update public.lucia_conversations set booking_status = 'awaiting_payment', reservation_id = rid,
    prospect_status = 'pre_reserved', updated_at = now()
  where id = c.id returning * into c;
  return c;
end $$;
revoke execute on function public.lucia_reinstate_hold(public.lucia_conversations) from public, anon, authenticated;

-- Comprobante tardío: se intenta volver a guardar la habitación antes del
-- flujo normal de comprobante; si no se puede, aviso con el archivo.
do $$
declare
  def text := pg_get_functiondef('public.lucia_ingest_message(jsonb)'::regprocedure);
  old_proof text := 'if conv.booking_status=''awaiting_payment'' and mtype in(''image'',''document'') then';
begin
  if position(old_proof in def) = 0 then
    raise exception 'lucia_ingest_message cambió: revisar el comprobante tardío';
  end if;
  execute replace(def, old_proof,
$late$if conv.booking_status='expired' and mtype in('image','document') and conv.hold_expires_at>now()-interval '12 hours' then
   conv:=public.lucia_reinstate_hold(conv);
   if conv.booking_status='expired' then
     update public.lucia_conversations set needs_review=true,
       review_reason='Comprobante recibido después de vencer el plazo y la habitación ya no está libre: revisar',updated_at=now()
     where id=conv.id returning * into conv;
     perform public.lucia_message_manager_with_media(payload->>'media_path',mtype,payload->>'media_name',conv,
       '💸⚠️ El cliente envió un comprobante DESPUÉS de vencer el plazo y esa habitación ya no está libre. Verifica el pago en el banco y coordina con el cliente (otra habitación o devolución).'||E'\n'||
       public.lucia_booking_summary(conv)||coalesce(E'\n'||link||'/chats/'||conv.id,''));
     return jsonb_build_object('status','late_payment_proof','conversation_id',conv.id,'message_id',mid,
       'process',conv.status='lucia' and (conv.paused_until is null or conv.paused_until<now()));
   end if;
 end if;
 $late$ || old_proof);
end $$;

-- Los comprobantes (a tiempo o tardíos) ya tienen su aviso con el archivo.
create or replace function public.lucia_conversation_review_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.needs_review and not old.needs_review
     and not (new.booking_status = 'proof_received' and old.booking_status is distinct from 'proof_received')
     and coalesce(new.review_reason, '') not like 'Comprobante recibido después de vencer%' then
    perform public.lucia_alert_review(new);
  end if;
  return new;
end $$;
revoke execute on function public.lucia_conversation_review_alert() from public, anon, authenticated;

-- Recordatorio antes de que venza el plazo (una vez por cada confirmación).
do $$
declare
  def text := pg_get_functiondef('public.lucia_expire_holds(uuid)'::regprocedure);
  old_loop text := ' for c in select * from public.lucia_conversations where company_id=target_company and booking_status=''awaiting_payment'' and hold_expires_at<now()';
begin
  if position(old_loop in def) = 0 then
    raise exception 'lucia_expire_holds cambió: revisar el recordatorio';
  end if;
  execute replace(def, old_loop,
$rem$ for c in select * from public.lucia_conversations where company_id=target_company and booking_status='awaiting_payment'
   and hold_expires_at between now() and now()+interval '10 minutes'
   and (hold_reminded_at is null or hold_reminded_at<booking_confirmed_at) for update skip locked loop
   update public.lucia_conversations set hold_reminded_at=now() where id=c.id;
   perform public.lucia_enqueue_outbound(c,'lucia',null,
     '⏳ Te quedan '||greatest(1,ceil(extract(epoch from c.hold_expires_at-now())/60))::int||' minutos para enviar el comprobante ('||
     public.lucia_clp(c.booking_deposit)||'). Si ya transferiste, mándame la foto del comprobante por aquí y te guardo la habitación 😊',null);
 end loop;
$rem$ || old_loop);
end $$;

commit;
