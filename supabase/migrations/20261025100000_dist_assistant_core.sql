begin;

-- Asistente de pedidos de Distribuidora Altiplánica (DA) por WhatsApp.
-- Etapa 1: configuración, conversaciones, mensajes, consumo y bitácora, más las funciones que crean el pedido
-- (y, si hace falta, el cliente) en el ERP. El asistente nunca escribe directo en las tablas de pedidos:
-- usa dist_wa_create_order, que reutiliza dist_create_order (precios, crédito, fechas cerradas, historial y
-- auditoría) actuando a nombre de un usuario del ERP configurado en los ajustes.
--
-- Solo service_role (el servidor del ERP) ejecuta las funciones del asistente; los usuarios solo leen.

insert into public.permissions(key,module,description) values
 ('distribution.assistant.view','finance','Ver las conversaciones y los pedidos tomados por el asistente de la distribuidora'),
 ('distribution.assistant.settings','finance','Configurar el asistente de pedidos de la distribuidora y usar su simulador')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='distribution.assistant.view' and r.key in('administrative','administrator','general_manager','operations_manager','superadmin')
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='distribution.assistant.settings' and r.key in('administrator','general_manager','operations_manager','superadmin')
on conflict do nothing;

-- ---------- Ajustes ----------
create table public.dist_wa_settings(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 enabled boolean not null default false,
 agent_name text not null default 'Asistente' check(length(trim(agent_name)) between 1 and 60),
 general_instructions text not null default '' check(length(general_instructions)<=20000),
 model text not null default 'claude-haiku-4-5' check(model ~ '^claude-[a-z0-9.-]+$'),
 daily_budget_usd numeric(10,2) not null default 5 check(daily_budget_usd>=0 and daily_budget_usd<=1000),
 history_messages smallint not null default 20 check(history_messages between 1 and 50),
 -- Pedidos para el mismo día: hasta esta hora; días de la semana con reparto (1 = lunes ... 7 = domingo).
 same_day_cutoff time not null default '12:00',
 delivery_weekdays smallint[] not null default '{1,2,3,4,5,6}' check(delivery_weekdays <@ array[1,2,3,4,5,6,7]::smallint[] and cardinality(delivery_weekdays)>=1),
 -- Topes: un pedido que los supera no lo carga el asistente, lo deriva al encargado.
 max_quantity_per_line integer not null default 300 check(max_quantity_per_line between 1 and 100000),
 max_order_total numeric(14,0) not null default 1500000 check(max_order_total>=0),
 -- Usuario del ERP a nombre del cual quedan creados los pedidos y clientes (conviene uno propio del asistente).
 acting_user_id uuid references public.profiles(id),
 -- Números del encargado (formato +569...) que reciben el aviso de cada pedido.
 notify_phones text[] not null default '{}' check(cardinality(notify_phones)<=5),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id),
 unique(business_unit_id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);

