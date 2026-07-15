begin;

-- Carga el stock inicial de materia prima de Distribuidora Altiplánica.
-- Solo aplica sobre materiales sin movimientos previos (current_stock=0) para
-- no pisar datos reales si la migración se ejecuta después de que ya hubo uso.
do $$
declare
  unit record;
  mat record;
  target numeric;
begin
  for unit in select id, company_id from public.business_units where code = 'DA' and active loop
    for mat in
      select id, code, current_stock, created_by
      from public.inventory_materials
      where business_unit_id = unit.id and code like 'DA-MP-%'
      for update
    loop
      target := case mat.code
        when 'DA-MP-ICE-2KG' then 4000
        when 'DA-MP-ICE-1KG' then 10000
        when 'DA-MP-WATER-16L' then 900
        when 'DA-MP-WATER-600CC' then 810
        else null
      end;
      if target is not null and mat.current_stock = 0 then
        update public.inventory_materials
        set initial_stock = target, current_stock = target
        where id = mat.id;
        insert into public.inventory_movements(
          company_id, business_unit_id, material_id, movement_type,
          quantity_in, stock_before, stock_after, document_reference, observation, created_by
        ) values (
          unit.company_id, unit.id, mat.id, 'initial_stock',
          target, 0, target, 'Stock inicial', 'Carga de stock inicial de materia prima', mat.created_by
        );
      end if;
    end loop;
  end loop;
end $$;

commit;
