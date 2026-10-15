begin;

-- Pesos del bono: ocupación 20, venta promedio 20, Booking 25, aseo 10, encuesta 10 y orden 15.
-- La encuesta QR da la mitad por reunir el mínimo de evaluaciones y la otra mitad por promediar 4 o más.
alter table public.lodging_bonus_config alter column weights set default '{"occupancy":20,"adr":20,"booking":25,"survey":10,"inspections":10,"order":15}';
alter table public.lodging_bonus_config alter column survey_goal set default 4.00;
update public.lodging_bonus_config set
 weights='{"occupancy":20,"adr":20,"booking":25,"survey":10,"inspections":10,"order":15}'::jsonb,
 survey_goal=4.00,updated_at=now();

commit;
