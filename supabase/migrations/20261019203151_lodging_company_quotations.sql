begin;

-- Cotizaciones de hospedaje a empresas (módulo Gestión de reservas). Las crea
-- recepción (y administración). Nada se borra: una cotización se anula con
-- motivo. Los totales los calcula siempre la base de datos; el navegador solo
-- envía descripción, cantidad, valor neto por noche y noches.

insert into public.permissions(key,module,description) values
 ('lodging.quotations.manage','lodging','Crear, ver, descargar y anular cotizaciones de hospedaje a empresas')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='lodging.quotations.manage' and r.key in('receptionist','administrator','superadmin','general_manager')
on conflict do nothing;

-- Correlativo por hostal y año (uso interno de la función de creación).
create table public.lodging_quotation_counters(
 business_unit_id uuid not null references public.business_units(id),
 year smallint not null,
 last_value bigint not null default 0,
 primary key(business_unit_id,year)
);
alter table public.lodging_quotation_counters enable row level security;
revoke all on public.lodging_quotation_counters from public,anon,authenticated;
grant select,insert,update on public.lodging_quotation_counters to service_role;

create table public.lodging_quotations(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 quotation_number text not null,
 issued_on date not null,
 client_company text not null check(char_length(btrim(client_company)) between 2 and 160),
 client_rut text check(char_length(client_rut)<=30),
 client_contact text check(char_length(client_contact)<=160),
 client_email text check(char_length(client_email)<=160),
 hostel_address text check(char_length(hostel_address)<=200),
 service_detail text check(char_length(service_detail)<=1000),
 check_in date,
 check_out date,
 net numeric(14,0) not null check(net>=0),
 iva numeric(14,0) not null check(iva>=0),
 total numeric(14,0) not null check(total>=0),
 status text not null default 'issued' check(status in('issued','voided')),
 void_reason text check(void_reason is null or char_length(void_reason) between 5 and 500),
 voided_by uuid references public.profiles(id),
 voided_at timestamptz,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(business_unit_id,quotation_number),
 check(check_in is null or check_out is null or check_out>check_in),
 check(status<>'voided' or (void_reason is not null and voided_by is not null and voided_at is not null))
);
create index lodging_quotations_unit_idx on public.lodging_quotations(company_id,business_unit_id,issued_on desc,created_at desc);
create index lodging_quotations_creator_idx on public.lodging_quotations(created_by);

create table public.lodging_quotation_lines(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 quotation_id uuid not null references public.lodging_quotations(id),
 position smallint not null,
 description text not null check(char_length(btrim(description)) between 1 and 200),
 quantity integer not null check(quantity between 1 and 100),
 unit_net numeric(14,0) not null check(unit_net between 0 and 100000000),
 nights integer not null check(nights between 1 and 365),
 subtotal numeric(14,0) not null,
 iva numeric(14,0) not null,
 total numeric(14,0) not null,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
 unique(quotation_id,position)
);
create index lodging_quotation_lines_unit_idx on public.lodging_quotation_lines(company_id,business_unit_id);

create table public.lodging_quotation_photos(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 quotation_id uuid not null references public.lodging_quotations(id),
 object_path text not null unique,
 original_name text not null check(char_length(original_name)<=200),
 mime_type text not null check(mime_type in('image/jpeg','image/png','image/webp')),
 size_bytes bigint not null check(size_bytes between 1 and 10485760),
 uploaded_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lodging_quotation_photos_quotation_idx on public.lodging_quotation_photos(quotation_id);
create index lodging_quotation_photos_unit_idx on public.lodging_quotation_photos(company_id,business_unit_id);

create trigger audit_lodging_quotations after insert or update or delete on public.lodging_quotations for each row execute function public.audit_row_change();
create trigger audit_lodging_quotation_lines after insert or update or delete on public.lodging_quotation_lines for each row execute function public.audit_row_change();
create trigger audit_lodging_quotation_photos after insert or update or delete on public.lodging_quotation_photos for each row execute function public.audit_row_change();

alter table public.lodging_quotations enable row level security;
alter table public.lodging_quotation_lines enable row level security;
alter table public.lodging_quotation_photos enable row level security;
create policy lodging_quotations_read on public.lodging_quotations for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.quotations.manage'));
create policy lodging_quotation_lines_read on public.lodging_quotation_lines for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.quotations.manage'));
create policy lodging_quotation_photos_read on public.lodging_quotation_photos for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('lodging.quotations.manage'));
revoke all on public.lodging_quotations,public.lodging_quotation_lines,public.lodging_quotation_photos from public,anon,authenticated;
grant select on public.lodging_quotations,public.lodging_quotation_lines,public.lodging_quotation_photos to authenticated;
grant select,insert,update,delete on public.lodging_quotations,public.lodging_quotation_lines,public.lodging_quotation_photos to service_role;

