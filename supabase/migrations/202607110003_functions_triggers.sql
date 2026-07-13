begin;

create or replace function public.normalize_chilean_rut(value text)
returns text language sql immutable strict set search_path = '' as $$
  select upper(regexp_replace(value, '[^0-9kK]', '', 'g'))
$$;

create or replace function public.is_valid_chilean_rut(value text)
returns boolean language plpgsql immutable strict set search_path = '' as $$
declare cleaned text; body text; expected text; total integer := 0; multiplier integer := 2; i integer; remainder integer;
begin
  cleaned := public.normalize_chilean_rut(value);
  if cleaned !~ '^[0-9]{7,8}[0-9K]$' then return false; end if;
  body := left(cleaned, length(cleaned) - 1); expected := right(cleaned, 1);
  for i in reverse length(body)..1 loop
    total := total + substr(body, i, 1)::integer * multiplier;
    multiplier := case when multiplier = 7 then 2 else multiplier + 1 end;
  end loop;
  remainder := 11 - (total % 11);
  return expected = case when remainder = 11 then '0' when remainder = 10 then 'K' else remainder::text end;
end $$;

alter table public.companies add constraint companies_valid_rut check (public.is_valid_chilean_rut(rut));
alter table public.suppliers add constraint suppliers_valid_rut check (public.is_valid_chilean_rut(rut));
alter table public.payment_requests add constraint payment_requests_valid_supplier_rut check (public.is_valid_chilean_rut(supplier_rut));

create or replace function public.normalize_rut_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.rut := public.normalize_chilean_rut(new.rut);
  return new;
end $$;
create trigger companies_normalize_rut before insert or update of rut on public.companies for each row execute function public.normalize_rut_columns();
create trigger suppliers_normalize_rut before insert or update of rut on public.suppliers for each row execute function public.normalize_rut_columns();

create or replace function public.prepare_payment_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare unit_code text; local_year smallint; next_value bigint;
begin
  new.supplier_rut := public.normalize_chilean_rut(new.supplier_rut);
  if tg_op = 'INSERT' and new.status <> 'draft' then raise exception 'Las solicitudes deben crearse como borrador'; end if;
  if tg_op = 'UPDATE' and old.status = 'draft' and new.status = 'pending_approval' then
    if not exists (select 1 from public.payment_request_attachments a where a.payment_request_id = old.id and a.deleted_at is null) then
      raise exception 'Se requiere al menos un respaldo antes de enviar';
    end if;
    select ar.id, ar.approval_level into new.required_approval_rule_id, new.required_approval_level
      from public.approval_rules ar where ar.company_id = new.company_id and ar.business_unit_id = new.business_unit_id
       and ar.active and ar.deleted_at is null and new.amount <@ ar.amount_range
       and current_date >= ar.valid_from and (ar.valid_until is null or current_date <= ar.valid_until);
    if new.required_approval_rule_id is null then raise exception 'No existe regla de aprobación aplicable'; end if;
    local_year := extract(year from (now() at time zone 'America/Santiago'))::smallint;
    insert into public.payment_request_sequences(company_id, business_unit_id, year, last_value)
      values (new.company_id, new.business_unit_id, local_year, 1)
      on conflict (company_id, business_unit_id, year) do update set last_value = public.payment_request_sequences.last_value + 1, updated_at = now()
      returning last_value into next_value;
    select code into unit_code from public.business_units where company_id = new.company_id and id = new.business_unit_id;
    new.sequence_year := local_year; new.sequence_value := next_value;
    new.request_number := format('%s-%s-%s', unit_code, local_year, lpad(next_value::text, 6, '0'));
    new.submitted_at := now();
  end if;
  return new;
end $$;

create or replace function public.guard_payment_request_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.created_by <> old.created_by or new.requester_id <> old.requester_id then
    raise exception 'Identidad de solicitud inmutable';
  end if;
  if old.status not in ('draft','correction_requested') and (
    new.company_id is distinct from old.company_id or new.business_unit_id is distinct from old.business_unit_id
    or new.amount is distinct from old.amount or new.currency is distinct from old.currency
    or new.request_type is distinct from old.request_type or new.supplier_id is distinct from old.supplier_id
    or new.supplier_rut is distinct from old.supplier_rut or new.expense_category_id is distinct from old.expense_category_id
    or new.cost_center_id is distinct from old.cost_center_id or new.description is distinct from old.description
    or new.priority is distinct from old.priority or new.requested_payment_date is distinct from old.requested_payment_date
    or new.required_approval_rule_id is distinct from old.required_approval_rule_id
  ) then raise exception 'Los datos financieros no pueden modificarse después del envío'; end if;
  return new;
