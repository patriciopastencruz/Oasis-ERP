begin;

create type public.approval_correction_policy as enum ('restart_all', 'resume_current');
create type public.approval_execution_mode as enum ('sequential', 'parallel');
create type public.approval_instance_status as enum ('pending', 'approved', 'rejected', 'correction_requested', 'cancelled');
create type public.approval_step_status as enum ('pending', 'approved', 'rejected', 'correction_requested', 'skipped');

create table public.approval_workflows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  business_unit_id uuid not null,
  code text not null,
  name text not null,
  description text,
  correction_policy public.approval_correction_policy not null default 'restart_all',
  active boolean not null default true,
  valid_from date not null default current_date,
  valid_until date,
  priority_order integer not null default 100 check (priority_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deleted_at timestamptz,
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  check (valid_until is null or valid_until >= valid_from),
  unique (company_id, business_unit_id, code),
  unique (company_id, id)
);

create table public.approval_workflow_conditions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  workflow_id uuid not null,
  request_type public.payment_request_type,
  min_amount numeric(18,2) not null default 0 check (min_amount >= 0 and min_amount = trunc(min_amount)),
  max_amount numeric(18,2) check (max_amount is null or max_amount = trunc(max_amount)),
  priority public.payment_priority,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  foreign key (company_id, workflow_id) references public.approval_workflows(company_id, id) on delete cascade,
  check (max_amount is null or max_amount >= min_amount),
  unique (workflow_id)
);

create table public.approval_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  workflow_id uuid not null,
  name text not null,
  sequence_order integer not null check (sequence_order > 0),
  parallel_group integer not null default 1 check (parallel_group > 0),
  execution_mode public.approval_execution_mode not null default 'sequential',
  required_role_id uuid not null references public.roles(id),
  is_required boolean not null default true,
  allow_higher_role_substitution boolean not null default false,
  require_comment boolean not null default false,
  require_additional_attachment boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  foreign key (company_id, workflow_id) references public.approval_workflows(company_id, id) on delete cascade,
  unique (workflow_id, sequence_order, parallel_group, required_role_id),
  unique (company_id, id)
);

create table public.payment_request_approval_instances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  business_unit_id uuid not null,
  payment_request_id uuid not null,
  source_workflow_id uuid not null,
  workflow_code_snapshot text not null,
  workflow_name_snapshot text not null,
  correction_policy public.approval_correction_policy not null,
  request_type_snapshot public.payment_request_type not null,
  priority_snapshot public.payment_priority not null,
  amount_snapshot numeric(18,2) not null check (amount_snapshot > 0),
  status public.approval_instance_status not null default 'pending',
  revision integer not null default 1 check (revision > 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  foreign key (company_id, payment_request_id) references public.payment_requests(company_id, id),
  foreign key (company_id, source_workflow_id) references public.approval_workflows(company_id, id),
  unique (payment_request_id, revision),
  unique (company_id, id)
);

create unique index approval_instance_one_pending_per_request
  on public.payment_request_approval_instances(payment_request_id) where status = 'pending';

create table public.payment_request_approval_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  business_unit_id uuid not null,
  approval_instance_id uuid not null,
  payment_request_id uuid not null,
  source_workflow_step_id uuid not null,
  step_name_snapshot text not null,
  sequence_order integer not null check (sequence_order > 0),
  parallel_group integer not null check (parallel_group > 0),
  execution_mode public.approval_execution_mode not null,
  required_role_id uuid not null references public.roles(id),
  is_required boolean not null,
  allow_higher_role_substitution boolean not null,
  require_comment boolean not null,
  require_additional_attachment boolean not null,
  status public.approval_step_status not null default 'pending',
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  foreign key (company_id, approval_instance_id) references public.payment_request_approval_instances(company_id, id) on delete cascade,
  foreign key (company_id, payment_request_id) references public.payment_requests(company_id, id),
  foreign key (company_id, source_workflow_step_id) references public.approval_workflow_steps(company_id, id),
  unique (approval_instance_id, source_workflow_step_id),
  unique (company_id, id)
);

