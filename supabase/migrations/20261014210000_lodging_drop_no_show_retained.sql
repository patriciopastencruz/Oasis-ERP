begin;

-- La marca "pago retenido" (migración 20261014180000) se reemplazó por el
-- criterio definitivo: la reventa no marca nada (cada reserva activa cuenta) y
-- el no-show es solo para reservas sin pago (columna no_show). Ninguna reserva
-- llegó a usarla y el código desplegado ya no la lee.
drop index if exists public.lodging_reservations_no_show_idx;
alter table public.lodging_reservations drop column no_show_retained;

commit;
