begin;

-- Seguimiento a los 20 minutos, más respetuoso:
-- * no se envía si el cliente dijo que lo está viendo («lo analizo con mi
--   señora», «te confirmo mañana», «espérame»);
-- * la oferta de habitaciones con baño compartido se hace una sola vez; el
--   segundo seguimiento usa el mensaje general.

do $$
declare
  def text := pg_get_functiondef('public.lucia_send_followups(uuid)'::regprocedure);
  old_farewell text := $old$|lo voy a pensar|lo pienso|d[eé]jalo|dej[eé]moslo)'$old$;
  old_cheaper text := $old$if c.cheaper_shared_from is not null then$old$;
begin
  if position(old_farewell in def) = 0 or position(old_cheaper in def) = 0 then
    raise exception 'lucia_send_followups cambió: revisar el seguimiento';
  end if;
  def := replace(def, old_farewell,
    $new$|lo voy a pensar|lo pienso|d[eé]jalo|dej[eé]moslo|analiz|lo convers|lo veo|lo reviso|te confirmo|le confirmo|confirmo m[aá]s|te aviso|le aviso|esp[eé]r[ae]me|chan[cz]a|m[aá]s rato|despu[eé]s te)'$new$);
  def := replace(def, old_cheaper,
    $new$if c.cheaper_shared_from is not null and not exists(select 1 from public.lucia_messages m
        where m.conversation_id=c.id and m.sender_type='lucia' and m.content like '%algo más económico%') then$new$);
  execute def;
end $$;

commit;