create table public.payment_request_approval_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  business_unit_id uuid not null,
  payment_request_id uuid not null,
  approval_instance_id uuid not null,
  approval_step_id uuid not null,
  approver_id uuid not null references public.profiles(id),
  actual_role_id uuid not null references public.roles(id),
  required_role_id uuid not null references public.roles(id),
  acted_as_substitute boolean not null default false,
  action public.approval_action_type not null,
  comment text,
  amount_snapshot numeric(18,2) not null check (amount_snapshot > 0),
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  foreign key (company_id, payment_request_id) references public.payment_requests(company_id, id),
  foreign key (company_id, approval_instance_id) references public.payment_request_approval_instances(company_id, id),
  foreign key (company_id, approval_step_id) references public.payment_request_approval_steps(company_id, id),
  unique (approval_step_id)
);

alter table public.payment_requests add column approval_instance_id uuid;
alter table public.payment_requests add constraint payment_requests_approval_instance_fk
  foreign key (company_id, approval_instance_id) references public.payment_request_approval_instances(company_id, id);
comment on table public.approval_rules is 'DEPRECATED 2A.1: reemplazada por approval_workflows, conditions y steps.';
comment on table public.approval_actions is 'DEPRECATED 2A.1: nuevas decisiones usan payment_request_approval_decisions.';
comment on column public.payment_requests.required_approval_rule_id is 'DEPRECATED 2A.1: usar approval_instance_id.';

create index workflow_lookup_idx on public.approval_workflows(company_id, business_unit_id, active, valid_from, valid_until, priority_order) where deleted_at is null;
create index workflow_conditions_match_idx on public.approval_workflow_conditions(company_id, request_type, priority, min_amount, max_amount);
create index workflow_steps_order_idx on public.approval_workflow_steps(workflow_id, sequence_order, parallel_group) where active;
create index approval_instances_request_idx on public.payment_request_approval_instances(payment_request_id, revision desc);
create index approval_steps_pending_idx on public.payment_request_approval_steps(approval_instance_id, sequence_order, status);
create index approval_decisions_request_idx on public.payment_request_approval_decisions(payment_request_id, created_at);
create index payment_requests_dashboard_idx on public.payment_requests(company_id, business_unit_id, created_at, status, priority) where deleted_at is null;
create index payments_dashboard_idx on public.payments(company_id, business_unit_id, scheduled_date, paid_at);

create trigger approval_workflows_updated_at before update on public.approval_workflows for each row execute function public.set_updated_at();
create trigger approval_workflow_conditions_updated_at before update on public.approval_workflow_conditions for each row execute function public.set_updated_at();
create trigger approval_workflow_steps_updated_at before update on public.approval_workflow_steps for each row execute function public.set_updated_at();

-- El correlativo permanece en prepare_payment_request; la selección antigua de approval_rules se elimina.
create or replace function public.prepare_payment_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare unit_code text; local_year smallint; next_value bigint;
begin
  new.supplier_rut := public.normalize_chilean_rut(new.supplier_rut);
  if tg_op = 'INSERT' and new.status <> 'draft' then raise exception 'Las solicitudes deben crearse como borrador'; end if;
  if tg_op = 'UPDATE' and old.status in ('draft','correction_requested') and new.status = 'pending_approval' then
    if not exists (select 1 from public.payment_request_attachments a where a.payment_request_id = old.id and a.deleted_at is null) then
      raise exception 'Se requiere al menos un respaldo antes de enviar';
    end if;
    if old.status = 'draft' then
      local_year := extract(year from (now() at time zone 'America/Santiago'))::smallint;
      insert into public.payment_request_sequences(company_id, business_unit_id, year, last_value)
      values (new.company_id, new.business_unit_id, local_year, 1)
      on conflict (company_id, business_unit_id, year) do update
        set last_value = public.payment_request_sequences.last_value + 1, updated_at = now()
      returning last_value into next_value;
      select code into unit_code from public.business_units where company_id = new.company_id and id = new.business_unit_id;
      new.sequence_year := local_year; new.sequence_value := next_value;
      new.request_number := format('%s-%s-%s', unit_code, local_year, lpad(next_value::text, 6, '0'));
    end if;
    new.submitted_at := now();
    new.required_approval_rule_id := null; new.required_approval_level := null; new.approval_instance_id := null;
  end if;
  return new;
