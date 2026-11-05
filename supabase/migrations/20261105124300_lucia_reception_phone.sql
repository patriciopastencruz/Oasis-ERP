begin;

-- Teléfono oficial de recepción para huéspedes: Lucía lo entrega a quien ya
-- tiene su reserva y pide algo de su estadía (clave del Wi-Fi, toallas,
-- llaves), para que lo coordine directo con recepción. Es distinto del
-- WhatsApp del encargado, que solo recibe los avisos internos.

alter table public.lucia_hostels add column reception_phone text
  check (reception_phone is null or reception_phone ~ '^\+[1-9][0-9]{7,14}$');
grant update(reception_phone) on public.lucia_hostels to authenticated;

commit;
