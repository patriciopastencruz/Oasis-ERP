begin;

-- Fuente única de verdad para resolver el workflow. Es interna: ni anon ni
-- authenticated pueden invocarla directamente.
create or replace function public.resolve_payment_request_workflow(
  target_company_id uuid,
  target_business_unit_id uuid,
  target_request_type public.payment_request_type,
  target_priority public.payment_priority,
  target_amount numeric
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_id uuid;
  matches integer;
begin
  select count(*), (array_agg(w.id order by w.priority_order, w.id))[1]
    into matches, selected_id
  from public.approval_workflows w
  join public.approval_workflow_conditions c on c.workflow_id = w.id
  where w.company_id = target_company_id
    and w.business_unit_id = target_business_unit_id
    and w.active
    and w.deleted_at is null
    and current_date >= w.valid_from
    and (w.valid_until is null or current_date <= w.valid_until)
    and (c.request_type is null or c.request_type = target_request_type)
    and (c.priority is null or c.priority = target_priority)
    and target_amount >= c.min_amount
    and (c.max_amount is null or target_amount <= c.max_amount);

  if matches = 0 then
    raise exception using errcode = 'P0001', message = 'No existe flujo de aprobación aplicable';
  end if;
  if matches > 1 then
    raise exception using errcode = 'P0001', message = 'La configuración contiene flujos de aprobación ambiguos';
  end if;
  if not exists (
    select 1 from public.approval_workflow_steps s
    where s.workflow_id = selected_id and s.active and s.is_required
  ) then
    raise exception using errcode = 'P0001', message = 'El flujo no contiene etapas obligatorias';
  end if;

  return selected_id;
end
$$;

-- El trigger de envío usa el mismo resolver que la previsualización.
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
begin
  if new.status <> 'pending_approval' or old.status = 'pending_approval' then
    return new;
  end if;

  selected_id := public.resolve_payment_request_workflow(
    new.company_id, new.business_unit_id, new.request_type, new.priority, new.amount
  );
  select * into strict selected from public.approval_workflows where id = selected_id;

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
    allow_higher_role_substitution,require_comment,require_additional_attachment
  )
  select new.company_id,new.business_unit_id,new.approval_instance_id,new.id,s.id,s.name,
    s.sequence_order,s.parallel_group,s.execution_mode,s.required_role_id,s.is_required,
    s.allow_higher_role_substitution,s.require_comment,s.require_additional_attachment
  from public.approval_workflow_steps s
  where s.workflow_id = selected.id and s.active
  order by s.sequence_order,s.parallel_group;

  return new;
end
$$;

create or replace function public.preview_payment_request_workflow(payment_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  request_row public.payment_requests%rowtype;
  workflow_row public.approval_workflows%rowtype;
  condition_row public.approval_workflow_conditions%rowtype;
  workflow_id uuid;
begin
  if actor_id is null or not public.current_user_active() then
    raise exception using errcode = '42501', message = 'Usuario no autenticado o inactivo';
  end if;

  select * into request_row from public.payment_requests where id = payment_request_id;
  if not found then raise exception using errcode = 'P0002', message = 'Solicitud no encontrada'; end if;
  if request_row.status not in ('draft','correction_requested') then
    raise exception using errcode = 'P0001', message = 'La solicitud no está disponible para previsualización';
  end if;
  if not public.can_access_unit(request_row.company_id, request_row.business_unit_id)
    or not public.can_view_request(request_row)
    or not (
      request_row.requester_id = actor_id
      or public.has_permission('finance.payment_requests.view_unit')
      or public.has_permission('finance.payment_requests.view_company')
    ) then
    raise exception using errcode = '42501', message = 'No autorizado para consultar esta solicitud';
  end if;
  if request_row.requester_id = actor_id
    and not public.has_permission('finance.payment_requests.create') then
    raise exception using errcode = '42501', message = 'Permiso insuficiente';
  end if;

  workflow_id := public.resolve_payment_request_workflow(
    request_row.company_id, request_row.business_unit_id, request_row.request_type,
    request_row.priority, request_row.amount
  );
  select * into strict workflow_row from public.approval_workflows where id = workflow_id;
  select * into strict condition_row from public.approval_workflow_conditions c where c.workflow_id = workflow_row.id;

  return jsonb_build_object(
    'workflow_id', workflow_row.id,
    'code', workflow_row.code,
    'name', workflow_row.name,
    'description', workflow_row.description,
    'company_id', request_row.company_id,
    'business_unit_id', request_row.business_unit_id,
    'min_amount', condition_row.min_amount,
    'max_amount', condition_row.max_amount,
    'request_type', condition_row.request_type,
    'priority', condition_row.priority,
    'correction_policy', workflow_row.correction_policy,
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'sequence_order', s.sequence_order,
        'parallel_group', s.parallel_group,
        'execution_mode', s.execution_mode,
        'required_role_id', s.required_role_id,
        'required_role', r.name,
        'is_required', s.is_required,
        'allow_higher_role_substitution', s.allow_higher_role_substitution,
        'require_comment', s.require_comment,
        'require_additional_attachment', s.require_additional_attachment
      ) order by s.sequence_order, s.parallel_group, s.id)
      from public.approval_workflow_steps s
      join public.roles r on r.id = s.required_role_id
      where s.workflow_id = workflow_row.id and s.active
    ), '[]'::jsonb)
  );
end
$$;

