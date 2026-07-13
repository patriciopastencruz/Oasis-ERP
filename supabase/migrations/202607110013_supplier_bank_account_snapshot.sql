begin;

create type public.bank_account_verification_status as enum ('pending','verified','rejected');

create table public.supplier_bank_accounts(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  bank_name text not null,
  account_type public.account_type not null,
  account_number text not null,
  account_holder_name text not null,
  account_holder_rut text not null,
  receipt_email text,
  active boolean not null default true,
  verification_status public.bank_account_verification_status not null default 'pending',
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  verification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  deleted_at timestamptz,
  foreign key(company_id,supplier_id) references public.suppliers(company_id,id),
  unique(supplier_id),unique(company_id,id),
  check(public.is_valid_chilean_rut(account_holder_rut)),
  check((verification_status='verified' and verified_at is not null and verified_by is not null) or verification_status<>'verified')
);
create index supplier_bank_accounts_company_idx on public.supplier_bank_accounts(company_id,supplier_id) where deleted_at is null;
create trigger supplier_bank_accounts_updated_at before update on public.supplier_bank_accounts for each row execute function public.set_updated_at();
create trigger audit_supplier_bank_accounts after insert or update or delete on public.supplier_bank_accounts for each row execute function public.audit_row_change();

insert into public.permissions(key,module,description) values
 ('finance.supplier_bank_accounts.view','finance','Consultar cuentas bancarias de proveedores'),
 ('finance.supplier_bank_accounts.manage','finance','Administrar cuentas bancarias de proveedores'),
 ('finance.supplier_bank_accounts.verify','finance','Verificar cuentas bancarias de proveedores')
on conflict(key) do update set description=excluded.description,active=true;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in('superadmin','finance_manager') and p.key in('finance.supplier_bank_accounts.view','finance.supplier_bank_accounts.manage','finance.supplier_bank_accounts.verify')
on conflict do nothing;

alter table public.supplier_bank_accounts enable row level security;
create policy supplier_bank_accounts_select on public.supplier_bank_accounts for select to authenticated
using(public.can_access_company(company_id) and public.has_permission('finance.supplier_bank_accounts.view'));
grant select on public.supplier_bank_accounts to authenticated;
grant select,insert,update,delete on public.supplier_bank_accounts to service_role;
revoke insert,update,delete on public.supplier_bank_accounts from authenticated;

create or replace function public.save_supplier_bank_account(
 target_supplier uuid,target_bank text,target_type public.account_type,target_number text,
 target_holder text,target_holder_rut text,target_email text,target_active boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); supplier public.suppliers%rowtype; account_id uuid;
begin
 if actor is null or not public.current_user_active() or not public.has_permission('finance.supplier_bank_accounts.manage') then raise exception 'Usuario no autorizado'; end if;
 select * into supplier from public.suppliers where id=target_supplier and deleted_at is null;
 if not found or not public.can_access_company(supplier.company_id) then raise exception 'Proveedor no autorizado'; end if;
 if not public.is_valid_chilean_rut(target_holder_rut) then raise exception 'RUT del titular inválido'; end if;
 insert into public.supplier_bank_accounts(company_id,supplier_id,bank_name,account_type,account_number,account_holder_name,account_holder_rut,receipt_email,active,verification_status,created_by)
 values(supplier.company_id,supplier.id,btrim(target_bank),target_type,btrim(target_number),btrim(target_holder),public.normalize_chilean_rut(target_holder_rut),nullif(btrim(target_email),''),target_active,'pending',actor)
 on conflict(supplier_id) do update set bank_name=excluded.bank_name,account_type=excluded.account_type,account_number=excluded.account_number,
  account_holder_name=excluded.account_holder_name,account_holder_rut=excluded.account_holder_rut,receipt_email=excluded.receipt_email,active=excluded.active,
  verification_status='pending',verified_at=null,verified_by=null,verification_notes=null,deleted_at=null
 returning id into account_id;return account_id;
end $$;

create or replace function public.verify_supplier_bank_account(target_account uuid,target_status public.bank_account_verification_status,target_notes text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); account public.supplier_bank_accounts%rowtype;
begin
 if actor is null or not public.current_user_active() or not public.has_permission('finance.supplier_bank_accounts.verify') then raise exception 'Usuario no autorizado'; end if;
 if target_status not in('verified','rejected') then raise exception 'Estado de verificación inválido'; end if;
 select * into account from public.supplier_bank_accounts where id=target_account for update;
 if not found or not public.can_access_company(account.company_id) then raise exception 'Cuenta no autorizada'; end if;
 update public.supplier_bank_accounts set verification_status=target_status,verified_at=case when target_status='verified' then now() else null end,
  verified_by=actor,verification_notes=nullif(btrim(target_notes),'') where id=target_account;return target_account;
end $$;