create table public.dist_wa_conversations(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 channel text not null check(channel in('whatsapp','simulator')),
 contact_jid text not null check(length(contact_jid) between 3 and 160),
 contact_phone text check(contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
 contact_name text check(contact_name is null or length(contact_name)<=160),
 customer_id uuid references public.dist_customers(id),
 status text not null default 'assistant' check(status in('assistant','human','closed')),
 paused_until timestamptz,
 needs_review boolean not null default false,
 review_reason text check(review_reason is null or length(review_reason)<=300),
 last_message_at timestamptz,
 last_inbound_at timestamptz,
 last_outbound_at timestamptz,
 closed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id),
 check(status<>'closed' or closed_at is not null),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create unique index dist_wa_conversations_open_idx on public.dist_wa_conversations(company_id,channel,contact_jid) where status<>'closed';
create index dist_wa_conversations_unit_idx on public.dist_wa_conversations(company_id,business_unit_id,status,last_message_at desc);
create index dist_wa_conversations_customer_idx on public.dist_wa_conversations(customer_id) where customer_id is not null;

create table public.dist_wa_messages(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 conversation_id uuid not null references public.dist_wa_conversations(id),
 direction text not null check(direction in('inbound','outbound')),
 sender_type text not null check(sender_type in('customer','assistant','human','system')),
 sender_user_id uuid references public.profiles(id),
 message_type text not null default 'text' check(message_type in('text','audio','image','video','document','sticker','location','contact','other')),
 content text check(content is null or length(content)<=8000),
 external_id text,
 delivery_status text not null default 'received' check(delivery_status in('received','queued','sending','sent','failed')),
 error_message text,
 attempts smallint not null default 0,
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 check(direction='inbound' or sender_type<>'customer'),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create unique index dist_wa_messages_external_idx on public.dist_wa_messages(company_id,external_id) where external_id is not null;
create index dist_wa_messages_conversation_idx on public.dist_wa_messages(conversation_id,created_at);
create index dist_wa_messages_outbox_idx on public.dist_wa_messages(company_id,created_at) where delivery_status='queued';

create table public.dist_wa_order_links(
 order_id uuid primary key references public.dist_orders(id),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 conversation_id uuid not null references public.dist_wa_conversations(id),
 customer_created boolean not null default false,
 created_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index dist_wa_order_links_conversation_idx on public.dist_wa_order_links(conversation_id);
create index dist_wa_order_links_unit_idx on public.dist_wa_order_links(company_id,business_unit_id,created_at desc);

create table public.dist_wa_usage_daily(
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 usage_date date not null,
 requests integer not null default 0,
 input_tokens bigint not null default 0,
 output_tokens bigint not null default 0,
 cache_read_tokens bigint not null default 0,
 cache_write_tokens bigint not null default 0,
 cost_usd numeric(12,6) not null default 0,
 updated_at timestamptz not null default now(),
 primary key(business_unit_id,usage_date),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);

create table public.dist_wa_events(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 conversation_id uuid references public.dist_wa_conversations(id),
 severity text not null default 'info' check(severity in('info','warning','error')),
 event_type text not null check(event_type ~ '^[a-z_]{3,60}$'),
 message text not null check(length(message)<=2000),
 context jsonb not null default '{}',
 created_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index dist_wa_events_time_idx on public.dist_wa_events(company_id,business_unit_id,created_at desc);
create index dist_wa_events_conversation_idx on public.dist_wa_events(conversation_id,created_at desc) where conversation_id is not null;

create trigger dist_wa_settings_updated_at before update on public.dist_wa_settings for each row execute function public.set_updated_at();
create trigger audit_dist_wa_settings after insert or update or delete on public.dist_wa_settings for each row execute function public.audit_row_change();
create trigger audit_dist_wa_conversations after insert or update on public.dist_wa_conversations for each row execute function public.audit_row_change();
create trigger audit_dist_wa_order_links after insert on public.dist_wa_order_links for each row execute function public.audit_row_change();

create or replace function public.dist_wa_touch_conversation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.dist_wa_conversations set
   last_message_at=new.created_at,
   last_inbound_at=case when new.direction='inbound' then new.created_at else last_inbound_at end,
   last_outbound_at=case when new.direction='outbound' then new.created_at else last_outbound_at end,
   updated_at=now()
 where id=new.conversation_id;
 return new;
end $$;
create trigger dist_wa_messages_touch after insert on public.dist_wa_messages for each row execute function public.dist_wa_touch_conversation();

-- ---------- Seguridad de tablas ----------
alter table public.dist_wa_settings enable row level security;
alter table public.dist_wa_conversations enable row level security;
alter table public.dist_wa_messages enable row level security;
alter table public.dist_wa_order_links enable row level security;
alter table public.dist_wa_usage_daily enable row level security;
alter table public.dist_wa_events enable row level security;

create policy dist_wa_settings_select on public.dist_wa_settings for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('distribution.assistant.view'));
create policy dist_wa_conversations_select on public.dist_wa_conversations for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('distribution.assistant.view'));
create policy dist_wa_messages_select on public.dist_wa_messages for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('distribution.assistant.view'));
create policy dist_wa_order_links_select on public.dist_wa_order_links for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('distribution.assistant.view'));
create policy dist_wa_usage_daily_select on public.dist_wa_usage_daily for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('distribution.assistant.view'));
create policy dist_wa_events_select on public.dist_wa_events for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('distribution.assistant.view'));

