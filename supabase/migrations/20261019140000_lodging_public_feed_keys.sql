begin;

-- Claves de solo lectura para entregar el calendario de disponibilidad de los
-- hostales a asistentes externos (por ejemplo, el asistente de reservas de
-- WhatsApp). Solo se guarda el hash SHA-256 de la clave; la lee el servidor con
-- la llave de servicio y ninguna persona usuaria accede a la tabla.
create table public.lodging_public_feed_keys(
 id uuid primary key default gen_random_uuid(),
 name text not null,
 key_hash text not null unique check(key_hash ~ '^[0-9a-f]{64}$'),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 last_used_at timestamptz
);
alter table public.lodging_public_feed_keys enable row level security;
revoke all on public.lodging_public_feed_keys from public,anon,authenticated;
grant select,update on public.lodging_public_feed_keys to service_role;

insert into public.lodging_public_feed_keys(name,key_hash)
values('Asistente de reservas de WhatsApp (MyChatBot)','47d32f1d4c58d0bf82cbd9bf476a6e3e9c1887dcc0c20824ad7e46d21f7ba37c');

commit;
