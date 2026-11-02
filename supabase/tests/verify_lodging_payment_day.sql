\set ON_ERROR_STOP on
begin;

-- Día al que corresponde un pago: abono antes de llegar → día de ingreso;
-- durante la estadía → día del pago; al salir o después → última noche.
do $$
begin
  if public.lodging_payment_day('2026-11-02 15:47-03', '2026-11-01', '2026-11-02') <> date '2026-11-01' then
    raise exception 'Pago al salir: debe contar en la noche de la estadía';
  end if;
  if public.lodging_payment_day('2026-11-05 10:00-03', '2026-11-01', '2026-11-03') <> date '2026-11-02' then
    raise exception 'Regularización posterior: última noche';
  end if;
  if public.lodging_payment_day('2026-10-28 09:00-03', '2026-11-01', '2026-11-03') <> date '2026-11-01' then
    raise exception 'Abono anticipado: día de ingreso';
  end if;
  if public.lodging_payment_day('2026-11-02 09:00-03', '2026-11-01', '2026-11-04') <> date '2026-11-02' then
    raise exception 'Durante la estadía: día del pago';
  end if;
  if public.lodging_payment_day('2026-11-02 01:30+00', '2026-11-01', '2026-11-03') <> date '2026-11-01' then
    raise exception 'Debe usar la hora de Chile';
  end if;
end $$;

rollback;
