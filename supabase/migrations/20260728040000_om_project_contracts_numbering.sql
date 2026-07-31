begin;

-- Correlativo propio para contratos, mismo patron que cotizaciones
-- (om_quotation_sequences) y proyectos (om_project_sequences): tabla de
-- secuencia con RLS bloqueada para authenticated, incrementada solo via
-- funcion security definer, y una funcion security invoker que asigna
-- el numero una sola vez (idempotente) y queda sujeta a la misma RLS
-- de update que ya protege om_project_contracts.

alter table public.om_project_contracts add column contract_number text;
alter table public.om_project_contracts add column sequence_year smallint;
alter table public.om_project_contracts add column sequence_value bigint;
alter table public.om_project_contracts add constraint om_project_contracts_number_unique unique(company_id,contract_number);

create table public.om_project_contract_sequences(
 business_unit_id uuid not null references public.business_units(id) on delete cascade,year smallint not null,last_value bigint not null default 0,
 primary key(business_unit_id,year)
);
alter table public.om_project_contract_sequences enable row level security;
revoke all on public.om_project_contract_sequences from authenticated;
grant select,insert,update on public.om_project_contract_sequences to service_role;

create or replace function public.om_next_project_contract_sequence(target_unit uuid,target_year smallint) returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
 insert into public.om_project_contract_sequences(business_unit_id,year,last_value) values(target_unit,target_year,1)
 on conflict(business_unit_id,year) do update set last_value=public.om_project_contract_sequences.last_value+1 returning last_value into result;
 return result;
end $$;

-- Se llama directo desde la app (no hay un "crear contrato" en SQL como
-- en proyectos/cotizaciones, los borradores se insertan/editan como
-- filas planas). Idempotente: si ya tiene numero, lo retorna sin
-- reasignar. La actualizacion queda sujeta a la RLS de
-- om_project_contracts_update (unidad + permiso manage_documents), asi
-- que no duplica el chequeo de autorizacion.
create or replace function public.om_assign_project_contract_number(target_contract uuid) returns text language plpgsql security invoker set search_path='' as $$
declare c public.om_project_contracts; yr smallint; seq bigint; result text;
begin
 select * into strict c from public.om_project_contracts where id=target_contract for update;
 if c.contract_number is not null then return c.contract_number; end if;
 yr:=extract(year from now() at time zone 'America/Santiago')::smallint;
 seq:=public.om_next_project_contract_sequence(c.business_unit_id,yr);
 result:=format('CONT-OM-%s-%s',yr,lpad(seq::text,6,'0'));
 update public.om_project_contracts set contract_number=result,sequence_year=yr,sequence_value=seq where id=c.id;
 return result;
end $$;

revoke execute on function public.om_next_project_contract_sequence(uuid,smallint) from public,anon;
grant execute on function public.om_next_project_contract_sequence(uuid,smallint) to authenticated;
grant execute on function public.om_assign_project_contract_number(uuid) to authenticated;

commit;