end $$;

create or replace function public.instantiate_payment_request_workflow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare selected public.approval_workflows%rowtype; selected_id uuid; matches integer; next_revision integer;
begin
  if new.status <> 'pending_approval' or old.status = 'pending_approval' then return new; end if;

  select count(*), (array_agg(w.id))[1] into matches, selected_id
  from public.approval_workflows w join public.approval_workflow_conditions c on c.workflow_id = w.id
  where w.company_id = new.company_id and w.business_unit_id = new.business_unit_id
    and w.active and w.deleted_at is null and current_date >= w.valid_from
    and (w.valid_until is null or current_date <= w.valid_until)
    and (c.request_type is null or c.request_type = new.request_type)
    and (c.priority is null or c.priority = new.priority)
    and new.amount >= c.min_amount and (c.max_amount is null or new.amount <= c.max_amount);
  if matches = 0 then raise exception 'No existe flujo de aprobación aplicable'; end if;
  if matches > 1 then raise exception 'La configuración contiene flujos de aprobación ambiguos'; end if;
  select * into selected from public.approval_workflows where id = selected_id;
  if not exists (select 1 from public.approval_workflow_steps s where s.workflow_id = selected.id and s.active and s.is_required) then
    raise exception 'El flujo no contiene etapas obligatorias';
  end if;

  update public.payment_request_approval_instances set status = 'cancelled', completed_at = now()
    where payment_request_id = new.id and status = 'pending';
  update public.payment_request_approval_steps set status = 'skipped'
    where payment_request_id = new.id and status = 'pending';
  select coalesce(max(revision), 0) + 1 into next_revision from public.payment_request_approval_instances where payment_request_id = new.id;

  insert into public.payment_request_approval_instances(
    company_id,business_unit_id,payment_request_id,source_workflow_id,workflow_code_snapshot,
    workflow_name_snapshot,correction_policy,request_type_snapshot,priority_snapshot,amount_snapshot,status,revision,created_by)
  values (new.company_id,new.business_unit_id,new.id,selected.id,selected.code,selected.name,selected.correction_policy,
    new.request_type,new.priority,new.amount,'pending',next_revision,new.created_by)
  returning id into new.approval_instance_id;

  insert into public.payment_request_approval_steps(
    company_id,business_unit_id,approval_instance_id,payment_request_id,source_workflow_step_id,
    step_name_snapshot,sequence_order,parallel_group,execution_mode,required_role_id,is_required,
    allow_higher_role_substitution,require_comment,require_additional_attachment)
  select new.company_id,new.business_unit_id,new.approval_instance_id,new.id,s.id,s.name,s.sequence_order,
    s.parallel_group,s.execution_mode,s.required_role_id,s.is_required,s.allow_higher_role_substitution,
    s.require_comment,s.require_additional_attachment
  from public.approval_workflow_steps s where s.workflow_id = selected.id and s.active
  order by s.sequence_order,s.parallel_group;
  return new;
end $$;

drop trigger if exists payment_requests_workflow_zz on public.payment_requests;
create trigger payment_requests_workflow_zz before update of status on public.payment_requests
for each row execute function public.instantiate_payment_request_workflow();

create or replace function public.can_approve_workflow_step(target_step uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.payment_request_approval_steps s
    join public.payment_request_approval_instances i on i.id = s.approval_instance_id
    join public.payment_requests pr on pr.id = s.payment_request_id
    join public.profiles me on me.id = auth.uid()
    join public.roles actual_role on actual_role.id = me.role_id
    where s.id = target_step and s.status = 'pending' and i.status = 'pending'
      and pr.status in ('pending_approval','under_review') and me.active and me.deleted_at is null
      and public.can_access_company(s.company_id) and public.can_access_unit(s.company_id,s.business_unit_id)
      and public.has_permission('finance.approvals.decide')
      and (me.role_id = s.required_role_id or
        (s.allow_higher_role_substitution and actual_role.key in ('general_manager','superadmin')))
      and not exists (
        select 1 from public.payment_request_approval_steps prior
        where prior.approval_instance_id = s.approval_instance_id and prior.is_required
          and prior.sequence_order < s.sequence_order and prior.status <> 'approved'
      )
  )
