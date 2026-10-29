begin;

-- Si el cliente pidió departamento, Lucía le muestra solo opciones con baño
-- privado y guarda desde cuánto parten las de baño compartido que no vio.
-- Si no responde, el recontacto le ofrece esas opciones más económicas; se
-- las muestra solo si le interesan.

alter table public.lucia_conversations
  add column cheaper_shared_from numeric(12,2) check (cheaper_shared_from is null or cheaper_shared_from > 0);

do $$
declare
  def text := pg_get_functiondef('public.lucia_send_followups(uuid)'::regprocedure);
  old_body text := 'body:=''¡Hola''||coalesce('' ''||first_name,'''')||''! 😊 ¿Pudiste revisar las opciones? ¿Te gustaría que te reserve alguna? Si tienes cualquier duda, aquí estoy 🙌'';';
begin
  if position(old_body in def) = 0 then
    raise exception 'lucia_send_followups cambió: revisar el recontacto con opciones más económicas';
  end if;
  execute replace(def, old_body,
$new$if c.cheaper_shared_from is not null then
     body:='¡Hola'||coalesce(' '||first_name,'')||'! 😊 ¿Pudiste revisar las opciones? Si buscas algo más económico, también tenemos habitaciones con baño compartido desde '||
       public.lucia_clp(c.cheaper_shared_from)||' por noche. ¿Quieres que te las muestre? 🙌';
   else
     $new$ || old_body || $new$
   end if;$new$);
end $$;

commit;
