begin;

-- Los avisos de Lucía al equipo (derivación, solicitud de reserva, cliente en
-- camino, comprobante) llevan ahora el link a la app «Oasis Chats»
-- (/chats/<id>), donde recepción responde desde el celular en formato tipo
-- WhatsApp. Solo cambia la ruta del link en las funciones vigentes.
do $$
declare fn text; def text;
begin
  foreach fn in array array[
    'public.lucia_alert_review(public.lucia_conversations)',
    'public.lucia_alert_walk_in(jsonb)',
    'public.lucia_request_booking(jsonb)',
    'public.lucia_ingest_message(jsonb)'
  ] loop
    def := pg_get_functiondef(fn::regprocedure);
    if position('/lodging/lucia/' in def) = 0 then
      raise exception '% ya no arma links a /lodging/lucia/: revisar', fn;
    end if;
    execute replace(replace(def, '/lodging/lucia/', '/chats/'), '#responder', '');
  end loop;
end $$;

commit;