end $$;

create or replace function public.validate_payment_request_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = new.status then return new; end if;
  if not ((old.status = 'draft' and new.status = 'pending_approval') or
    (old.status = 'pending_approval' and new.status in ('under_review','approved','rejected','correction_requested')) or
    (old.status = 'under_review' and new.status in ('approved','rejected','correction_requested')) or
    (old.status = 'correction_requested' and new.status = 'pending_approval') or
    (old.status = 'approved' and new.status in ('scheduled','cancelled')) or
    (old.status = 'scheduled' and new.status in ('paid','cancelled'))) then
    raise exception 'Transición de estado no permitida: % -> %', old.status, new.status;
  end if;
  if new.status = 'approved' then new.approved_at := now(); end if;
  if new.status = 'rejected' then new.rejected_at := now(); end if;
  if new.status = 'cancelled' and nullif(btrim(new.cancellation_reason), '') is null then raise exception 'La anulación requiere justificación'; end if;
  return new;
end $$;

create trigger payment_requests_guard before update on public.payment_requests for each row execute function public.guard_payment_request_update();
create trigger payment_requests_prepare before insert or update on public.payment_requests for each row execute function public.prepare_payment_request();
create trigger payment_requests_transition before update of status on public.payment_requests for each row execute function public.validate_payment_request_transition();

create or replace function public.prepare_approval_action()
returns trigger language plpgsql set search_path = '' as $$
begin
  select pr.company_id, pr.business_unit_id, pr.amount, pr.required_approval_level, p.role_id
  into new.company_id, new.business_unit_id, new.request_amount_at_action, new.approval_level, new.role_id_at_action
  from public.payment_requests pr cross join public.profiles p
  where pr.id = new.payment_request_id and p.id = auth.uid();
  if not found then raise exception 'Solicitud o aprobador inválido'; end if;
  new.approver_id := auth.uid();
  return new;
end $$;
create trigger approval_actions_prepare before insert on public.approval_actions for each row execute function public.prepare_approval_action();

create or replace function public.guard_payment_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.company_id <> old.company_id or new.business_unit_id <> old.business_unit_id
    or new.payment_request_id <> old.payment_request_id or new.created_by <> old.created_by
    or new.scheduled_by <> old.scheduled_by then raise exception 'Identidad del pago inmutable'; end if;
  if old.paid_at is not null then raise exception 'Un pago ejecutado es inmutable'; end if;
  if new.paid_at is not null then new.paid_by := auth.uid(); end if;
  return new;
end $$;
create trigger payments_guard before update on public.payments for each row execute function public.guard_payment_update();

create or replace function public.process_petty_cash_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare account public.petty_cash_accounts%rowtype; delta numeric(18,2);
begin
  if new.status <> 'posted' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'posted' then raise exception 'Un movimiento contabilizado es inmutable'; end if;
  select * into account from public.petty_cash_accounts where id = new.petty_cash_account_id for update;
  if not found or not account.active then raise exception 'Caja chica no disponible'; end if;
  if account.company_id <> new.company_id or account.business_unit_id <> new.business_unit_id then raise exception 'Movimiento y caja pertenecen a ámbitos distintos'; end if;
  new.balance_before := account.current_balance;
  delta := case new.movement_type when 'expense' then -new.amount when 'replenishment' then new.amount else new.amount end;
  new.balance_after := new.balance_before + delta;
  if new.balance_after < 0 then raise exception 'Saldo insuficiente'; end if;
  if new.movement_type = 'replenishment' and new.balance_after > account.target_amount then raise exception 'La reposición supera el fondo objetivo'; end if;
  update public.petty_cash_accounts set current_balance = new.balance_after where id = account.id;
  return new;
end $$;
create trigger petty_cash_process before insert or update of status on public.petty_cash_movements for each row execute function public.process_petty_cash_movement();

