begin;

-- El aseo cumple si el tiempo promedio hasta la inspección no pasa de 70 minutos.
alter table public.lodging_bonus_config alter column inspection_max_wait_minutes set default 70;
update public.lodging_bonus_config set inspection_max_wait_minutes=70,updated_at=now() where inspection_max_wait_minutes=60;

commit;
