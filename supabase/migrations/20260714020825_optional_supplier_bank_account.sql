begin;

alter table public.payment_requests
  add column use_supplier_bank_account boolean not null default true;

comment on column public.payment_requests.use_supplier_bank_account is
  'Indica si la solicitud debe utilizar y congelar la cuenta bancaria registrada del proveedor.';

create or replace function public.prepare_payment_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit_code text;
  local_year smallint;
  next_value bigint;
  account public.supplier_bank_accounts%rowtype;
begin
  new.supplier_rut := public.normalize_chilean_rut(new.supplier_rut);

  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'Las solicitudes deben crearse como borrador';
  end if;

  if tg_op = 'UPDATE'
    and old.status in ('draft', 'correction_requested')
    and new.status = 'pending_approval' then
    if not exists (
      select 1
      from public.payment_request_attachments a
      where a.payment_request_id = old.id and a.deleted_at is null
    ) then
      raise exception 'Se requiere al menos un respaldo antes de enviar';
    end if;

    if new.use_supplier_bank_account then
      select * into account
      from public.supplier_bank_accounts a
      where a.supplier_id = new.supplier_id
        and a.company_id = new.company_id
        and a.active
        and a.deleted_at is null;

      if not found then
        raise exception 'Este proveedor no tiene una cuenta bancaria disponible';
      end if;
      if account.verification_status <> 'verified' then
        raise exception 'La cuenta bancaria del proveedor no está verificada';
      end if;

      new.supplier_bank_account_id := account.id;
      new.bank_name := account.bank_name;
      new.account_type := account.account_type;
      new.account_number := account.account_number;
      new.bank_account_holder_name := account.account_holder_name;
      new.bank_account_holder_rut := account.account_holder_rut;
      new.supplier_email := account.receipt_email;
      new.bank_verification_status := account.verification_status;
      new.bank_verified_at := account.verified_at;
    else
      new.supplier_bank_account_id := null;
      new.bank_name := null;
      new.account_type := null;
      new.account_number := null;
      new.bank_account_holder_name := null;
      new.bank_account_holder_rut := null;
      new.supplier_email := null;
      new.bank_verification_status := null;
      new.bank_verified_at := null;
    end if;

    if old.status = 'draft' then
      local_year := extract(year from (now() at time zone 'America/Santiago'))::smallint;
      insert into public.payment_request_sequences(company_id, business_unit_id, year, last_value)
      values (new.company_id, new.business_unit_id, local_year, 1)
      on conflict(company_id, business_unit_id, year)
      do update set
        last_value = public.payment_request_sequences.last_value + 1,
        updated_at = now()
      returning last_value into next_value;

      select code into unit_code
      from public.business_units
      where company_id = new.company_id and id = new.business_unit_id;

      new.sequence_year := local_year;
      new.sequence_value := next_value;
      new.request_number := format(
        '%s-%s-%s',
        unit_code,
        local_year,
        lpad(next_value::text, 6, '0')
      );
    end if;

    new.submitted_at := now();
    new.required_approval_rule_id := null;
    new.required_approval_level := null;
    new.approval_instance_id := null;
  end if;

  return new;
end
$$;

create or replace function public.guard_payment_request_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.created_by <> old.created_by or new.requester_id <> old.requester_id then
    raise exception 'Identidad de solicitud inmutable';
  end if;

  if old.status not in ('draft', 'correction_requested') and (
    new.company_id is distinct from old.company_id
    or new.business_unit_id is distinct from old.business_unit_id
    or new.amount is distinct from old.amount
    or new.currency is distinct from old.currency
    or new.request_type is distinct from old.request_type
    or new.supplier_id is distinct from old.supplier_id
    or new.supplier_rut is distinct from old.supplier_rut
    or new.expense_category_id is distinct from old.expense_category_id
    or new.cost_center_id is distinct from old.cost_center_id
    or new.description is distinct from old.description
    or new.priority is distinct from old.priority
    or new.requested_payment_date is distinct from old.requested_payment_date
    or new.use_supplier_bank_account is distinct from old.use_supplier_bank_account
    or new.supplier_bank_account_id is distinct from old.supplier_bank_account_id
    or new.bank_name is distinct from old.bank_name
    or new.account_type is distinct from old.account_type
    or new.account_number is distinct from old.account_number
    or new.bank_account_holder_name is distinct from old.bank_account_holder_name
    or new.bank_account_holder_rut is distinct from old.bank_account_holder_rut
    or new.supplier_email is distinct from old.supplier_email
    or new.bank_verification_status is distinct from old.bank_verification_status
    or new.bank_verified_at is distinct from old.bank_verified_at
  ) then
    raise exception 'Los datos financieros no pueden modificarse después del envío';
  end if;

  return new;
end
$$;

revoke execute on function public.prepare_payment_request() from public, anon, authenticated;
revoke execute on function public.guard_payment_request_update() from public, anon, authenticated;

commit;
