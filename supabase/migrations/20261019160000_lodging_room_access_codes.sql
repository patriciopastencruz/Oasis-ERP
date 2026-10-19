begin;

-- Clave de ingreso autónomo de cada habitación, para el mensaje de bienvenida
-- ({clave_habitacion}). Solo la leen quienes pueden gestionar reservas y solo la
-- edita quien configura la operación. Además el texto de "Información de llegada"
-- pasa de 1.500 a 2.500 caracteres para admitir el mensaje completo de un hostal.
create table public.lodging_room_access_codes(
 room_id uuid primary key references public.lodging_rooms(id),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 code text not null check(char_length(code) between 1 and 40),
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lodging_room_access_codes_unit_idx on public.lodging_room_access_codes(business_unit_id);
create trigger audit_lodging_room_access_codes after insert or update or delete on public.lodging_room_access_codes
 for each row execute function public.audit_row_change();
alter table public.lodging_room_access_codes enable row level security;
create policy lodging_room_access_codes_read on public.lodging_room_access_codes for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.manage'));
revoke all on public.lodging_room_access_codes from public,anon,authenticated;
grant select on public.lodging_room_access_codes to authenticated;
grant select,insert,update,delete on public.lodging_room_access_codes to service_role;

-- Guarda (o quita, si viene vacía) la clave de una habitación.
create or replace function public.lodging_room_access_code_save(target_room uuid,new_code text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); rm public.lodging_rooms; c text:=trim(coalesce(new_code,''));
begin
 if me is null or not public.has_permission('lodging.operations.configure') then raise exception 'Sin autorizacion'; end if;
 select * into rm from public.lodging_rooms where id=target_room;
 if rm.id is null or not public.can_access_unit(rm.company_id,rm.business_unit_id) then raise exception 'Habitacion no encontrada'; end if;
 if char_length(c)>40 then raise exception 'La clave no puede pasar de 40 caracteres'; end if;
 if c='' then
  delete from public.lodging_room_access_codes where room_id=rm.id;
 else
  insert into public.lodging_room_access_codes(room_id,company_id,business_unit_id,code,updated_by,updated_at)
  values(rm.id,rm.company_id,rm.business_unit_id,c,me,now())
  on conflict(room_id) do update set code=excluded.code,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 end if;
end $$;
revoke execute on function public.lodging_room_access_code_save(uuid,text) from public,anon;
grant execute on function public.lodging_room_access_code_save(uuid,text) to authenticated;

alter table public.lodging_arrival_info drop constraint lodging_arrival_info_info_check;
alter table public.lodging_arrival_info add constraint lodging_arrival_info_info_check check(char_length(info)<=2500);

create or replace function public.lodging_arrival_info_save(target_unit uuid,new_info text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); unit public.business_units;
begin
 if me is null or not public.has_permission('lodging.operations.configure') then raise exception 'Sin autorizacion'; end if;
 select * into unit from public.business_units where id=target_unit and deleted_at is null;
 if unit.id is null or unit.code not in('HU','HOC','HOB') or not public.can_access_unit(unit.company_id,unit.id) then raise exception 'Unidad no autorizada'; end if;
 if char_length(coalesce(new_info,''))>2500 then raise exception 'El texto no puede pasar de 2500 caracteres'; end if;
 insert into public.lodging_arrival_info(company_id,business_unit_id,info,updated_by,updated_at)
 values(unit.company_id,unit.id,trim(coalesce(new_info,'')),me,now())
 on conflict(business_unit_id) do update set info=excluded.info,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end $$;
revoke execute on function public.lodging_arrival_info_save(uuid,text) from public,anon;
grant execute on function public.lodging_arrival_info_save(uuid,text) to authenticated;

commit;
