begin;

-- Metas de reservas de noche del bono de apoyo: Centro 15 y Uruguay 15 por mes (Cobija se mantiene en 6).
alter table public.lodging_support_bonus_config alter column goals set default '{"HOC":{"per_month":15},"HU":{"per_month":15},"HOB":{"per_month":6}}';
update public.lodging_support_bonus_config set goals='{"HOC":{"per_month":15},"HU":{"per_month":15},"HOB":{"per_month":6}}'::jsonb,updated_at=now();

commit;
