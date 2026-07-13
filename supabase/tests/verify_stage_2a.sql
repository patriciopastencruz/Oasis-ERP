-- Ejecutar después de aplicar migraciones en un proyecto local o de pruebas, nunca como migración.
-- Debe devolver cero filas si falta RLS en una tabla operacional.
select c.relname as table_without_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  and c.relname in (
    'companies','business_units','profiles','roles','permissions','role_permissions','user_companies',
    'user_business_units','app_settings','audit_logs','notifications','suppliers','expense_categories',
    'cost_centers','payment_request_sequences','payment_requests','payment_request_attachments',
    'approval_rules','approval_actions','payments','payment_receipts','petty_cash_accounts','petty_cash_movements',
    'approval_workflows','approval_workflow_conditions','approval_workflow_steps',
    'payment_request_approval_instances','payment_request_approval_steps','payment_request_approval_decisions'
  );

-- Debe devolver la vista de hechos como security_invoker=true.
select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='dashboard_payment_facts';

-- No debe haber más de un workflow aplicable por combinación de prueba.
select w.company_id,w.business_unit_id,count(*) as potentially_overlapping
from public.approval_workflows w join public.approval_workflow_conditions c on c.workflow_id=w.id
where w.active and w.deleted_at is null group by w.company_id,w.business_unit_id,c.request_type,c.priority,c.min_amount,c.max_amount
having count(*)>1;

-- Debe devolver los tres buckets con public = false.
select id, public, file_size_limit, allowed_mime_types from storage.buckets
where id in ('payment-request-attachments','payment-receipts','petty-cash-attachments') order by id;

-- Inventario de políticas para revisión manual.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname in ('public','storage') order by schemaname, tablename, policyname;

-- Funciones SECURITY DEFINER: verificar search_path vacío y privilegios.
select n.nspname, p.proname, p.prosecdef, p.proconfig, proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef order by p.proname;
