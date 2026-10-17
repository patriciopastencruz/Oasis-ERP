begin;

-- Meta de reservas de noche del bono de apoyo: 15 por mes en los tres hostales.
alter table public.lodging_support_bonus_config alter column goals set default '{"HOC":{"per_month":15},"HU":{"per_month":15},"HOB":{"per_month":15}}';
update public.lodging_support_bonus_config set goals='{"HOC":{"per_month":15},"HU":{"per_month":15},"HOB":{"per_month":15}}'::jsonb,updated_at=now();

commit;
