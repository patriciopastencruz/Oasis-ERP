\set ON_ERROR_STOP on
begin;

-- Verifica las tarifas por cantidad de personas y la carga de habitaciones
-- de Hostal Cobija (15 habitaciones con sus precios por 1, 2 y 3 personas).

do $$
declare hob uuid := (select id from public.business_units where code='HOB'); failed boolean := false;
begin
  if (select count(*) from public.lodging_rooms where business_unit_id=hob and code ~ '^P([1-9]|1[0-5])$') <> 15 then raise exception 'Faltan habitaciones de Cobija'; end if;
  if (select rates_by_guests from public.lodging_rooms where business_unit_id=hob and code='P1') <> '{"1":27000,"2":32000,"3":36000}'::jsonb then raise exception 'Tarifas C1'; end if;
  if (select capacity||'/'||base_rate::int from public.lodging_rooms where business_unit_id=hob and code='P12') <> '2/24000' then raise exception 'HAB4'; end if;
  if (select count(*) from public.lodging_rooms where business_unit_id=hob and code in('P10','P13') and capacity=1 and rates_by_guests='{"1":24000}'::jsonb) <> 2 then raise exception 'Individuales'; end if;
  begin update public.lodging_rooms set rates_by_guests='[1,2]'::jsonb where business_unit_id=hob and code='P1'; exception when check_violation then failed := true; end;
  if not failed then raise exception 'Solo acepta un objeto'; end if;
end $$;

select 'lodging rates by guests ok' as result;
rollback;
