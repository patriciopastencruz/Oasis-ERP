begin;

-- Cada clave del calendario de disponibilidad indica de qué hostales entrega datos.
-- Por ahora el asistente de reservas solo atiende Hostal Atacama Oasis (Uruguay);
-- Centro y Cobija se agregan más adelante cambiando esta lista, sin tocar el código.
alter table public.lodging_public_feed_keys
  add column unit_codes text[] not null default array['HU','HOC','HOB'] check(unit_codes<@array['HU','HOC','HOB'] and cardinality(unit_codes)>0);

update public.lodging_public_feed_keys set unit_codes=array['HU'] where name like 'Asistente de reservas de WhatsApp%';

commit;
