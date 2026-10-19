begin;

-- El calendario con Booking y Airbnb pasa a manejarse a mano en el ERP: se
-- desactiva la importación por iCal y se cierran los enlaces de calendario que
-- Booking y Airbnb leían del ERP. No se borra nada: las reservas ya importadas
-- se conservan como reservas normales y las conexiones quedan inactivas, por
-- si algún día se quisieran retomar.
update public.lodging_ical_configs set active=false,updated_at=now() where active;
update public.lodging_rooms set export_enabled=false where export_enabled;

commit;