revoke all on public.dist_wa_settings,public.dist_wa_conversations,public.dist_wa_messages,public.dist_wa_order_links,public.dist_wa_usage_daily,public.dist_wa_events from public,anon,authenticated;
grant select on public.dist_wa_settings,public.dist_wa_conversations,public.dist_wa_messages,public.dist_wa_order_links,public.dist_wa_usage_daily,public.dist_wa_events to authenticated;
grant select,insert,update on public.dist_wa_settings,public.dist_wa_conversations,public.dist_wa_messages,public.dist_wa_usage_daily,public.dist_wa_events to service_role;
grant select,insert on public.dist_wa_order_links to service_role;

-- ---------- Ajustes: guardar (solo quien configura) ----------
create or replace function public.dist_wa_save_settings(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare unit public.business_units; v_acting uuid:=nullif(payload->>'acting_user_id','')::uuid; v_phones text[]; p text; v_days smallint[];
begin
 if not public.has_permission('distribution.assistant.settings') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=(payload->>'business_unit_id')::uuid and code='DA' and deleted_at is null;
 if unit.id is null or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 select coalesce(array_agg(x::smallint order by x::smallint),'{}') into v_days from jsonb_array_elements_text(coalesce(payload->'delivery_weekdays','[]'::jsonb)) x;
 if cardinality(v_days)=0 then raise exception 'Elige al menos un dia de reparto'; end if;
 select coalesce(array_agg(btrim(x)),'{}') into v_phones from jsonb_array_elements_text(coalesce(payload->'notify_phones','[]'::jsonb)) x where btrim(x)<>'';
 foreach p in array v_phones loop
  if p !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'El numero % no es valido (usa el formato +569XXXXXXXX)',p; end if;
 end loop;
 if v_acting is not null then
  -- El usuario que firma los pedidos debe poder crearlos y tener acceso a la distribuidora.
  if not exists(select 1 from public.profiles pr join public.role_permissions rp on rp.role_id=pr.role_id join public.permissions pm on pm.id=rp.permission_id
                where pr.id=v_acting and pr.active and pr.deleted_at is null and pm.key='finance.distribution.orders.create' and pm.active)
     or not exists(select 1 from public.user_business_units ubu where ubu.user_id=v_acting and ubu.business_unit_id=unit.id) then
   raise exception 'Ese usuario no puede crear pedidos de la distribuidora';
  end if;
 end if;
 if coalesce((payload->>'enabled')::boolean,false) and (v_acting is null) then raise exception 'Para activar el asistente elige a nombre de quien se crean los pedidos'; end if;
 insert into public.dist_wa_settings(company_id,business_unit_id,enabled,agent_name,general_instructions,model,daily_budget_usd,history_messages,same_day_cutoff,delivery_weekdays,max_quantity_per_line,max_order_total,acting_user_id,notify_phones,updated_by)
 values(unit.company_id,unit.id,coalesce((payload->>'enabled')::boolean,false),btrim(payload->>'agent_name'),coalesce(payload->>'general_instructions',''),coalesce(payload->>'model','claude-haiku-4-5'),
  coalesce((payload->>'daily_budget_usd')::numeric,5),coalesce((payload->>'history_messages')::smallint,20),(payload->>'same_day_cutoff')::time,v_days,
  (payload->>'max_quantity_per_line')::integer,(payload->>'max_order_total')::numeric,v_acting,v_phones,auth.uid())
 on conflict(business_unit_id) do update set enabled=excluded.enabled,agent_name=excluded.agent_name,general_instructions=excluded.general_instructions,model=excluded.model,
  daily_budget_usd=excluded.daily_budget_usd,history_messages=excluded.history_messages,same_day_cutoff=excluded.same_day_cutoff,delivery_weekdays=excluded.delivery_weekdays,
  max_quantity_per_line=excluded.max_quantity_per_line,max_order_total=excluded.max_order_total,acting_user_id=excluded.acting_user_id,notify_phones=excluded.notify_phones,updated_by=excluded.updated_by;
end $$;
revoke execute on function public.dist_wa_save_settings(jsonb) from public,anon;
grant execute on function public.dist_wa_save_settings(jsonb) to authenticated;

-- ---------- Funciones del asistente (solo service_role) ----------

-- Clientes cuyo teléfono coincide con el del chat (por los últimos 9 dígitos, sin importar formato).
create or replace function public.dist_wa_find_customers(target_unit uuid,contact_number text) returns table(id uuid,code text,name text,address text,phone text,classification text,has_credit boolean,credit_status text,commercial_block boolean) language sql stable security definer set search_path='' as $$
 select c.id,c.code,c.name,c.address,c.phone,cl.name,c.has_credit,c.credit_status,c.commercial_block
 from public.dist_customers c join public.dist_customer_classifications cl on cl.id=c.classification_id
 where c.business_unit_id=target_unit and c.deleted_at is null and c.status='active'
  and length(regexp_replace(coalesce(contact_number,''),'\D','','g'))>=8
  and right(regexp_replace(c.phone,'\D','','g'),9)=right(regexp_replace(contact_number,'\D','','g'),9)
 order by c.name limit 5
$$;
revoke execute on function public.dist_wa_find_customers(uuid,text) from public,anon,authenticated;
grant execute on function public.dist_wa_find_customers(uuid,text) to service_role;

-- Valida fecha y topes del pedido según los ajustes; devuelve el mensaje de error o null si todo está bien.
create or replace function public.dist_wa_check_rules(settings public.dist_wa_settings,delivery date,payload jsonb) returns text language plpgsql stable security definer set search_path='' as $$
declare now_cl timestamp:=now() at time zone 'America/Santiago'; today date:=(now() at time zone 'America/Santiago')::date; line jsonb; est numeric:=0;
begin
 if delivery is null then return 'Falta la fecha de entrega'; end if;
 if delivery<today then return 'La fecha de entrega ya paso'; end if;
 if delivery>today+60 then return 'La fecha de entrega esta muy lejana (maximo 60 dias)'; end if;
 if not (extract(isodow from delivery)::smallint = any(settings.delivery_weekdays)) then return 'No hay reparto ese dia de la semana'; end if;
 if delivery=today and now_cl::time>settings.same_day_cutoff then
  return format('El plazo para pedidos del mismo dia termino a las %s; el pedido debe ser para otro dia de reparto',to_char(settings.same_day_cutoff,'HH24:MI'));
 end if;
 for line in select * from jsonb_array_elements(coalesce(payload->'lines','[]'::jsonb)) loop
  if (line->>'quantity')::numeric>settings.max_quantity_per_line then
   return format('REVISION: una linea supera la cantidad que el asistente puede tomar (%s); lo debe revisar el encargado',settings.max_quantity_per_line);
  end if;
 end loop;
 return null;
end $$;
revoke execute on function public.dist_wa_check_rules(public.dist_wa_settings,date,jsonb) from public,anon,authenticated;
grant execute on function public.dist_wa_check_rules(public.dist_wa_settings,date,jsonb) to service_role;

-- Cotiza sin escribir nada: precios vigentes del cliente (o estándar), total y reglas del asistente.
create or replace function public.dist_wa_quote_order(target_unit uuid,payload jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare settings public.dist_wa_settings; v_customer uuid:=nullif(payload->>'customer_id','')::uuid; delivery date:=(payload->>'delivery_date')::date; line jsonb; prod public.dist_products; priced record;
 lines jsonb:='[]'::jsonb; subtotal numeric:=0; amount numeric; rule text;
begin
 select * into settings from public.dist_wa_settings where business_unit_id=target_unit;
 if settings.id is null then raise exception 'El asistente no esta configurado'; end if;
 if jsonb_array_length(coalesce(payload->'lines','[]'::jsonb))=0 then raise exception 'El pedido necesita al menos un producto'; end if;
 for line in select * from jsonb_array_elements(payload->'lines') loop
  select * into prod from public.dist_products where business_unit_id=target_unit and code=line->>'product_code' and active and deleted_at is null;
  if prod.id is null then raise exception 'Producto % no disponible',coalesce(line->>'product_code','?'); end if;
  if (line->>'quantity')::numeric<=0 or (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric) then raise exception 'La cantidad de % debe ser un numero entero mayor que 0',prod.name; end if;
  select * into priced from public.dist_resolve_price(prod.id,v_customer,coalesce(delivery,(now() at time zone 'America/Santiago')::date));
  if priced.price_id is null then raise exception 'El producto % no tiene precio vigente',prod.name; end if;
  amount:=round(priced.amount*(line->>'quantity')::numeric,2);
  subtotal:=subtotal+amount;
  lines:=lines||jsonb_build_array(jsonb_build_object('product_id',prod.id,'product_code',prod.code,'name',prod.name,'quantity',(line->>'quantity')::numeric,'unit_price',priced.amount,'line_total',amount));
 end loop;
 rule:=public.dist_wa_check_rules(settings,delivery,payload);
 if rule is null and subtotal>settings.max_order_total then rule:=format('REVISION: el total supera lo que el asistente puede tomar (%s); lo debe revisar el encargado',settings.max_order_total); end if;
 return jsonb_build_object('lines',lines,'total',subtotal,'rule_error',rule);
end $$;
revoke execute on function public.dist_wa_quote_order(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.dist_wa_quote_order(uuid,jsonb) to service_role;

-- Crea el pedido (y el cliente si no existe) actuando a nombre del usuario configurado.
-- payload: delivery_date, estimated_time?, delivery_address?, payment_method, notes?, lines[{product_code,quantity}],
--          customer_id? o new_customer{name,address}, simulate? (true: solo valida y deshace).
create or replace function public.dist_wa_create_order(target_conversation uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 conv public.dist_wa_conversations; settings public.dist_wa_settings; quote jsonb; v_customer uuid;
 customer_created boolean:=false; classification uuid; method text:=payload->>'payment_method'; condition_value text; order_payload jsonb; v_order uuid; v_number text;
 v_total numeric; claims text; new_name text; new_address text; simulate boolean:=coalesce((payload->>'simulate')::boolean,false); cust public.dist_customers;
 manager record;
begin
 select * into conv from public.dist_wa_conversations where id=target_conversation for update;
 if conv.id is null then raise exception 'Conversacion no encontrada'; end if;
 -- Si el pedido no trae cliente, se usa el que ya tiene la conversación (por ejemplo, uno recién registrado).
 v_customer:=coalesce(nullif(payload->>'customer_id','')::uuid,conv.customer_id);
 select * into settings from public.dist_wa_settings where business_unit_id=conv.business_unit_id;
 if settings.id is null or settings.acting_user_id is null then raise exception 'El asistente no esta configurado'; end if;
 if method is null or method not in('cash','transfer','credit') then raise exception 'Forma de pago no valida'; end if;
 quote:=public.dist_wa_quote_order(conv.business_unit_id,payload||jsonb_build_object('customer_id',v_customer));
 if quote->>'rule_error' is not null then raise exception '%',quote->>'rule_error'; end if;
 v_total:=(quote->>'total')::numeric;

 -- A nombre del usuario configurado, para que valgan los mismos permisos y reglas que un pedido manual.
 claims:=json_build_object('sub',settings.acting_user_id,'role','authenticated')::text;
 perform set_config('request.jwt.claims',claims,true);

 if v_customer is null then
  new_name:=btrim(coalesce(payload#>>'{new_customer,name}',''));
  new_address:=btrim(coalesce(payload#>>'{new_customer,address}',coalesce(payload->>'delivery_address','')));
  if char_length(new_name)<2 or char_length(new_address)<5 then raise exception 'Para registrar al cliente nuevo faltan su nombre y su direccion'; end if;
  if method='credit' then raise exception 'Un cliente nuevo no puede comprar a credito'; end if;
  if conv.contact_phone is null then raise exception 'No se conoce el telefono del cliente'; end if;
  select id into classification from public.dist_customer_classifications where business_unit_id=conv.business_unit_id and code='otro' and active and deleted_at is null;
  if classification is null then select id into classification from public.dist_customer_classifications where business_unit_id=conv.business_unit_id and active and deleted_at is null order by display_order limit 1; end if;
  insert into public.dist_customers(company_id,business_unit_id,code,name,address,phone,classification_id,notes,created_by)
  values(conv.company_id,conv.business_unit_id,'PENDIENTE',new_name,new_address,conv.contact_phone,classification,'Registrado automaticamente por el asistente de WhatsApp: revisar y completar los datos.',settings.acting_user_id)
  returning id into v_customer;
  customer_created:=true;
 end if;
 select * into cust from public.dist_customers where id=v_customer;
 condition_value:=case when method='credit' then 'credit' else 'cash' end;
 order_payload:=jsonb_build_object(
  'business_unit_id',conv.business_unit_id,'customer_id',v_customer,'delivery_date',payload->>'delivery_date','estimated_time',nullif(payload->>'estimated_time',''),
  'delivery_address',nullif(btrim(coalesce(payload->>'delivery_address','')),''),'payment_method',method,'payment_condition',condition_value,
  'notes',btrim(coalesce('Pedido por WhatsApp (asistente). '||coalesce(payload->>'notes',''),'')),
  'lines',(select jsonb_agg(jsonb_build_object('product_id',l->>'product_id','quantity',l->'quantity')) from jsonb_array_elements(quote->'lines') l));
 v_order:=public.dist_create_order(order_payload);
 select order_number into v_number from public.dist_orders where id=v_order;
 insert into public.dist_wa_order_links(order_id,company_id,business_unit_id,conversation_id,customer_created)
 values(v_order,conv.company_id,conv.business_unit_id,conv.id,customer_created);
 update public.dist_wa_conversations set customer_id=v_customer where id=conv.id and customer_id is distinct from v_customer;
 insert into public.dist_wa_events(company_id,business_unit_id,conversation_id,severity,event_type,message,context)
 values(conv.company_id,conv.business_unit_id,conv.id,'info','order_created',format('Pedido %s creado por el asistente (total %s)',v_number,v_total),
  jsonb_build_object('order_id',v_order,'order_number',v_number,'customer_created',customer_created,'total',v_total));
 -- Aviso dentro del ERP a quienes administran los pedidos de la distribuidora.
 if not simulate then
  for manager in
   select distinct pr.id from public.profiles pr join public.role_permissions rp on rp.role_id=pr.role_id join public.permissions pm on pm.id=rp.permission_id
   join public.user_business_units ubu on ubu.user_id=pr.id and ubu.business_unit_id=conv.business_unit_id
   where pm.key='finance.distribution.orders.manage' and pm.active and pr.active and pr.deleted_at is null
  loop
   insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id)
   values(conv.company_id,conv.business_unit_id,manager.id,'dist_wa_order',
    case when customer_created then 'Pedido por WhatsApp de un cliente nuevo' else 'Pedido por WhatsApp' end,
    format('%s · %s · entrega %s · total %s',v_number,cust.name,payload->>'delivery_date',v_total),'dist_order',v_order);
  end loop;
 end if;
 -- En simulación se prueba todo el camino y se deshace al final (lo hace la excepción controlada).
 if simulate then raise exception 'SIMULACION_OK|%|%|%',v_number,v_total,customer_created; end if;
 return jsonb_build_object('order_id',v_order,'order_number',v_number,'total',v_total,'customer_created',customer_created,'customer_name',cust.name);
end $$;
revoke execute on function public.dist_wa_create_order(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.dist_wa_create_order(uuid,jsonb) to service_role;

commit;
