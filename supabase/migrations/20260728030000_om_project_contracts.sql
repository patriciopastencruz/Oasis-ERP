begin;

-- Borradores de contrato editables por proyecto. Cada fila es una
-- versión de contrato: se puede editar libremente y generar (o
-- regenerar) su PDF cuantas veces sea necesario. El PDF generado es
-- solo para imprimir/firmar -- el documento "oficial" del proyecto
-- sigue siendo la versión firmada que se sube a mano en la pestaña
-- Documentos (om_project_documents), que no cambia con esta migración.

create table public.om_project_contracts(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,business_unit_id uuid not null,
 project_id uuid not null references public.om_projects(id) on delete cascade,
 contract_city text not null default 'Calama',
 contract_date date not null default current_date,
 activities text not null check(length(trim(activities))>0),
 payment_terms text not null check(length(trim(payment_terms))>0),
 pdf_object_path text,
 pdf_generated_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),updated_by uuid references public.profiles(id),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index om_project_contracts_project_idx on public.om_project_contracts(project_id,created_at desc);

create trigger om_project_contracts_updated_at before update on public.om_project_contracts for each row execute function public.set_updated_at();
create trigger audit_om_project_contracts after insert or update or delete on public.om_project_contracts for each row execute function public.audit_row_change();

alter table public.om_project_contracts enable row level security;

create policy om_project_contracts_read on public.om_project_contracts for select to authenticated using(
 exists(select 1 from public.om_projects p where p.id=project_id and public.can_access_unit(p.company_id,p.business_unit_id)
   and (p.created_by=(select auth.uid()) or p.responsible_id=(select auth.uid()) or public.has_permission('sales.projects.view') or public.has_permission('sales.projects.manage_documents')))
);
create policy om_project_contracts_insert on public.om_project_contracts for insert to authenticated with check(
 created_by=(select auth.uid()) and public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.projects.manage_documents')
);
create policy om_project_contracts_update on public.om_project_contracts for update to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.projects.manage_documents')
) with check(public.can_access_unit(company_id,business_unit_id));
create policy om_project_contracts_delete on public.om_project_contracts for delete to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.projects.manage_documents')
);

grant select,insert,update,delete on public.om_project_contracts to authenticated,service_role;

-- El PDF generado se guarda en el mismo bucket que los demás archivos
-- del proyecto (modular-project-attachments, ya creado y con RLS por
-- compañía/permiso en el insert/delete). Falta una política de select
-- propia porque las existentes solo reconocen rutas registradas en
-- om_project_documents / om_project_expense_attachments.
create policy storage_modular_project_contract_select on storage.objects for select to authenticated using(
 bucket_id='modular-project-attachments' and exists(
   select 1 from public.om_project_contracts c join public.om_projects p on p.id=c.project_id
   where c.pdf_object_path=storage.objects.name and public.can_access_unit(p.company_id,p.business_unit_id)
     and (p.created_by=(select auth.uid()) or p.responsible_id=(select auth.uid()) or public.has_permission('sales.projects.view') or public.has_permission('sales.projects.manage_documents'))
 )
);

commit;
