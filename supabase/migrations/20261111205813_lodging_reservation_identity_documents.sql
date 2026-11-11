begin;

-- Reserva: datos de la persona y foto de su documento de identidad cargados por recepción.
-- 1) Al crear la reserva ahora también se guarda la nacionalidad del huésped.
do $$
declare
  def text := pg_get_functiondef('public.create_lodging_reservation(jsonb)'::regprocedure);
  cols text := 'insert into public.lodging_guests(company_id,business_unit_id,full_name,phone,email,document,notes)';
  vals text := $v$nullif(trim(payload->>'document'),''),nullif(trim(payload->>'guest_notes'),'')) returning id into guest_uuid;$v$;
begin
  if position(cols in def) = 0 or position(vals in def) = 0 then
    raise exception 'create_lodging_reservation cambió: revisar la nacionalidad del huésped';
  end if;
  def := replace(def, cols, 'insert into public.lodging_guests(company_id,business_unit_id,full_name,phone,email,document,nationality,notes)');
  def := replace(def, vals, $n$nullif(trim(payload->>'document'),''),nullif(left(trim(coalesce(payload->>'nationality','')),80),''),nullif(trim(payload->>'guest_notes'),'')) returning id into guest_uuid;$n$);
  execute def;
end $$;

-- 2) Fotos del documento de identidad (frente y reverso) de la reserva, en el bucket privado
-- lodging-guest-documents (el mismo del check-in online). La lectura pasa por lodging_guest_document_access;
-- los archivos los sube el servidor y las rutas solo se registran con lodging_set_reservation_documents.
create table public.lodging_reservation_documents(
 reservation_id uuid primary key references public.lodging_reservations(id),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 front_path text,
 back_path text,
 uploaded_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 check(front_path is not null or back_path is not null)
);
create index lodging_reservation_documents_unit_idx on public.lodging_reservation_documents(company_id,business_unit_id);
create index lodging_reservation_documents_uploaded_by_idx on public.lodging_reservation_documents(uploaded_by);

create trigger lodging_reservation_documents_updated_at before update on public.lodging_reservation_documents for each row execute function public.set_updated_at();
create trigger audit_lodging_reservation_documents after insert or update or delete on public.lodging_reservation_documents for each row execute function public.audit_row_change();

alter table public.lodging_reservation_documents enable row level security;
create policy lodging_reservation_documents_read on public.lodging_reservation_documents for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.reservations.view'));
revoke all on public.lodging_reservation_documents from public,anon,authenticated;
grant select on public.lodging_reservation_documents to authenticated;
grant select,insert,update on public.lodging_reservation_documents to service_role;

-- Registra (o reemplaza) las fotos de la reserva. Devuelve las rutas reemplazadas para que el servidor las borre.
create function public.lodging_set_reservation_documents(p_reservation uuid,p_front text,p_back text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lodging_reservations; prefix text; old public.lodging_reservation_documents; replaced jsonb:='[]'::jsonb;
begin
 if not public.has_permission('lodging.reservations.manage') then raise exception 'Sin autorizacion'; end if;
 select * into r from public.lodging_reservations where id=p_reservation;
 if r.id is null or not public.can_access_unit(r.company_id,r.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if r.status in('cancelled','conflict') then raise exception 'La reserva esta anulada'; end if;
 if p_front is null and p_back is null then raise exception 'Adjunta al menos una foto'; end if;
 prefix:=r.company_id||'/'||r.business_unit_id||'/'||r.id||'/';
 if p_front is not null and (left(p_front,char_length(prefix))<>prefix or substr(p_front,char_length(prefix)+1) !~ '^[0-9a-f-]{36}\.(jpg|png|webp)$') then raise exception 'Foto invalida'; end if;
 if p_back is not null and (left(p_back,char_length(prefix))<>prefix or substr(p_back,char_length(prefix)+1) !~ '^[0-9a-f-]{36}\.(jpg|png|webp)$') then raise exception 'Foto invalida'; end if;
 select * into old from public.lodging_reservation_documents where reservation_id=r.id for update;
 if old.reservation_id is null then
  insert into public.lodging_reservation_documents(reservation_id,company_id,business_unit_id,front_path,back_path,uploaded_by)
  values(r.id,r.company_id,r.business_unit_id,p_front,p_back,auth.uid());
 else
  if p_front is not null and old.front_path is not null and old.front_path<>p_front then replaced:=replaced||to_jsonb(old.front_path); end if;
  if p_back is not null and old.back_path is not null and old.back_path<>p_back then replaced:=replaced||to_jsonb(old.back_path); end if;
  update public.lodging_reservation_documents set front_path=coalesce(p_front,front_path),back_path=coalesce(p_back,back_path),uploaded_by=auth.uid()
  where reservation_id=r.id;
 end if;
 return jsonb_build_object('replaced',replaced);
end $$;
revoke execute on function public.lodging_set_reservation_documents(uuid,text,text) from public,anon;
grant execute on function public.lodging_set_reservation_documents(uuid,text,text) to authenticated;

commit;
