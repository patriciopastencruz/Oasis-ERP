begin;

alter table public.expense_categories add column description text;
alter table public.cost_centers add column description text;

insert into public.permissions(key,module,description) values
  ('finance.expense_categories.manage','finance','Administrar categorías de gasto'),
  ('finance.cost_centers.manage','finance','Administrar centros de costo')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in ('superadmin','finance_manager','administrator')
  and p.key in ('finance.expense_categories.manage','finance.cost_centers.manage')
on conflict do nothing;

drop policy if exists categories_admin on public.expense_categories;
create policy categories_admin on public.expense_categories for all to authenticated
using (public.can_access_company(company_id) and (public.has_permission('finance.expense_categories.manage') or public.has_permission('administration.categories.manage')))
with check (public.can_access_company(company_id) and (public.has_permission('finance.expense_categories.manage') or public.has_permission('administration.categories.manage')));

drop policy if exists cost_centers_admin on public.cost_centers;
create policy cost_centers_admin on public.cost_centers for all to authenticated
using (public.can_access_company(company_id) and (public.has_permission('finance.cost_centers.manage') or public.has_permission('administration.cost_centers.manage')))
with check (public.can_access_company(company_id) and (public.has_permission('finance.cost_centers.manage') or public.has_permission('administration.cost_centers.manage')));

create trigger audit_expense_categories after insert or update or delete on public.expense_categories
for each row execute function public.audit_row_change();
create trigger audit_cost_centers after insert or update or delete on public.cost_centers
for each row execute function public.audit_row_change();

commit;
