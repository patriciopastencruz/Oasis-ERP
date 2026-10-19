begin;

-- Contacto con el huésped el día de llegada: recepción le envía por WhatsApp la
-- información de la estadía (horarios, cómo llegar y link de check-in online).
-- Aquí quedan registrados a quiénes ya se les envió y el texto de "Información
-- de llegada" de cada hostal (dirección, ubicación, WiFi, etc.).
create table public.lodging_arrival_contacts(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 reservation_id uuid not null unique references public.lodging_reservations(id),
 channel text not null default 'whatsapp' check(channel in('whatsapp')),
 contacted_by uuid not null references public.profiles(id),
 contacted_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lodging_arrival_contacts_unit_idx on public.lodging_arrival_contacts(business_unit_id,contacted_at desc);
create trigger audit_lodging_arrival_contacts after insert or update on public.lodging_arrival_contacts
 for each row execute function public.audit_row_change();

create table public.lodging_arrival_info(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null unique,
 info text not null default '' check(char_length(info)<=1500),
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create trigger audit_lodging_arrival_info after insert or update on public.lodging_arrival_info
 for each row execute function public.audit_row_change();

alter table public.lodging_arrival_contacts enable row level security;
alter table public.lodging_arrival_info enable row level security;
create policy lodging_arrival_contacts_read on public.lodging_arrival_contacts for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.view'));
create policy lodging_arrival_info_read on public.lodging_arrival_info for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.view'));
revoke all on public.lodging_arrival_contacts,public.lodging_arrival_info from public,anon,authenticated;
grant select on public.lodging_arrival_contacts,public.lodging_arrival_info to authenticated;
grant select,insert,update on public.lodging_arrival_contacts,public.lodging_arrival_info to service_role;

-- Registra que recepción abrió el mensaje de bienvenida para esta reserva.
create or replace function public.lodging_arrival_contact_mark(target_reservation uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); r public.lodging_reservations;
begin
 if me is null or not public.has_permission('lodging.reservations.manage') then raise exception 'Sin autorizacion'; end if;
 select * into r from public.lodging_reservations where id=target_reservation;
 if r.id is null or not public.can_access_unit(r.company_id,r.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if r.status in('cancelled','conflict') or r.origin='maintenance' then raise exception 'Esta reserva no admite contacto'; end if;
 insert into public.lodging_arrival_contacts(company_id,business_unit_id,reservation_id,contacted_by,contacted_at)
 values(r.company_id,r.business_unit_id,r.id,me,now())
 on conflict(reservation_id) do update set contacted_by=excluded.contacted_by,contacted_at=excluded.contacted_at;
end $$;
revoke execute on function public.lodging_arrival_contact_mark(uuid) from public,anon;
grant execute on function public.lodging_arrival_contact_mark(uuid) to authenticated;

-- Guarda el texto de "Información de llegada" de un hostal.
create or replace function public.lodging_arrival_info_save(target_unit uuid,new_info text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); unit public.business_units;
begin
 if me is null or not public.has_permission('lodging.operations.configure') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if char_length(coalesce(new_info,''))>1500 then raise exception 'El texto no puede pasar de 1500 caracteres'; end if;
 insert into public.lodging_arrival_info(company_id,business_unit_id,info,updated_by,updated_at)
 values(unit.company_id,unit.id,trim(coalesce(new_info,'')),me,now())
 on conflict(business_unit_id) do update set info=excluded.info,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end $$;
revoke execute on function public.lodging_arrival_info_save(uuid,text) from public,anon;
grant execute on function public.lodging_arrival_info_save(uuid,text) to authenticated;

commit;