revoke all on function public.save_supplier_bank_account(uuid,text,public.account_type,text,text,text,text,boolean) from public,anon;
revoke all on function public.verify_supplier_bank_account(uuid,public.bank_account_verification_status,text) from public,anon;
grant execute on function public.save_supplier_bank_account(uuid,text,public.account_type,text,text,text,text,boolean) to authenticated,service_role;
grant execute on function public.verify_supplier_bank_account(uuid,public.bank_account_verification_status,text) to authenticated,service_role;

alter table public.payment_requests add column supplier_bank_account_id uuid;
alter table public.payment_requests add column bank_account_holder_name text;
alter table public.payment_requests add column bank_account_holder_rut text;
alter table public.payment_requests add column bank_verification_status public.bank_account_verification_status;
alter table public.payment_requests add column bank_verified_at timestamptz;
alter table public.payment_requests add constraint payment_requests_bank_account_fk foreign key(company_id,supplier_bank_account_id) references public.supplier_bank_accounts(company_id,id);

create or replace function public.prepare_payment_request()
returns trigger language plpgsql security definer set search_path='' as $$
declare unit_code text;local_year smallint;next_value bigint;account public.supplier_bank_accounts%rowtype;
begin
 new.supplier_rut:=public.normalize_chilean_rut(new.supplier_rut);
 if tg_op='INSERT' and new.status<>'draft' then raise exception 'Las solicitudes deben crearse como borrador';end if;
 if tg_op='UPDATE' and old.status in('draft','correction_requested') and new.status='pending_approval' then
  if not exists(select 1 from public.payment_request_attachments a where a.payment_request_id=old.id and a.deleted_at is null) then raise exception 'Se requiere al menos un respaldo antes de enviar';end if;
  select * into account from public.supplier_bank_accounts a where a.supplier_id=new.supplier_id and a.company_id=new.company_id and a.active and a.deleted_at is null;
  if not found then raise exception 'Este proveedor no tiene una cuenta bancaria disponible';end if;
  if account.verification_status<>'verified' then raise exception 'La cuenta bancaria del proveedor no está verificada';end if;
  new.supplier_bank_account_id:=account.id;new.bank_name:=account.bank_name;new.account_type:=account.account_type;new.account_number:=account.account_number;
  new.bank_account_holder_name:=account.account_holder_name;new.bank_account_holder_rut:=account.account_holder_rut;new.supplier_email:=account.receipt_email;
  new.bank_verification_status:=account.verification_status;new.bank_verified_at:=account.verified_at;
  if old.status='draft' then
   local_year:=extract(year from(now() at time zone 'America/Santiago'))::smallint;
   insert into public.payment_request_sequences(company_id,business_unit_id,year,last_value) values(new.company_id,new.business_unit_id,local_year,1)
   on conflict(company_id,business_unit_id,year) do update set last_value=public.payment_request_sequences.last_value+1,updated_at=now() returning last_value into next_value;
   select code into unit_code from public.business_units where company_id=new.company_id and id=new.business_unit_id;
   new.sequence_year:=local_year;new.sequence_value:=next_value;new.request_number:=format('%s-%s-%s',unit_code,local_year,lpad(next_value::text,6,'0'));
  end if;
  new.submitted_at:=now();new.required_approval_rule_id:=null;new.required_approval_level:=null;new.approval_instance_id:=null;
 end if;return new;
end $$;

create or replace function public.guard_payment_request_update()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.id<>old.id or new.created_by<>old.created_by or new.requester_id<>old.requester_id then raise exception 'Identidad de solicitud inmutable';end if;
 if old.status not in('draft','correction_requested') and(
  new.company_id is distinct from old.company_id or new.business_unit_id is distinct from old.business_unit_id or new.amount is distinct from old.amount
  or new.currency is distinct from old.currency or new.request_type is distinct from old.request_type or new.supplier_id is distinct from old.supplier_id
  or new.supplier_rut is distinct from old.supplier_rut or new.expense_category_id is distinct from old.expense_category_id or new.cost_center_id is distinct from old.cost_center_id
  or new.description is distinct from old.description or new.priority is distinct from old.priority or new.requested_payment_date is distinct from old.requested_payment_date
  or new.supplier_bank_account_id is distinct from old.supplier_bank_account_id or new.bank_name is distinct from old.bank_name or new.account_type is distinct from old.account_type
  or new.account_number is distinct from old.account_number or new.bank_account_holder_name is distinct from old.bank_account_holder_name
  or new.bank_account_holder_rut is distinct from old.bank_account_holder_rut or new.supplier_email is distinct from old.supplier_email
  or new.bank_verification_status is distinct from old.bank_verification_status or new.bank_verified_at is distinct from old.bank_verified_at
 )then raise exception 'Los datos financieros no pueden modificarse después del envío';end if;return new;
end $$;

commit;