-- ---------- Crear ----------
create or replace function public.lodging_create_quotation(target_unit uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); u public.business_units; yr smallint; seq bigint; v_id uuid; l jsonb; i integer:=0;
 v_company text:=btrim(coalesce(payload->>'client_company',''));
 v_in date:=nullif(payload->>'check_in','')::date; v_out date:=nullif(payload->>'check_out','')::date;
 q integer; unit_net numeric; nights integer; sub numeric; vat numeric; t_net numeric:=0; t_iva numeric:=0; lines jsonb:=payload->'lines';
begin
 select * into u from public.business_units where id=target_unit and deleted_at is null;
 if me is null or u.id is null or u.code not in('HU','HOC','HOB') or not public.can_access_unit(u.company_id,u.id)
  or not public.has_permission('lodging.quotations.manage') then raise exception 'Sin autorizacion'; end if;
 if char_length(v_company)<2 or char_length(v_company)>160 then raise exception 'Indica la empresa'; end if;
 if lines is null or jsonb_typeof(lines)<>'array' or jsonb_array_length(lines)<1 then raise exception 'La cotizacion requiere al menos un item'; end if;
 if jsonb_array_length(lines)>20 then raise exception 'Maximo 20 items'; end if;
 if v_in is not null and v_out is not null and v_out<=v_in then raise exception 'La salida debe ser posterior a la entrada'; end if;
 yr:=extract(year from now() at time zone 'America/Santiago')::smallint;
 insert into public.lodging_quotation_counters(business_unit_id,year,last_value) values(u.id,yr,1)
  on conflict(business_unit_id,year) do update set last_value=public.lodging_quotation_counters.last_value+1 returning last_value into seq;
 insert into public.lodging_quotations(company_id,business_unit_id,quotation_number,issued_on,client_company,client_rut,client_contact,client_email,hostel_address,service_detail,check_in,check_out,net,iva,total,created_by)
 values(u.company_id,u.id,format('COT-%s-%s-%s',u.code,yr,lpad(seq::text,4,'0')),(now() at time zone 'America/Santiago')::date,v_company,
  nullif(btrim(coalesce(payload->>'client_rut','')),''),nullif(btrim(coalesce(payload->>'client_contact','')),''),nullif(btrim(coalesce(payload->>'client_email','')),''),
  nullif(btrim(coalesce(payload->>'hostel_address','')),''),nullif(btrim(coalesce(payload->>'service_detail','')),''),v_in,v_out,0,0,0,me) returning id into v_id;
 for l in select * from jsonb_array_elements(lines) loop
  i:=i+1;
  q:=(l->>'quantity')::integer; unit_net:=(l->>'unit_net')::numeric; nights:=(l->>'nights')::integer;
  if q is null or q<1 or unit_net is null or unit_net<0 or unit_net<>trunc(unit_net) or nights is null or nights<1 then raise exception 'Item % invalido',i; end if;
  sub:=q*unit_net*nights; vat:=round(sub*0.19);
  insert into public.lodging_quotation_lines(company_id,business_unit_id,quotation_id,position,description,quantity,unit_net,nights,subtotal,iva,total)
  values(u.company_id,u.id,v_id,i,btrim(coalesce(l->>'description','')),q,unit_net,nights,sub,vat,sub+vat);
  t_net:=t_net+sub; t_iva:=t_iva+vat;
 end loop;
 update public.lodging_quotations set net=t_net,iva=t_iva,total=t_net+t_iva where id=v_id;
 return v_id;
