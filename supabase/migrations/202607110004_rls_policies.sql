begin;

create or replace function public.current_user_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.deleted_at is null)
$$;
create or replace function public.has_permission(permission_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.role_permissions rp on rp.role_id = p.role_id
    join public.permissions pm on pm.id = rp.permission_id
    where p.id = auth.uid() and p.active and p.deleted_at is null and pm.key = permission_key and pm.active
  )
$$;
create or replace function public.can_access_company(target_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_user_active() and exists (
    select 1 from public.user_companies uc where uc.user_id = auth.uid() and uc.company_id = target_company
  )
$$;
create or replace function public.can_access_unit(target_company uuid, target_unit uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_user_active() and exists (
    select 1 from public.user_business_units ubu where ubu.user_id = auth.uid()
      and ubu.company_id = target_company and ubu.business_unit_id = target_unit
  )
$$;
create or replace function public.can_view_request(r public.payment_requests)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_user_active() and (
    r.requester_id = auth.uid()
    or (public.can_access_unit(r.company_id, r.business_unit_id) and public.has_permission('finance.payment_requests.view_unit'))
    or (public.can_access_company(r.company_id) and public.has_permission('finance.payment_requests.view_company'))
  )
$$;
create or replace function public.can_approve_request(request_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.payment_requests pr
    join public.approval_rules ar on ar.id = pr.required_approval_rule_id
    join public.profiles me on me.id = auth.uid()
    join public.roles my_role on my_role.id = me.role_id
    where pr.id = request_id and me.active and me.deleted_at is null
      and pr.status in ('pending_approval','under_review')
      and public.can_access_unit(pr.company_id, pr.business_unit_id)
      and public.has_permission('finance.approvals.decide')
      and (me.role_id = ar.required_role_id or my_role.key in ('general_manager','superadmin'))
  )
$$;

revoke execute on function public.current_user_active() from public, anon;
revoke execute on function public.has_permission(text) from public, anon;
revoke execute on function public.can_access_company(uuid) from public, anon;
revoke execute on function public.can_access_unit(uuid, uuid) from public, anon;
revoke execute on function public.can_view_request(public.payment_requests) from public, anon;
revoke execute on function public.can_approve_request(uuid) from public, anon;
grant execute on function public.current_user_active(), public.has_permission(text), public.can_access_company(uuid), public.can_access_unit(uuid, uuid), public.can_view_request(public.payment_requests), public.can_approve_request(uuid) to authenticated;

alter table public.companies enable row level security;
alter table public.business_units enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_companies enable row level security;
alter table public.user_business_units enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.suppliers enable row level security;
alter table public.expense_categories enable row level security;
alter table public.cost_centers enable row level security;
alter table public.payment_request_sequences enable row level security;
alter table public.approval_rules enable row level security;
alter table public.payment_requests enable row level security;
alter table public.payment_request_attachments enable row level security;
alter table public.approval_actions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.petty_cash_accounts enable row level security;
alter table public.petty_cash_movements enable row level security;

create policy companies_select on public.companies for select to authenticated using (public.can_access_company(id));
create policy companies_admin on public.companies for all to authenticated using (public.has_permission('administration.companies.manage')) with check (public.has_permission('administration.companies.manage'));
create policy units_select on public.business_units for select to authenticated using (public.can_access_company(company_id));
create policy units_admin on public.business_units for all to authenticated using (public.has_permission('administration.business_units.manage') and public.can_access_company(company_id)) with check (public.has_permission('administration.business_units.manage') and public.can_access_company(company_id));

create policy profiles_self_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_admin_select on public.profiles for select to authenticated using (public.has_permission('administration.users.manage'));
create policy profiles_admin_write on public.profiles for all to authenticated using (public.has_permission('administration.users.manage')) with check (public.has_permission('administration.users.manage'));
create policy roles_read on public.roles for select to authenticated using (public.current_user_active());
create policy roles_admin on public.roles for all to authenticated using (public.has_permission('administration.roles.manage')) with check (public.has_permission('administration.roles.manage'));
create policy permissions_read on public.permissions for select to authenticated using (public.current_user_active());
create policy permissions_admin on public.permissions for all to authenticated using (public.has_permission('administration.roles.manage')) with check (public.has_permission('administration.roles.manage'));
create policy role_permissions_read on public.role_permissions for select to authenticated using (public.current_user_active());
create policy role_permissions_admin on public.role_permissions for all to authenticated using (public.has_permission('administration.roles.manage')) with check (public.has_permission('administration.roles.manage'));
create policy user_companies_self on public.user_companies for select to authenticated using (user_id = auth.uid());
create policy user_companies_admin on public.user_companies for all to authenticated using (public.has_permission('administration.users.manage')) with check (public.has_permission('administration.users.manage'));
create policy user_units_self on public.user_business_units for select to authenticated using (user_id = auth.uid());
create policy user_units_admin on public.user_business_units for all to authenticated using (public.has_permission('administration.users.manage')) with check (public.has_permission('administration.users.manage'));
create policy settings_read on public.app_settings for select to authenticated using (scope = 'global' or public.can_access_company(company_id));
create policy settings_admin on public.app_settings for all to authenticated using (public.has_permission('administration.settings.manage')) with check (public.has_permission('administration.settings.manage'));

create policy audit_select on public.audit_logs for select to authenticated using (public.has_permission('audit.logs.view') and (company_id is null or public.can_access_company(company_id)));
-- Sin políticas INSERT/UPDATE/DELETE: solo triggers privilegiados escriben auditoría.
create policy notifications_select on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create policy suppliers_select on public.suppliers for select to authenticated using (public.can_access_company(company_id) and public.has_permission('finance.suppliers.view'));
create policy suppliers_write on public.suppliers for all to authenticated using (public.can_access_company(company_id) and public.has_permission('finance.suppliers.manage')) with check (public.can_access_company(company_id) and public.has_permission('finance.suppliers.manage'));
create policy categories_select on public.expense_categories for select to authenticated using (public.can_access_company(company_id));
create policy categories_admin on public.expense_categories for all to authenticated using (public.has_permission('administration.categories.manage') and public.can_access_company(company_id)) with check (public.has_permission('administration.categories.manage') and public.can_access_company(company_id));
create policy cost_centers_select on public.cost_centers for select to authenticated using (public.can_access_company(company_id));
create policy cost_centers_admin on public.cost_centers for all to authenticated using (public.has_permission('administration.cost_centers.manage') and public.can_access_company(company_id)) with check (public.has_permission('administration.cost_centers.manage') and public.can_access_company(company_id));
create policy approval_rules_select on public.approval_rules for select to authenticated using (public.can_access_unit(company_id, business_unit_id));
create policy approval_rules_admin on public.approval_rules for all to authenticated using (public.has_permission('administration.approval_rules.manage') and public.can_access_unit(company_id, business_unit_id)) with check (public.has_permission('administration.approval_rules.manage') and public.can_access_unit(company_id, business_unit_id));

create policy requests_select on public.payment_requests for select to authenticated using (public.can_view_request(payment_requests));
create policy requests_insert on public.payment_requests for insert to authenticated with check (created_by = auth.uid() and requester_id = auth.uid() and public.can_access_unit(company_id, business_unit_id) and public.has_permission('finance.payment_requests.create'));
create policy requests_owner_update on public.payment_requests for update to authenticated using (requester_id = auth.uid() and status in ('draft','correction_requested')) with check (requester_id = auth.uid() and public.can_access_unit(company_id, business_unit_id));
create policy requests_approver_update on public.payment_requests for update to authenticated using (public.can_approve_request(id)) with check (status in ('under_review','approved','rejected','correction_requested'));
create policy requests_finance_update on public.payment_requests for update to authenticated using (status in ('approved','scheduled') and public.can_access_unit(company_id, business_unit_id) and public.has_permission('finance.payments.manage')) with check (status in ('scheduled','paid') and public.can_access_unit(company_id, business_unit_id));

create policy request_attachments_select on public.payment_request_attachments for select to authenticated using (exists (select 1 from public.payment_requests r where r.id = payment_request_id and public.can_view_request(r)));
create policy request_attachments_insert on public.payment_request_attachments for insert to authenticated with check (uploaded_by = auth.uid() and exists (select 1 from public.payment_requests r where r.id = payment_request_id and public.can_view_request(r)));
create policy approval_actions_select on public.approval_actions for select to authenticated using (exists (select 1 from public.payment_requests r where r.id = payment_request_id and public.can_view_request(r)));
create policy approval_actions_insert on public.approval_actions for insert to authenticated with check (approver_id = auth.uid() and public.can_approve_request(payment_request_id));

create policy payments_select on public.payments for select to authenticated using (public.can_access_unit(company_id, business_unit_id) and public.has_permission('finance.payments.view'));
create policy payments_insert on public.payments for insert to authenticated with check (created_by = auth.uid() and scheduled_by = auth.uid() and public.can_access_unit(company_id, business_unit_id) and public.has_permission('finance.payments.schedule') and exists (select 1 from public.payment_requests r where r.id = payment_request_id and r.status = 'approved'));
create policy payments_update on public.payments for update to authenticated using (public.can_access_unit(company_id, business_unit_id) and public.has_permission('finance.payments.execute')) with check (public.can_access_unit(company_id, business_unit_id));
create policy receipts_select on public.payment_receipts for select to authenticated using (exists (select 1 from public.payments p where p.id = payment_id and public.can_access_unit(p.company_id, p.business_unit_id) and public.has_permission('finance.payments.view')));
create policy receipts_insert on public.payment_receipts for insert to authenticated with check (uploaded_by = auth.uid() and exists (select 1 from public.payments p where p.id = payment_id and public.can_access_unit(p.company_id, p.business_unit_id) and public.has_permission('finance.payments.execute')));

create policy petty_accounts_select on public.petty_cash_accounts for select to authenticated using (public.can_access_unit(company_id, business_unit_id) and public.has_permission('finance.petty_cash.view'));
create policy petty_accounts_admin on public.petty_cash_accounts for all to authenticated using (public.can_access_unit(company_id, business_unit_id) and public.has_permission('finance.petty_cash.manage')) with check (public.can_access_unit(company_id, business_unit_id) and public.has_permission('finance.petty_cash.manage'));
create policy petty_movements_select on public.petty_cash_movements for select to authenticated using (public.can_access_unit(company_id, business_unit_id) and public.has_permission('finance.petty_cash.view'));
create policy petty_movements_write on public.petty_cash_movements for insert to authenticated with check (created_by = auth.uid() and public.can_access_unit(company_id, business_unit_id) and public.has_permission('finance.petty_cash.manage'));

-- La tabla de secuencias no tiene políticas: solo el trigger del correlativo puede usarla.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on public.payment_request_sequences from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke update, delete on public.approval_actions from authenticated;
revoke update, delete on public.payment_request_attachments from authenticated;
revoke update, delete on public.payment_receipts from authenticated;
revoke update on public.petty_cash_accounts from authenticated;
grant update (responsible_id, target_amount, active, deleted_at) on public.petty_cash_accounts to authenticated;

commit;