create or replace function public.validate_paid_request()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.paid_at is not null and (tg_op = 'INSERT' or old.paid_at is null) then
    if not new.receipt_waived and not exists (select 1 from public.payment_receipts r where r.payment_id = new.id and r.deleted_at is null) then
      raise exception 'Se requiere comprobante o justificación autorizada';
    end if;
  end if;
  return new;
end $$;
create constraint trigger payments_require_receipt after insert or update of paid_at on public.payments deferrable initially deferred for each row execute function public.validate_paid_request();

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb; company uuid; unit uuid; entity uuid;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  company := nullif(row_data->>'company_id','')::uuid; unit := nullif(row_data->>'business_unit_id','')::uuid; entity := nullif(row_data->>'id','')::uuid;
  insert into public.audit_logs(company_id, business_unit_id, actor_id, action, entity_type, entity_id, old_data, new_data)
  values (company, unit, auth.uid(), lower(tg_op), tg_table_name, entity,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger audit_suppliers after insert or update or delete on public.suppliers for each row execute function public.audit_row_change();
create trigger audit_companies after insert or update or delete on public.companies for each row execute function public.audit_row_change();
create trigger audit_business_units after insert or update or delete on public.business_units for each row execute function public.audit_row_change();
create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function public.audit_row_change();
create trigger audit_roles after insert or update or delete on public.roles for each row execute function public.audit_row_change();
create trigger audit_role_permissions after insert or update or delete on public.role_permissions for each row execute function public.audit_row_change();
create trigger audit_user_companies after insert or update or delete on public.user_companies for each row execute function public.audit_row_change();
create trigger audit_user_business_units after insert or update or delete on public.user_business_units for each row execute function public.audit_row_change();
create trigger audit_approval_rules after insert or update or delete on public.approval_rules for each row execute function public.audit_row_change();
create trigger audit_payment_requests after insert or update or delete on public.payment_requests for each row execute function public.audit_row_change();
create trigger audit_approval_actions after insert on public.approval_actions for each row execute function public.audit_row_change();
create trigger audit_payments after insert or update or delete on public.payments for each row execute function public.audit_row_change();
create trigger audit_petty_cash_movements after insert or update on public.petty_cash_movements for each row execute function public.audit_row_change();
create trigger audit_petty_cash_accounts after insert or update on public.petty_cash_accounts for each row execute function public.audit_row_change();

create or replace function public.notify_payment_request_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = new.status then return new; end if;
  if new.status = 'pending_approval' then
    insert into public.notifications(company_id, business_unit_id, recipient_id, event_key, title, body, entity_type, entity_id, created_by)
    select new.company_id, new.business_unit_id, p.id, 'payment_request.approval_assigned',
      'Aprobación pendiente', 'La solicitud ' || new.request_number || ' requiere revisión.', 'payment_request', new.id, auth.uid()
    from public.profiles p
    join public.user_business_units ubu on ubu.user_id = p.id and ubu.company_id = new.company_id and ubu.business_unit_id = new.business_unit_id
    join public.approval_rules ar on ar.id = new.required_approval_rule_id and ar.required_role_id = p.role_id
    where p.active and p.deleted_at is null;
  elsif new.status in ('approved','rejected','correction_requested','scheduled','paid','cancelled') then
    insert into public.notifications(company_id, business_unit_id, recipient_id, event_key, title, body, entity_type, entity_id, created_by)
    values (new.company_id, new.business_unit_id, new.requester_id, 'payment_request.' || new.status::text,
      'Solicitud ' || replace(new.status::text, '_', ' '), 'La solicitud ' || coalesce(new.request_number, new.id::text) || ' cambió de estado.',
      'payment_request', new.id, auth.uid());
  end if;
  return new;
end $$;
create trigger payment_request_notifications after update of status on public.payment_requests for each row execute function public.notify_payment_request_change();

revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.prepare_payment_request() from public, anon, authenticated;
revoke execute on function public.guard_payment_request_update() from public, anon, authenticated;
revoke execute on function public.prepare_approval_action() from public, anon, authenticated;
revoke execute on function public.guard_payment_update() from public, anon, authenticated;
revoke execute on function public.process_petty_cash_movement() from public, anon, authenticated;
revoke execute on function public.notify_payment_request_change() from public, anon, authenticated;

commit;
