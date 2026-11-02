begin;

-- Hora de apertura de recepción: fuera del horario (antes de abrir o
-- después de cerrar) Lucía no entrega la dirección exacta a quien no tiene
-- una reserva pagada y le pide coordinar antes su llegada con recepción.

alter table public.lucia_hostels add column reception_open_time time not null default '09:00';
grant update(reception_open_time) on public.lucia_hostels to authenticated;

update public.lucia_hostels h set reception_open_time = '10:30'
from public.business_units b where b.id = h.business_unit_id and b.code = 'HOB';

commit;
