begin;

-- El flujo configurado como "resume_current" reiniciaba igual que
-- "restart_all" al reenviar tras una corrección: creaba una revisión nueva
-- con todas las etapas en 'pending', sin importar que ya estuvieran
-- aprobadas. Esto obligaba a un aprobador a volver a aprobar algo que ya
-- había resuelto. Ahora, cuando el flujo resuelto es "resume_current" y el
-- reenvío viene desde 'correction_requested', las etapas ya aprobadas en la
-- revisión anterior se trasladan aprobadas a la nueva revisión (mismo
-- decisor y fecha); solo quedan pendientes las etapas que no se habían
-- aprobado (la que pidió la corrección y cualquier otra sin resolver). La
-- decisión original permanece intacta en el historial de auditoría, ligada
-- a la etapa de la revisión anterior. El envío inicial ('draft' -> pending)
-- y los flujos "restart_all" no cambian.
create or replace function public.instantiate_payment_request_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected public.approval_workflows%rowtype;
  selected_id uuid;
  next_revision integer;
  prior_instance_id uuid;
  resuming boolean := false;
begin
  if new.status <> 'pending_approval' or old.status = 'pending_approval' then
    return new;
  end if;

  selected_id := public.resolve_payment_request_workflow(
    new.company_id, new.business_unit_id, new.request_type, new.priority, new.amount
  );
  select * into strict selected from public.approval_workflows where id = selected_id;

  select id into prior_instance_id from public.payment_request_approval_instances
    where payment_request_id = new.id order by revision desc limit 1;
  resuming := old.status = 'correction_requested'
    and selected.correction_policy = 'resume_current'
    and prior_instance_id is not null;

  update public.payment_request_approval_instances
    set status = 'cancelled', completed_at = now()
    where payment_request_id = new.id and status = 'pending';
  update public.payment_request_approval_steps
    set status = 'skipped'
    where payment_request_id = new.id and status = 'pending';
  select coalesce(max(revision), 0) + 1 into next_revision
    from public.payment_request_approval_instances where payment_request_id = new.id;

  insert into public.payment_request_approval_instances(
    company_id,business_unit_id,payment_request_id,source_workflow_id,workflow_code_snapshot,
    workflow_name_snapshot,correction_policy,request_type_snapshot,priority_snapshot,
    amount_snapshot,status,revision,created_by
  ) values (
    new.company_id,new.business_unit_id,new.id,selected.id,selected.code,selected.name,
    selected.correction_policy,new.request_type,new.priority,new.amount,'pending',next_revision,new.created_by
  ) returning id into new.approval_instance_id;

  insert into public.payment_request_approval_steps(
    company_id,business_unit_id,approval_instance_id,payment_request_id,source_workflow_step_id,
    step_name_snapshot,sequence_order,parallel_group,execution_mode,required_role_id,is_required,
    allow_higher_role_substitution,require_comment,require_additional_attachment,
    status,decided_by,decided_at
  )
  select new.company_id,new.business_unit_id,new.approval_instance_id,new.id,s.id,s.name,
    s.sequence_order,s.parallel_group,s.execution_mode,s.required_role_id,s.is_required,
    s.allow_higher_role_substitution,s.require_comment,s.require_additional_attachment,
    case when resuming and prior.status = 'approved' then 'approved'::public.approval_step_status else 'pending'::public.approval_step_status end,
    case when resuming and prior.status = 'approved' then prior.decided_by else null end,
    case when resuming and prior.status = 'approved' then prior.decided_at else null end
  from public.approval_workflow_steps s
  left join public.payment_request_approval_steps prior
    on prior.approval_instance_id = prior_instance_id and prior.source_workflow_step_id = s.id
  where s.workflow_id = selected.id and s.active
  order by s.sequence_order,s.parallel_group;

  return new;
end
$$;

commit;