$$;

create or replace function public.decide_payment_request_approval_step(
  target_step uuid, decision public.approval_action_type, decision_comment text default null,
  request_ip inet default null, request_user_agent text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.payment_request_approval_steps%rowtype; i public.payment_request_approval_instances%rowtype;
  pr public.payment_requests%rowtype; me public.profiles%rowtype; substituted boolean; decision_id uuid;
begin
  if decision not in ('approve','reject','request_correction') then raise exception 'Decisión no permitida'; end if;
  if not public.can_approve_workflow_step(target_step) then raise exception 'Usuario o etapa no autorizados'; end if;
  select * into s from public.payment_request_approval_steps where id = target_step for update;
  select * into i from public.payment_request_approval_instances where id = s.approval_instance_id for update;
  select * into pr from public.payment_requests where id = s.payment_request_id for update;
  select * into me from public.profiles where id = auth.uid();
  if s.status <> 'pending' or i.status <> 'pending' then raise exception 'La etapa ya fue resuelta'; end if;
  if s.require_comment and nullif(btrim(decision_comment),'') is null then raise exception 'La etapa requiere comentario'; end if;
  if s.require_additional_attachment and not exists (
    select 1 from public.payment_request_attachments a where a.payment_request_id = pr.id
      and a.deleted_at is null and a.created_at >= i.created_at
  ) then raise exception 'La etapa requiere respaldo adicional'; end if;
  substituted := me.role_id <> s.required_role_id;

  update public.payment_request_approval_steps set
    status = case decision when 'approve' then 'approved'::public.approval_step_status
      when 'reject' then 'rejected'::public.approval_step_status else 'correction_requested'::public.approval_step_status end,
    decided_at = now(), decided_by = auth.uid() where id = s.id;

  insert into public.payment_request_approval_decisions(
    company_id,business_unit_id,payment_request_id,approval_instance_id,approval_step_id,approver_id,
    actual_role_id,required_role_id,acted_as_substitute,action,comment,amount_snapshot,ip_address,user_agent)
  values (s.company_id,s.business_unit_id,s.payment_request_id,s.approval_instance_id,s.id,auth.uid(),
    me.role_id,s.required_role_id,substituted,decision,decision_comment,i.amount_snapshot,request_ip,request_user_agent)
  returning id into decision_id;

  if decision = 'reject' then
    update public.payment_request_approval_instances set status='rejected',completed_at=now() where id=i.id;
    update public.payment_request_approval_steps set status='skipped' where approval_instance_id=i.id and status='pending';
    update public.payment_requests set status='rejected' where id=pr.id;
  elsif decision = 'request_correction' then
    update public.payment_request_approval_instances set status='correction_requested',completed_at=now() where id=i.id;
    update public.payment_request_approval_steps set status='skipped' where approval_instance_id=i.id and status='pending';
    update public.payment_requests set status='correction_requested' where id=pr.id;
  elsif not exists (
    select 1 from public.payment_request_approval_steps x where x.approval_instance_id=i.id and x.is_required and x.status <> 'approved'
  ) then
    update public.payment_request_approval_steps set status='skipped' where approval_instance_id=i.id and status='pending';
    update public.payment_request_approval_instances set status='approved',completed_at=now() where id=i.id;
    update public.payment_requests set status='approved' where id=pr.id;
  end if;
  return decision_id;
end $$;

create or replace function public.guard_frozen_approval_step()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'pending' then raise exception 'Una etapa finalizada es inmutable'; end if;
  if new.approval_instance_id <> old.approval_instance_id or new.payment_request_id <> old.payment_request_id
    or new.required_role_id <> old.required_role_id or new.sequence_order <> old.sequence_order
    or new.is_required <> old.is_required then raise exception 'El snapshot de la etapa es inmutable'; end if;
  return new;
end $$;
create trigger approval_steps_immutable before update on public.payment_request_approval_steps
for each row execute function public.guard_frozen_approval_step();

-- La autorización antigua se redirige al paso actual únicamente para compatibilidad de lectura.
create or replace function public.can_approve_request(request_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.payment_request_approval_steps s where s.payment_request_id=request_id
      and public.can_approve_workflow_step(s.id)
  )
$$;

create or replace function public.notify_payment_request_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = new.status then return new; end if;
  if new.status = 'pending_approval' then
    insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
    select new.company_id,new.business_unit_id,p.id,'payment_request.approval_assigned','Aprobación pendiente',
      'La solicitud '||new.request_number||' requiere revisión.','payment_request',new.id,auth.uid()
    from public.payment_request_approval_steps s
    join public.profiles p on p.role_id=s.required_role_id
    join public.user_business_units ubu on ubu.user_id=p.id and ubu.company_id=s.company_id and ubu.business_unit_id=s.business_unit_id
    where s.approval_instance_id=new.approval_instance_id and s.status='pending'
      and s.sequence_order=(select min(x.sequence_order) from public.payment_request_approval_steps x where x.approval_instance_id=s.approval_instance_id and x.is_required)
      and p.active and p.deleted_at is null;
  elsif new.status in ('approved','rejected','correction_requested','scheduled','paid','cancelled') then
    insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
    values(new.company_id,new.business_unit_id,new.requester_id,'payment_request.'||new.status::text,
      'Solicitud '||replace(new.status::text,'_',' '),'La solicitud '||coalesce(new.request_number,new.id::text)||' cambió de estado.',
      'payment_request',new.id,auth.uid());
  end if;
  return new;
end $$;

-- Contrato de hechos mínimo; security_invoker conserva RLS de las tablas base.
create view public.dashboard_payment_facts with (security_invoker = true) as
select pr.id,pr.company_id,pr.business_unit_id,pr.expense_category_id,pr.cost_center_id,pr.supplier_id,
  pr.amount,pr.status,pr.priority,pr.created_at,pr.submitted_at,pr.approved_at,pr.rejected_at,pr.cancelled_at,
  p.scheduled_date,p.paid_at
from public.payment_requests pr left join public.payments p on p.payment_request_id=pr.id and p.company_id=pr.company_id
where pr.deleted_at is null and public.has_permission('reports.executive_dashboard.view');

create or replace function public.executive_payment_summary(
  date_from date, date_to date, filter_company uuid default null, filter_unit uuid default null
) returns table(
  total_requested numeric,total_approved numeric,total_paid numeric,total_pending numeric,total_rejected numeric,
  request_count bigint,pending_count bigint,urgent_count bigint,overdue_count bigint,upcoming_count bigint,
  approval_rate numeric,rejection_rate numeric,avg_approval_hours numeric,avg_payment_hours numeric
) language sql stable set search_path = '' as $$
  with f as (
    select * from public.dashboard_payment_facts d
    where (filter_company is null or d.company_id=filter_company)
      and (filter_unit is null or d.business_unit_id=filter_unit)
      and (filter_company is null or public.can_access_company(filter_company))
      and (filter_unit is null or public.can_access_unit(d.company_id,filter_unit))
  ) select
    coalesce(sum(amount) filter(where status<>'cancelled' and (created_at at time zone 'America/Santiago')::date between date_from and date_to),0),
    coalesce(sum(amount) filter(where approved_at is not null and (approved_at at time zone 'America/Santiago')::date between date_from and date_to),0),
    coalesce(sum(amount) filter(where paid_at is not null and (paid_at at time zone 'America/Santiago')::date between date_from and date_to),0),
    coalesce(sum(amount) filter(where status in ('approved','scheduled') and (created_at at time zone 'America/Santiago')::date<=date_to),0),
    coalesce(sum(amount) filter(where rejected_at is not null and (rejected_at at time zone 'America/Santiago')::date between date_from and date_to),0),
    count(*) filter(where status<>'cancelled' and (created_at at time zone 'America/Santiago')::date between date_from and date_to),
    count(*) filter(where status in ('pending_approval','under_review','correction_requested') and (created_at at time zone 'America/Santiago')::date<=date_to),
    count(*) filter(where priority='urgent' and status not in ('paid','rejected','cancelled') and (created_at at time zone 'America/Santiago')::date<=date_to),
    count(*) filter(where status='scheduled' and scheduled_date < (now() at time zone 'America/Santiago')::date),
    count(*) filter(where status='scheduled' and scheduled_date between (now() at time zone 'America/Santiago')::date and (now() at time zone 'America/Santiago')::date+7),
    round(100.0*count(*) filter(where status in ('approved','scheduled','paid') and (created_at at time zone 'America/Santiago')::date between date_from and date_to)/nullif(count(*) filter(where status in ('approved','scheduled','paid','rejected') and (created_at at time zone 'America/Santiago')::date between date_from and date_to),0),2),
    round(100.0*count(*) filter(where status='rejected' and (created_at at time zone 'America/Santiago')::date between date_from and date_to)/nullif(count(*) filter(where status in ('approved','scheduled','paid','rejected') and (created_at at time zone 'America/Santiago')::date between date_from and date_to),0),2),
    round(avg(extract(epoch from (approved_at-submitted_at))/3600) filter(where approved_at is not null and (approved_at at time zone 'America/Santiago')::date between date_from and date_to),2),
    round(avg(extract(epoch from (paid_at-approved_at))/3600) filter(where paid_at is not null and approved_at is not null and (paid_at at time zone 'America/Santiago')::date between date_from and date_to),2)
  from f
$$;

create or replace function public.payment_status_summary(date_from date,date_to date,filter_company uuid default null,filter_unit uuid default null)
returns table(company_id uuid,business_unit_id uuid,status public.payment_request_status,request_count bigint,total_amount numeric)
language sql stable set search_path='' as $$
  select d.company_id,d.business_unit_id,d.status,count(*),sum(d.amount)
  from public.dashboard_payment_facts d
  where (d.created_at at time zone 'America/Santiago')::date between date_from and date_to and d.status<>'cancelled'
    and (filter_company is null or d.company_id=filter_company) and (filter_unit is null or d.business_unit_id=filter_unit)
  group by d.company_id,d.business_unit_id,d.status
$$;

create or replace function public.monthly_payment_trend(date_from date,date_to date,filter_company uuid default null,filter_unit uuid default null)
returns table(month_start date,company_id uuid,business_unit_id uuid,requested numeric,approved numeric,paid numeric)
language sql stable set search_path='' as $$
  with events as (
    select date_trunc('month',d.created_at at time zone 'America/Santiago')::date as month_start,d.company_id,d.business_unit_id,d.amount requested,0::numeric approved,0::numeric paid
      from public.dashboard_payment_facts d where d.status<>'cancelled'
    union all
    select date_trunc('month',d.approved_at at time zone 'America/Santiago')::date,d.company_id,d.business_unit_id,0,d.amount,0
      from public.dashboard_payment_facts d where d.approved_at is not null
    union all
    select date_trunc('month',d.paid_at at time zone 'America/Santiago')::date,d.company_id,d.business_unit_id,0,0,d.amount
      from public.dashboard_payment_facts d where d.paid_at is not null
  ) select e.month_start,e.company_id,e.business_unit_id,sum(e.requested),sum(e.approved),sum(e.paid)
    from events e where e.month_start between date_trunc('month',date_from)::date and date_trunc('month',date_to)::date
      and (filter_company is null or e.company_id=filter_company) and (filter_unit is null or e.business_unit_id=filter_unit)
    group by e.month_start,e.company_id,e.business_unit_id
$$;

create or replace function public.upcoming_payments(days_ahead integer default 7,filter_company uuid default null,filter_unit uuid default null)
returns table(payment_request_id uuid,company_id uuid,business_unit_id uuid,amount numeric,scheduled_date date)
language sql stable set search_path='' as $$
  select d.id,d.company_id,d.business_unit_id,d.amount,d.scheduled_date from public.dashboard_payment_facts d
  where d.status='scheduled' and d.scheduled_date between (now() at time zone 'America/Santiago')::date
    and (now() at time zone 'America/Santiago')::date+greatest(days_ahead,0)
    and (filter_company is null or d.company_id=filter_company) and (filter_unit is null or d.business_unit_id=filter_unit)
$$;

create or replace function public.overdue_payments(filter_company uuid default null,filter_unit uuid default null)
returns table(payment_request_id uuid,company_id uuid,business_unit_id uuid,amount numeric,scheduled_date date,days_overdue integer)
language sql stable set search_path='' as $$
  select d.id,d.company_id,d.business_unit_id,d.amount,d.scheduled_date,
    ((now() at time zone 'America/Santiago')::date-d.scheduled_date)::integer
  from public.dashboard_payment_facts d where d.status='scheduled'
    and d.scheduled_date<(now() at time zone 'America/Santiago')::date
    and (filter_company is null or d.company_id=filter_company) and (filter_unit is null or d.business_unit_id=filter_unit)
$$;

create or replace function public.approval_performance_summary(date_from date,date_to date,filter_company uuid default null,filter_unit uuid default null)
returns table(company_id uuid,business_unit_id uuid,completed_count bigint,avg_approval_hours numeric,approval_rate numeric,rejection_rate numeric)
language sql stable set search_path='' as $$
  select i.company_id,i.business_unit_id,count(*) filter(where i.status in('approved','rejected')),
    round(avg(extract(epoch from(i.completed_at-i.started_at))/3600) filter(where i.status='approved'),2),
    round(100.0*count(*) filter(where i.status='approved')/nullif(count(*) filter(where i.status in('approved','rejected')),0),2),
    round(100.0*count(*) filter(where i.status='rejected')/nullif(count(*) filter(where i.status in('approved','rejected')),0),2)
  from public.payment_request_approval_instances i
  where (i.started_at at time zone 'America/Santiago')::date between date_from and date_to
    and (filter_company is null or i.company_id=filter_company) and (filter_unit is null or i.business_unit_id=filter_unit)
  group by i.company_id,i.business_unit_id
$$;

create or replace function public.payment_dimension_summary(
  dimension text,date_from date,date_to date,filter_company uuid default null,filter_unit uuid default null
) returns table(dimension_id uuid,dimension_label text,total_amount numeric,participation_percent numeric)
language sql stable set search_path='' as $$
  with facts as (
    select d.* from public.dashboard_payment_facts d
    where (d.created_at at time zone 'America/Santiago')::date between date_from and date_to and d.status<>'cancelled'
      and (filter_company is null or d.company_id=filter_company) and (filter_unit is null or d.business_unit_id=filter_unit)
  ), grouped as (
    select case dimension
      when 'company' then f.company_id when 'business_unit' then f.business_unit_id
      when 'category' then f.expense_category_id when 'cost_center' then f.cost_center_id
      when 'supplier' then f.supplier_id end as id,
      case dimension when 'company' then c.trade_name when 'business_unit' then bu.name
      when 'category' then ec.name when 'cost_center' then cc.name when 'supplier' then s.legal_name end as label,
      sum(f.amount) as amount
    from facts f join public.companies c on c.id=f.company_id join public.business_units bu on bu.id=f.business_unit_id
    left join public.expense_categories ec on ec.id=f.expense_category_id
    left join public.cost_centers cc on cc.id=f.cost_center_id left join public.suppliers s on s.id=f.supplier_id
    where dimension in('company','business_unit','category','cost_center','supplier')
    group by 1,2
  ) select id,label,amount,round(100.0*amount/nullif(sum(amount) over(),0),2) from grouped
$$;

alter table public.approval_workflows enable row level security;
alter table public.approval_workflow_conditions enable row level security;
alter table public.approval_workflow_steps enable row level security;
alter table public.payment_request_approval_instances enable row level security;
alter table public.payment_request_approval_steps enable row level security;
alter table public.payment_request_approval_decisions enable row level security;

create policy workflows_read on public.approval_workflows for select to authenticated using(public.can_access_unit(company_id,business_unit_id));
create policy workflows_admin on public.approval_workflows for all to authenticated using(public.can_access_unit(company_id,business_unit_id) and public.has_permission('administration.approval_rules.manage')) with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('administration.approval_rules.manage'));
create policy workflow_conditions_read on public.approval_workflow_conditions for select to authenticated using(public.can_access_company(company_id));
create policy workflow_conditions_admin on public.approval_workflow_conditions for all to authenticated using(public.can_access_company(company_id) and public.has_permission('administration.approval_rules.manage')) with check(public.can_access_company(company_id) and public.has_permission('administration.approval_rules.manage'));
create policy workflow_steps_read on public.approval_workflow_steps for select to authenticated using(public.can_access_company(company_id));
create policy workflow_steps_admin on public.approval_workflow_steps for all to authenticated using(public.can_access_company(company_id) and public.has_permission('administration.approval_rules.manage')) with check(public.can_access_company(company_id) and public.has_permission('administration.approval_rules.manage'));
create policy approval_instances_read on public.payment_request_approval_instances for select to authenticated using(exists(select 1 from public.payment_requests r where r.id=payment_request_id and public.can_view_request(r)));
create policy approval_instance_steps_read on public.payment_request_approval_steps for select to authenticated using(exists(select 1 from public.payment_requests r where r.id=payment_request_id and public.can_view_request(r)));
create policy approval_decisions_read on public.payment_request_approval_decisions for select to authenticated using(exists(select 1 from public.payment_requests r where r.id=payment_request_id and public.can_view_request(r)));