end $$;
revoke execute on function public.lodging_create_quotation(uuid,jsonb) from public,anon;
grant execute on function public.lodging_create_quotation(uuid,jsonb) to authenticated;

-- ---------- Anular ----------
create or replace function public.lodging_void_quotation(target_quotation uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); q public.lodging_quotations; v_reason text:=btrim(coalesce(reason,''));
begin
 select * into q from public.lodging_quotations where id=target_quotation for update;
 if me is null or q.id is null or not public.can_access_unit(q.company_id,q.business_unit_id) or not public.has_permission('lodging.quotations.manage') then raise exception 'Sin autorizacion'; end if;
 if q.status<>'issued' then raise exception 'La cotizacion ya esta anulada'; end if;
 if char_length(v_reason)<5 then raise exception 'Indica el motivo de la anulacion'; end if;
 update public.lodging_quotations set status='voided',void_reason=left(v_reason,500),voided_by=me,voided_at=now(),updated_at=now() where id=q.id;
end $$;
revoke execute on function public.lodging_void_quotation(uuid,text) from public,anon;
grant execute on function public.lodging_void_quotation(uuid,text) to authenticated;

-- ---------- Fotos (bucket privado ya existente 'lodging-operations') ----------
create or replace function public.lodging_quotation_attach(target_quotation uuid,object_path text,mime text,size_bytes bigint,original_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare q public.lodging_quotations; v_id uuid;
begin
 select * into q from public.lodging_quotations where id=target_quotation for update;
 if q.id is null or not public.can_access_unit(q.company_id,q.business_unit_id) or not public.has_permission('lodging.quotations.manage') then raise exception 'Sin autorizacion'; end if;
 if object_path not like q.company_id::text||'/'||q.business_unit_id::text||'/'||q.id::text||'/%' then raise exception 'Ruta invalida'; end if;
 if (select count(*) from public.lodging_quotation_photos where quotation_id=q.id)>=4 then raise exception 'Maximo 4 fotos'; end if;
 insert into public.lodging_quotation_photos(company_id,business_unit_id,quotation_id,object_path,original_name,mime_type,size_bytes,uploaded_by)
 values(q.company_id,q.business_unit_id,q.id,object_path,left(coalesce(original_name,'foto'),200),mime,size_bytes,auth.uid()) returning id into v_id;
 return v_id;
end $$;
revoke execute on function public.lodging_quotation_attach(uuid,text,text,bigint,text) from public,anon;
grant execute on function public.lodging_quotation_attach(uuid,text,text,bigint,text) to authenticated;

create or replace function public.lodging_quotation_storage_access(object_name text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare parts text[]:=string_to_array(object_name,'/'); q public.lodging_quotations;
begin
 if array_length(parts,1)<>4 or parts[3] !~ '^[0-9a-f-]{36}$' then return false; end if;
 select * into q from public.lodging_quotations where id=parts[3]::uuid;
 return q.id is not null and q.company_id::text=parts[1] and q.business_unit_id::text=parts[2]
  and public.can_access_unit(q.company_id,q.business_unit_id) and public.has_permission('lodging.quotations.manage');
end $$;
revoke execute on function public.lodging_quotation_storage_access(text) from public,anon;
grant execute on function public.lodging_quotation_storage_access(text) to authenticated;

create policy lodging_quotation_objects_insert on storage.objects for insert to authenticated
with check (bucket_id='lodging-operations' and public.lodging_quotation_storage_access(name));
create policy lodging_quotation_objects_read on storage.objects for select to authenticated
using (bucket_id='lodging-operations' and public.lodging_quotation_storage_access(name));

commit;
