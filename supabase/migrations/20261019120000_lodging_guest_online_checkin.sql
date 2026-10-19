begin;

-- Check-in online del huésped. Recepción genera un link único por reserva y lo
-- envía (WhatsApp o copiar). El huésped, sin cuenta, completa sus datos
-- (nombre, documento, nacionalidad, contacto, hora de llegada, patente,
-- acompañantes) y acepta las normas; los datos quedan en la ficha del
-- huésped y en la reserva. El link vence al día siguiente del check-out, se
-- puede revocar y deja de servir si la reserva se anula. Nunca muestra
-- precios ni pagos. Todo pasa por funciones de la base: anon no ve tablas.

create table public.lodging_checkin_links(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 reservation_id uuid not null references public.lodging_reservations(id),
 token text not null unique default encode(extensions.gen_random_bytes(24),'hex') check(token ~ '^[a-f0-9]{48}$'),
 expires_at timestamptz not null,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 revoked_at timestamptz,
 revoked_by uuid references public.profiles(id),
 submitted_at timestamptz,
 submission jsonb,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
-- Un solo link vigente por reserva.
create unique index lodging_checkin_links_active_idx on public.lodging_checkin_links(reservation_id) where revoked_at is null;
create index lodging_checkin_links_unit_idx on public.lodging_checkin_links(company_id,business_unit_id,created_at desc);
create trigger audit_lodging_checkin_links after insert or update or delete on public.lodging_checkin_links
 for each row execute function public.audit_row_change();

alter table public.lodging_checkin_links enable row level security;
create policy lodging_checkin_links_read on public.lodging_checkin_links for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.view'));
revoke all on public.lodging_checkin_links from public,anon,authenticated;
grant select on public.lodging_checkin_links to authenticated;
grant select,insert,update on public.lodging_checkin_links to service_role;

-- Crea (o reemplaza) el link de una reserva. Devuelve el token.
create or replace function public.lodging_checkin_link_create(target_reservation uuid) returns text language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_res public.lodging_reservations; v_token text;
begin
 if me is null or not public.has_permission('lodging.reservations.manage') then raise exception 'Sin autorizacion'; end if;
 select * into v_res from public.lodging_reservations where id=target_reservation for update;
 if v_res.id is null or not public.can_access_unit(v_res.company_id,v_res.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if v_res.status in('cancelled','conflict','checked_out') or v_res.origin='maintenance' then raise exception 'Esta reserva no admite check-in online'; end if;
 update public.lodging_checkin_links set revoked_at=now(),revoked_by=me where reservation_id=v_res.id and revoked_at is null;
 insert into public.lodging_checkin_links(company_id,business_unit_id,reservation_id,expires_at,created_by)
 values(v_res.company_id,v_res.business_unit_id,v_res.id,((v_res.check_out+1)::timestamp at time zone 'America/Santiago'),me)
 returning token into v_token;
 return v_token;
end $$;

create or replace function public.lodging_checkin_link_revoke(target_reservation uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); v_res public.lodging_reservations;
begin
 if me is null or not public.has_permission('lodging.reservations.manage') then raise exception 'Sin autorizacion'; end if;
 select * into v_res from public.lodging_reservations where id=target_reservation;
 if v_res.id is null or not public.can_access_unit(v_res.company_id,v_res.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 update public.lodging_checkin_links set revoked_at=now(),revoked_by=me where reservation_id=v_res.id and revoked_at is null;
end $$;

revoke execute on function public.lodging_checkin_link_create(uuid),public.lodging_checkin_link_revoke(uuid) from public,anon;
grant execute on function public.lodging_checkin_link_create(uuid),public.lodging_checkin_link_revoke(uuid) to authenticated;

-- Link vigente por token (uso interno).
create or replace function public.lodging_checkin_link_valid(p_token text) returns public.lodging_checkin_links language sql stable security definer set search_path='' as $$
 select l.* from public.lodging_checkin_links l join public.lodging_reservations r on r.id=l.reservation_id
 where p_token ~ '^[a-f0-9]{48}$' and l.token=p_token and l.revoked_at is null and l.expires_at>now()
  and r.status not in('cancelled','conflict','checked_out')
$$;
revoke execute on function public.lodging_checkin_link_valid(text) from public,anon,authenticated;

-- Lo que ve el huésped: hostal, habitación, fechas y sus propios datos. Sin precios.
create or replace function public.lodging_checkin_get(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.lodging_checkin_links; r public.lodging_reservations; g public.lodging_guests; room_name text; unit_name text; unit_code text;
begin
 l:=public.lodging_checkin_link_valid(p_token);
 if l.id is null then return null; end if;
 select * into r from public.lodging_reservations where id=l.reservation_id;
 select * into g from public.lodging_guests where id=r.guest_id;
 select name into room_name from public.lodging_rooms where id=r.room_id;
 select name,code into unit_name,unit_code from public.business_units where id=r.business_unit_id;
 return jsonb_build_object(
  'unit',unit_name,'unit_code',unit_code,'room',room_name,'check_in',r.check_in,'check_out',r.check_out,'guest_count',r.guest_count,
  'submitted_at',l.submitted_at,
  -- Datos ya enviados por el huésped; si no, solo el nombre real de la reserva (no los textos de Booking/Airbnb).
  'data',coalesce(l.submission,jsonb_build_object(
   'full_name',case when g.full_name is null or g.full_name ~* '^reserva ' then null else g.full_name end,
   'estimated_arrival',to_char(r.estimated_arrival,'HH24:MI'))));
end $$;

-- Guarda lo que envía el huésped y lo pasa a la ficha del huésped y la reserva.
create or replace function public.lodging_checkin_submit(p_token text,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare l public.lodging_checkin_links; r public.lodging_reservations; clean jsonb; companions jsonb:='[]'::jsonb; c jsonb;
 v_name text:=left(btrim(coalesce(p_payload->>'full_name','')),160);
 v_doc text:=left(btrim(coalesce(p_payload->>'document','')),40);
 v_nat text:=left(btrim(coalesce(p_payload->>'nationality','')),80);
 v_email text:=left(lower(btrim(coalesce(p_payload->>'email',''))),160);
 v_phone text:=left(btrim(coalesce(p_payload->>'phone','')),40);
 v_arrival text:=nullif(btrim(coalesce(p_payload->>'estimated_arrival','')),'');
 v_plate text:=upper(left(btrim(coalesce(p_payload->>'license_plate','')),20));
 v_notes text:=left(btrim(coalesce(p_payload->>'notes','')),1000);
begin
 l:=public.lodging_checkin_link_valid(p_token);
 if l.id is null then raise exception 'Link no disponible'; end if;
 if char_length(v_name)<3 then raise exception 'Indica tu nombre completo'; end if;
 if char_length(v_doc)<4 then raise exception 'Indica tu documento'; end if;
 if char_length(v_nat)<2 then raise exception 'Indica tu nacionalidad'; end if;
 if v_email<>'' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo invalido'; end if;
 if char_length(v_phone)<6 then raise exception 'Indica tu telefono'; end if;
 if v_arrival is not null and v_arrival !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Hora de llegada invalida'; end if;
 if coalesce((p_payload->>'accept_rules')::boolean,false) is not true then raise exception 'Debes aceptar las normas del hostal'; end if;
 if jsonb_typeof(coalesce(p_payload->'companions','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_payload->'companions','[]'::jsonb))>10 then raise exception 'Acompanantes invalidos'; end if;
 for c in select * from jsonb_array_elements(coalesce(p_payload->'companions','[]'::jsonb)) loop
  if char_length(btrim(coalesce(c->>'full_name','')))>=3 then
   companions:=companions||jsonb_build_array(jsonb_build_object('full_name',left(btrim(c->>'full_name'),160),'document',left(btrim(coalesce(c->>'document','')),40)));
  end if;
 end loop;
 clean:=jsonb_build_object('full_name',v_name,'document',v_doc,'nationality',v_nat,'email',nullif(v_email,''),'phone',v_phone,
  'estimated_arrival',v_arrival,'license_plate',nullif(v_plate,''),'notes',nullif(v_notes,''),'companions',companions,'accepted_rules_at',now());
 select * into r from public.lodging_reservations where id=l.reservation_id for update;
 update public.lodging_checkin_links set submission=clean,submitted_at=now() where id=l.id;
 if r.guest_id is null then
  insert into public.lodging_guests(company_id,business_unit_id,full_name,document,nationality,email,phone)
  values(r.company_id,r.business_unit_id,v_name,v_doc,v_nat,nullif(v_email,''),v_phone) returning id into r.guest_id;
  update public.lodging_reservations set guest_id=r.guest_id where id=r.id;
 else
  update public.lodging_guests set full_name=v_name,document=v_doc,nationality=v_nat,email=coalesce(nullif(v_email,''),email),phone=v_phone,updated_at=now()
  where id=r.guest_id;
 end if;
 update public.lodging_reservations set estimated_arrival=coalesce(v_arrival::time,estimated_arrival),
  license_plate=coalesce(nullif(v_plate,''),license_plate) where id=r.id;
 -- Aviso a recepción del hostal (sin correo).
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 select r.company_id,r.business_unit_id,p.id,'lodging.checkin.submitted','Check-in online completado',
  v_name||' completó sus datos para la estadía del '||to_char(r.check_in,'DD-MM')||' al '||to_char(r.check_out,'DD-MM')||'.',
  'lodging_reservation',r.id,null
 from public.profiles p join public.user_business_units u on u.user_id=p.id and u.business_unit_id=r.business_unit_id
 where p.active and p.deleted_at is null and exists(
  select 1 from public.role_permissions rp join public.permissions k on k.id=rp.permission_id
  where rp.role_id=p.role_id and k.key='lodging.reservations.manage' and k.active);
end $$;

revoke execute on function public.lodging_checkin_get(text),public.lodging_checkin_submit(text,jsonb) from public,anon,authenticated;
grant execute on function public.lodging_checkin_get(text),public.lodging_checkin_submit(text,jsonb) to service_role;

commit;