create or replace function public.delete_payment_request_attachment(attachment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  attachment_row public.payment_request_attachments%rowtype;
  request_row public.payment_requests%rowtype;
begin
  if actor_id is null or not public.current_user_active() then
    raise exception using errcode = '42501', message = 'Usuario no autenticado o inactivo';
  end if;

  select * into attachment_row from public.payment_request_attachments
    where id = attachment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Respaldo no encontrado'; end if;

  select * into strict request_row from public.payment_requests where id = attachment_row.payment_request_id;
  if request_row.status not in ('draft','correction_requested') then
    raise exception using errcode = 'P0001', message = 'No se pueden eliminar respaldos en el estado actual';
  end if;
  if request_row.requester_id <> actor_id or attachment_row.uploaded_by <> actor_id
    or not public.can_access_unit(request_row.company_id, request_row.business_unit_id)
    or not public.has_permission('finance.payment_requests.create') then
    raise exception using errcode = '42501', message = 'No autorizado para eliminar este respaldo';
  end if;

  if attachment_row.deleted_at is not null then
    return jsonb_build_object('deleted', true, 'already_deleted', true,
      'bucket_id', attachment_row.bucket_id, 'object_path', attachment_row.object_path);
  end if;

  update public.payment_request_attachments set deleted_at = now() where id = attachment_row.id;
  insert into public.audit_logs(
    company_id,business_unit_id,actor_id,action,entity_type,entity_id,old_data,new_data
  ) values (
    request_row.company_id,request_row.business_unit_id,actor_id,'soft_delete',
    'payment_request_attachments',attachment_row.id,to_jsonb(attachment_row),
    jsonb_build_object('deleted_at', now())
  );

  return jsonb_build_object('deleted', true, 'already_deleted', false,
    'bucket_id', attachment_row.bucket_id, 'object_path', attachment_row.object_path);
end
$$;

create or replace function public.submit_payment_request(payment_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  request_row public.payment_requests%rowtype;
  instance_row public.payment_request_approval_instances%rowtype;
begin
  if actor_id is null or not public.current_user_active() then
    raise exception using errcode = '42501', message = 'Usuario no autenticado o inactivo';
  end if;

  select * into request_row from public.payment_requests where id = payment_request_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Solicitud no encontrada'; end if;
  if request_row.requester_id <> actor_id
    or not public.can_access_unit(request_row.company_id, request_row.business_unit_id)
    or not public.has_permission('finance.payment_requests.create') then
    raise exception using errcode = '42501', message = 'No autorizado para enviar esta solicitud';
  end if;

  if request_row.status not in ('draft','correction_requested') then
    if request_row.status in ('pending_approval','under_review')
      and request_row.approval_instance_id is not null and request_row.request_number is not null then
      select * into instance_row from public.payment_request_approval_instances
        where id = request_row.approval_instance_id;
      return jsonb_build_object(
        'payment_request_id', request_row.id,
        'request_number', request_row.request_number,
        'status', request_row.status,
        'approval_instance_id', instance_row.id,
        'workflow_id', instance_row.source_workflow_id,
        'workflow_code', instance_row.workflow_code_snapshot,
        'workflow_name', instance_row.workflow_name_snapshot,
        'revision', instance_row.revision,
        'already_submitted', true
      );
    end if;
    raise exception using errcode = 'P0001', message = 'La solicitud no está disponible para envío';
  end if;

  if request_row.amount <= 0 or nullif(btrim(request_row.supplier_legal_name), '') is null
    or nullif(btrim(request_row.supplier_rut), '') is null
    or nullif(btrim(request_row.description), '') is null
    or request_row.expense_category_id is null or request_row.cost_center_id is null
    or (request_row.priority = 'scheduled' and request_row.requested_payment_date is null) then
    raise exception using errcode = 'P0001', message = 'La solicitud contiene campos obligatorios incompletos';
  end if;
  if not exists (
    select 1 from public.payment_request_attachments a
    where a.payment_request_id = request_row.id and a.deleted_at is null
  ) then raise exception using errcode = 'P0001', message = 'Se requiere al menos un respaldo antes de enviar'; end if;

  update public.payment_requests set status = 'pending_approval' where id = request_row.id
    returning * into request_row;
  select * into strict instance_row from public.payment_request_approval_instances
    where id = request_row.approval_instance_id;

  return jsonb_build_object(
    'payment_request_id', request_row.id,
    'request_number', request_row.request_number,
    'status', request_row.status,
    'approval_instance_id', instance_row.id,
    'workflow_id', instance_row.source_workflow_id,
    'workflow_code', instance_row.workflow_code_snapshot,
    'workflow_name', instance_row.workflow_name_snapshot,
    'revision', instance_row.revision,
    'already_submitted', false
  );
end
$$;

revoke all on function public.resolve_payment_request_workflow(uuid,uuid,public.payment_request_type,public.payment_priority,numeric) from public, anon, authenticated;
revoke all on function public.preview_payment_request_workflow(uuid) from public, anon;
revoke all on function public.delete_payment_request_attachment(uuid) from public, anon;
revoke all on function public.submit_payment_request(uuid) from public, anon;

grant execute on function public.preview_payment_request_workflow(uuid) to authenticated, service_role;
grant execute on function public.delete_payment_request_attachment(uuid) to authenticated, service_role;
grant execute on function public.submit_payment_request(uuid) to authenticated, service_role;

comment on function public.resolve_payment_request_workflow(uuid,uuid,public.payment_request_type,public.payment_priority,numeric)
  is 'Resolver interno y único del workflow aplicable; no expuesto a clientes.';
comment on function public.preview_payment_request_workflow(uuid)
  is 'Previsualiza sin mutar el workflow aplicable a una solicitud autorizada.';
comment on function public.delete_payment_request_attachment(uuid)
  is 'Autoriza y marca deleted_at; Storage debe borrarse después desde una Server Action y puede reintentarse.';
comment on function public.submit_payment_request(uuid)
  is 'Envío transaccional, bloqueado por fila e idempotente de una solicitud propia.';

commit;