drop policy if exists requests_approver_update on public.payment_requests;
drop policy if exists approval_actions_insert on public.approval_actions;

grant select,insert,update,delete on public.approval_workflows,public.approval_workflow_conditions,public.approval_workflow_steps to authenticated;
grant select on public.payment_request_approval_instances,public.payment_request_approval_steps,public.payment_request_approval_decisions,public.dashboard_payment_facts to authenticated;
grant select,insert,update,delete on public.approval_workflows,public.approval_workflow_conditions,public.approval_workflow_steps,public.payment_request_approval_instances,public.payment_request_approval_steps,public.payment_request_approval_decisions to service_role;
grant select on public.dashboard_payment_facts to service_role;
revoke insert,update,delete on public.payment_request_approval_instances,public.payment_request_approval_steps,public.payment_request_approval_decisions from authenticated;
revoke insert,update,delete on public.approval_actions from authenticated;
revoke execute on function public.instantiate_payment_request_workflow() from public,anon,authenticated;
revoke execute on function public.guard_frozen_approval_step() from public,anon,authenticated;
revoke execute on function public.can_approve_workflow_step(uuid) from public,anon;
grant execute on function public.can_approve_workflow_step(uuid) to authenticated;
revoke execute on function public.decide_payment_request_approval_step(uuid,public.approval_action_type,text,inet,text) from public,anon;
grant execute on function public.decide_payment_request_approval_step(uuid,public.approval_action_type,text,inet,text) to authenticated;
revoke execute on function public.executive_payment_summary(date,date,uuid,uuid),public.payment_status_summary(date,date,uuid,uuid),public.monthly_payment_trend(date,date,uuid,uuid),public.upcoming_payments(integer,uuid,uuid),public.overdue_payments(uuid,uuid),public.approval_performance_summary(date,date,uuid,uuid),public.payment_dimension_summary(text,date,date,uuid,uuid) from public,anon;
grant execute on function public.executive_payment_summary(date,date,uuid,uuid),public.payment_status_summary(date,date,uuid,uuid),public.monthly_payment_trend(date,date,uuid,uuid),public.upcoming_payments(integer,uuid,uuid),public.overdue_payments(uuid,uuid),public.approval_performance_summary(date,date,uuid,uuid),public.payment_dimension_summary(text,date,date,uuid,uuid) to authenticated;

create trigger audit_approval_workflows after insert or update or delete on public.approval_workflows for each row execute function public.audit_row_change();
create trigger audit_approval_workflow_conditions after insert or update or delete on public.approval_workflow_conditions for each row execute function public.audit_row_change();
create trigger audit_approval_workflow_steps after insert or update or delete on public.approval_workflow_steps for each row execute function public.audit_row_change();
create trigger audit_approval_decisions after insert on public.payment_request_approval_decisions for each row execute function public.audit_row_change();

commit;
