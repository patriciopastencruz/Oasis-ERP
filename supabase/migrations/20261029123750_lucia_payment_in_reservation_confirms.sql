begin;

-- Una reserva de Lucía queda "pendiente" hasta que alguien presiona "Pago
-- verificado" en el chat. Si recepción registra el pago directo en la
-- reserva (transferencia, tarjeta al llegar), la reserva seguía pendiente:
-- no se podía hacer check-in ni check-out. Ahora, cuando los pagos
-- confirmados cubren el abono pedido, la reserva y el chat quedan
-- confirmados. Si la llegada es futura, Lucía le confirma al cliente.

create or replace function public.lucia_confirm_paid_booking(target_reservation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.lodging_reservations; c public.lucia_conversations; h public.lucia_hostels; paid numeric;
begin
  select * into r from public.lodging_reservations where id = target_reservation for update;
  if not found or r.status <> 'pending' or r.origin <> 'whatsapp' then return; end if;
  select * into c from public.lucia_conversations
  where reservation_id = r.id and booking_status in ('awaiting_payment', 'proof_received') for update;
  if not found then return; end if;
  select coalesce(sum(case when p.type = 'refund' then -p.amount else p.amount end), 0) into paid
  from public.lodging_reservation_payments p where p.reservation_id = r.id and p.status = 'confirmed';
  if paid < coalesce(c.booking_deposit, r.total_value) then return; end if;

  update public.lodging_reservations set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = r.id;
  update public.lucia_conversations set booking_status = 'confirmed', prospect_status = 'confirmed', hold_expires_at = null,
    payment_verified_by = auth.uid(), payment_verified_at = now(), needs_review = false, review_reason = null, updated_at = now()
  where id = c.id returning * into c;
  if c.check_in > (now() at time zone 'America/Santiago')::date then
    select * into h from public.lucia_hostels where company_id = c.company_id and business_unit_id = c.business_unit_id;
    perform public.lucia_enqueue_outbound(c, 'lucia', null,
      '🎉 ¡Recibimos tu pago y tu reserva quedó confirmada!' || E'\n' || public.lucia_booking_summary(c) || E'\n\n' ||
      case when paid < r.total_value then 'El saldo de ' || public.lucia_clp(r.total_value - paid) || ' se paga al llegar. ' else '' end ||
      '¡Te esperamos! 🙌' ||
      coalesce(E'\n\n' || '📸 Aquí puedes ver más fotos de ' || h.display_name || ': ' || nullif(trim(h.photos_url), ''), ''), null);
  end if;
end $$;
revoke execute on function public.lucia_confirm_paid_booking(uuid) from public, anon, authenticated;

create or replace function public.lucia_payment_confirms_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- "Pago verificado" (lucia_verify_payment) ya confirma y avisa al cliente.
  if new.status = 'confirmed' and coalesce(current_setting('lucia.verifying_payment', true), '') <> '1' then
    perform public.lucia_confirm_paid_booking(new.reservation_id);
  end if;
  return new;
end $$;
revoke execute on function public.lucia_payment_confirms_booking() from public, anon, authenticated;

do $$
declare
  def text := pg_get_functiondef('public.lucia_verify_payment(uuid,numeric,text)'::regprocedure);
  old_insert text := ' insert into public.lodging_reservation_payments(';
begin
  if position(old_insert in def) = 0 then raise exception 'lucia_verify_payment cambió: revisar el registro del pago'; end if;
  execute replace(def, old_insert, ' perform set_config(''lucia.verifying_payment'',''1'',true);' || E'\n' || old_insert);
end $$;

create trigger lucia_payment_confirms_booking after insert or update of status, amount on public.lodging_reservation_payments
  for each row execute function public.lucia_payment_confirms_booking();

-- Reservas que ya quedaron pagadas y pendientes.
select public.lucia_confirm_paid_booking(r.id)
from public.lodging_reservations r
where r.status = 'pending' and r.origin = 'whatsapp';

commit;
