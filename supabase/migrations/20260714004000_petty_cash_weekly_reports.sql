begin;

create type public.petty_cash_report_status as enum (
  'draft','submitted','under_review','correction_requested','resubmitted','approved','rejected','cancelled'
);
create type public.petty_cash_document_type as enum ('receipt','invoice','voucher','electronic_receipt','other');
create type public.petty_cash_line_review_status as enum ('pending','accepted','observed');
create type public.petty_cash_review_decision as enum ('approved','rejected','correction_requested','comment');

insert into public.permissions(key,module,description) values
  ('finance.petty_cash.create','finance','Crear y corregir rendiciones propias de Caja Chica'),
  ('finance.petty_cash.view_own','finance','Consultar rendiciones propias de Caja Chica'),
  ('finance.petty_cash.view_unit','finance','Consultar rendiciones de Caja Chica de unidades asignadas'),
  ('finance.petty_cash.review','finance','Revisar y observar rendiciones de Caja Chica'),
  ('finance.petty_cash.approve','finance','Aprobar o rechazar rendiciones de Caja Chica'),
  ('finance.petty_cash.reports.view','finance','Consultar reportes consolidados de Caja Chica'),
  ('finance.petty_cash.reports.export','finance','Exportar reportes de Caja Chica')
on conflict (key) do update set module=excluded.module,description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='superadmin' and p.key like 'finance.petty_cash.%'
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in
  ('finance.petty_cash.create','finance.petty_cash.view_own')
where r.key='worker' on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in
  ('finance.petty_cash.create','finance.petty_cash.view_own','finance.petty_cash.view_unit',
   'finance.petty_cash.review','finance.petty_cash.approve','finance.petty_cash.manage')
where r.key='administrator' on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in
  ('finance.petty_cash.view_unit','finance.petty_cash.manage','finance.petty_cash.reports.view','finance.petty_cash.reports.export')
where r.key='finance_manager' on conflict do nothing;

create table public.petty_cash_weekly_limits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  business_unit_id uuid,
  weekly_limit numeric(18,2) not null default 100000 check (weekly_limit > 0 and weekly_limit = trunc(weekly_limit)),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), deleted_at timestamptz,
  foreign key (company_id,business_unit_id) references public.business_units(company_id,id),
  unique nulls not distinct (company_id,business_unit_id)
);

create table public.petty_cash_report_sequences (
  company_id uuid not null, business_unit_id uuid not null, year smallint not null check (year between 2020 and 2200),
  last_value bigint not null default 0 check (last_value >= 0), updated_at timestamptz not null default now(),
  primary key(company_id,business_unit_id,year),
  foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);

create table public.petty_cash_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, business_unit_id uuid not null,
  report_number text, sequence_year smallint, sequence_value bigint,
  responsible_id uuid not null references public.profiles(id),
  week_start date not null, week_end date not null,
  general_reason text not null check (char_length(btrim(general_reason)) between 3 and 500),
  general_observations text,
  status public.petty_cash_report_status not null default 'draft',
  total_lines integer not null default 0 check (total_lines >= 0),
  total_registered numeric(18,2) not null default 0 check (total_registered >= 0 and total_registered = trunc(total_registered)),
  total_approved numeric(18,2) not null default 0 check (total_approved >= 0 and total_approved = trunc(total_approved)),
  total_rejected numeric(18,2) not null default 0 check (total_rejected >= 0 and total_rejected = trunc(total_rejected)),
  revision_number integer not null default 1 check (revision_number > 0),
  submitted_at timestamptz, approved_at timestamptz, approved_by uuid references public.profiles(id),
  rejected_at timestamptz, rejected_by uuid references public.profiles(id),
  correction_requested_at timestamptz, cancelled_at timestamptz,
  reviewer_comment text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id), deleted_at timestamptz,
  foreign key(company_id,business_unit_id) references public.business_units(company_id,id),
  check (week_end = week_start + 6),
  check (extract(isodow from week_start) = 1),
  check ((status='draft' and report_number is null) or status<>'draft'),
  unique(company_id,business_unit_id,sequence_year,sequence_value),
  unique(company_id,report_number), unique(company_id,business_unit_id,id)
);

create table public.petty_cash_expense_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, business_unit_id uuid not null, petty_cash_report_id uuid not null,
  expense_date date not null, merchant_name text not null check (char_length(btrim(merchant_name)) between 2 and 200),
  document_type public.petty_cash_document_type not null, document_number text,
  expense_category_id uuid not null, cost_center_id uuid not null,
  description text not null check (char_length(btrim(description)) between 3 and 500),
  amount numeric(18,2) not null check (amount > 0 and amount = trunc(amount)),
  observation text, review_status public.petty_cash_line_review_status not null default 'pending',
  reviewer_comment text, sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id), deleted_at timestamptz,
  foreign key(company_id,business_unit_id,petty_cash_report_id)
    references public.petty_cash_reports(company_id,business_unit_id,id) on delete cascade,
  foreign key(company_id,expense_category_id) references public.expense_categories(company_id,id),
  foreign key(company_id,cost_center_id) references public.cost_centers(company_id,id),
  unique(company_id,business_unit_id,petty_cash_report_id,id)
);

create table public.petty_cash_line_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, business_unit_id uuid not null,
  petty_cash_report_id uuid not null, expense_line_id uuid not null,
  bucket_id text not null default 'petty-cash-attachments' check (bucket_id='petty-cash-attachments'),
  object_path text not null, original_name text not null, mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null references auth.users(id), created_at timestamptz not null default now(), deleted_at timestamptz,
  foreign key(company_id,business_unit_id,petty_cash_report_id,expense_line_id)
    references public.petty_cash_expense_lines(company_id,business_unit_id,petty_cash_report_id,id) on delete cascade,
  check (mime_type in ('application/pdf','image/jpeg','image/png')),
  unique(bucket_id,object_path)
);

create table public.petty_cash_review_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, business_unit_id uuid not null, petty_cash_report_id uuid not null,
  reviewer_id uuid not null references public.profiles(id),
  decision public.petty_cash_review_decision not null, comment text,
  revision_number integer not null check (revision_number > 0),
  observed_line_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key(company_id,business_unit_id,petty_cash_report_id)
    references public.petty_cash_reports(company_id,business_unit_id,id),
  check (decision not in ('rejected','correction_requested') or nullif(btrim(comment),'') is not null)
);

create index petty_cash_reports_owner_week_idx on public.petty_cash_reports(responsible_id,company_id,business_unit_id,week_start,status) where deleted_at is null;
create index petty_cash_reports_review_idx on public.petty_cash_reports(company_id,business_unit_id,status,submitted_at desc) where deleted_at is null;
create index petty_cash_lines_report_idx on public.petty_cash_expense_lines(petty_cash_report_id,sort_order) where deleted_at is null;
create index petty_cash_lines_filters_idx on public.petty_cash_expense_lines(company_id,business_unit_id,expense_date,expense_category_id,cost_center_id) where deleted_at is null;
create index petty_cash_attachments_line_idx on public.petty_cash_line_attachments(expense_line_id,created_at) where deleted_at is null;
create index petty_cash_review_history_idx on public.petty_cash_review_actions(petty_cash_report_id,created_at);

create trigger petty_cash_weekly_limits_updated_at before update on public.petty_cash_weekly_limits for each row execute function public.set_updated_at();
create trigger petty_cash_reports_updated_at before update on public.petty_cash_reports for each row execute function public.set_updated_at();
create trigger petty_cash_expense_lines_updated_at before update on public.petty_cash_expense_lines for each row execute function public.set_updated_at();

create or replace function public.validate_petty_cash_line_scope()
returns trigger language plpgsql set search_path='' as $$
declare r public.petty_cash_reports%rowtype;
begin
  select * into r from public.petty_cash_reports where id=new.petty_cash_report_id;
  if not found or r.company_id<>new.company_id or r.business_unit_id<>new.business_unit_id then
    raise exception 'La línea no pertenece al ámbito de la rendición';
  end if;
  if new.expense_date < r.week_start or new.expense_date > r.week_end then
    raise exception 'La fecha del gasto debe pertenecer a la semana de la rendición';
  end if;
  if not exists(select 1 from public.expense_categories c where c.id=new.expense_category_id and c.company_id=new.company_id
    and c.active and c.deleted_at is null and (c.business_unit_id is null or c.business_unit_id=new.business_unit_id)) then
    raise exception 'Categoría de gasto no disponible para la unidad';
  end if;
  if not exists(select 1 from public.cost_centers c where c.id=new.cost_center_id and c.company_id=new.company_id
    and c.active and c.deleted_at is null and (c.business_unit_id is null or c.business_unit_id=new.business_unit_id)) then
    raise exception 'Centro de costo no disponible para la unidad';
  end if;
  return new;
end $$;
create trigger petty_cash_line_scope before insert or update on public.petty_cash_expense_lines for each row execute function public.validate_petty_cash_line_scope();

create or replace function public.guard_petty_cash_report_content()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.id<>old.id or new.company_id<>old.company_id or new.business_unit_id<>old.business_unit_id
     or new.responsible_id<>old.responsible_id or new.created_by<>old.created_by
     or new.week_start<>old.week_start or new.week_end<>old.week_end then
    raise exception 'La identidad y semana de la rendición son inmutables';
  end if;
  if old.status not in ('draft','correction_requested') and (
    new.general_reason is distinct from old.general_reason or
    new.general_observations is distinct from old.general_observations or
    new.total_registered is distinct from old.total_registered or
    new.total_lines is distinct from old.total_lines) then
    raise exception 'La rendición ya no admite cambios';
  end if;
  return new;
end $$;
create trigger petty_cash_report_guard before update on public.petty_cash_reports for each row execute function public.guard_petty_cash_report_content();

create or replace function public.guard_petty_cash_line_change()
returns trigger language plpgsql set search_path='' as $$
declare report_state public.petty_cash_report_status;
begin
  select status into report_state from public.petty_cash_reports where id=coalesce(new.petty_cash_report_id,old.petty_cash_report_id);
  if report_state not in ('draft','correction_requested') then
    if tg_op='UPDATE' and public.has_permission('finance.petty_cash.review')
      and new.id=old.id and new.company_id=old.company_id and new.business_unit_id=old.business_unit_id
      and new.petty_cash_report_id=old.petty_cash_report_id and new.expense_date=old.expense_date
      and new.merchant_name=old.merchant_name and new.document_type=old.document_type
      and new.document_number is not distinct from old.document_number
      and new.expense_category_id=old.expense_category_id and new.cost_center_id=old.cost_center_id
      and new.description=old.description and new.amount=old.amount
      and new.observation is not distinct from old.observation and new.sort_order=old.sort_order
      and new.created_by=old.created_by and new.deleted_at is not distinct from old.deleted_at then
      return new;
    end if;
    raise exception 'Las líneas de esta rendición son inmutables';
  end if;
  return coalesce(new,old);
end $$;
create trigger petty_cash_line_guard before insert or update or delete on public.petty_cash_expense_lines for each row execute function public.guard_petty_cash_line_change();

create or replace function public.refresh_petty_cash_report_totals()
returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid:=coalesce(new.petty_cash_report_id,old.petty_cash_report_id);
begin
  update public.petty_cash_reports r set
    total_lines=(select count(*) from public.petty_cash_expense_lines l where l.petty_cash_report_id=target and l.deleted_at is null),
    total_registered=coalesce((select sum(l.amount) from public.petty_cash_expense_lines l where l.petty_cash_report_id=target and l.deleted_at is null),0)
  where r.id=target;
  return coalesce(new,old);
end $$;
create trigger petty_cash_line_totals after insert or update or delete on public.petty_cash_expense_lines for each row execute function public.refresh_petty_cash_report_totals();

create or replace function public.can_view_petty_cash_report(r public.petty_cash_reports)
returns boolean language sql stable security definer set search_path='' as $$
  select public.current_user_active() and (
    (r.responsible_id=auth.uid() and (public.has_permission('finance.petty_cash.view_own') or public.has_permission('finance.petty_cash.create')))
    or (public.can_access_unit(r.company_id,r.business_unit_id) and
      (public.has_permission('finance.petty_cash.view_unit') or public.has_permission('finance.petty_cash.review')
       or public.has_permission('finance.petty_cash.manage') or public.has_permission('finance.petty_cash.reports.view')))
  )
$$;

create or replace function public.petty_cash_week_summary(
  target_business_unit uuid, target_week date default ((now() at time zone 'America/Santiago')::date), target_responsible uuid default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); company uuid; monday date; worker uuid:=coalesce(target_responsible,actor);
  limit_value numeric(18,2); committed numeric(18,2); approved numeric(18,2); pending numeric(18,2);
  report_count int; line_count int; attachment_count int;
begin
  if actor is null or not public.current_user_active() then raise exception 'Sesión no válida'; end if;
  select bu.company_id into company from public.business_units bu where bu.id=target_business_unit and bu.active and bu.deleted_at is null;
  if company is null or not public.can_access_unit(company,target_business_unit) then raise exception 'Unidad no autorizada'; end if;
  if worker<>actor and not (public.has_permission('finance.petty_cash.view_unit') or public.has_permission('finance.petty_cash.reports.view') or public.has_permission('finance.petty_cash.manage')) then
    raise exception 'No tienes permiso para consultar a otro trabajador';
  end if;
  monday := (target_week - (extract(isodow from target_week)::int-1));
  select coalesce(
    (select l.weekly_limit from public.petty_cash_weekly_limits l where l.company_id=company and l.business_unit_id=target_business_unit and l.active and l.deleted_at is null),
    (select l.weekly_limit from public.petty_cash_weekly_limits l where l.company_id=company and l.business_unit_id is null and l.active and l.deleted_at is null),100000)
  into limit_value;
  select coalesce(sum(r.total_registered),0),
    coalesce(sum(r.total_registered) filter(where r.status='approved'),0),
    coalesce(sum(r.total_registered) filter(where r.status in ('submitted','under_review','correction_requested','resubmitted')),0),
    count(*),coalesce(sum(r.total_lines),0)
  into committed,approved,pending,report_count,line_count
  from public.petty_cash_reports r where r.responsible_id=worker and r.company_id=company and r.business_unit_id=target_business_unit
    and r.week_start=monday and r.status in ('submitted','under_review','correction_requested','resubmitted','approved') and r.deleted_at is null;
  select count(*) into attachment_count from public.petty_cash_line_attachments a join public.petty_cash_reports r on r.id=a.petty_cash_report_id
    where r.responsible_id=worker and r.business_unit_id=target_business_unit and r.week_start=monday and a.deleted_at is null;
  return jsonb_build_object('week_start',monday,'week_end',monday+6,'weekly_limit',limit_value,'committed',committed,
    'approved',approved,'pending',pending,'available',greatest(limit_value-committed,0),'report_count',report_count,
    'line_count',line_count,'attachment_count',attachment_count);
end $$;

create or replace function public.submit_petty_cash_report(target_report_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r public.petty_cash_reports%rowtype; unit_code text; local_year smallint; next_value bigint;
  report_total numeric(18,2); report_lines int; weekly_limit numeric(18,2); other_committed numeric(18,2); final_status public.petty_cash_report_status;
begin
  if actor is null or not public.current_user_active() or not public.has_permission('finance.petty_cash.create') then raise exception 'No tienes permiso para enviar rendiciones'; end if;
  select * into r from public.petty_cash_reports where id=target_report_id for update;
  if not found or r.responsible_id<>actor or r.created_by<>actor then raise exception 'Rendición no disponible'; end if;
  if r.status not in ('draft','correction_requested') then
    if r.status in ('submitted','resubmitted') then return jsonb_build_object('report_number',r.report_number,'total',r.total_registered,'status',r.status); end if;
    raise exception 'La rendición no se puede enviar en su estado actual';
  end if;
  if not public.can_access_unit(r.company_id,r.business_unit_id) then raise exception 'Unidad no autorizada'; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.responsible_id::text||':'||r.company_id::text||':'||r.business_unit_id::text||':'||r.week_start::text,0));
  select count(*),coalesce(sum(l.amount),0) into report_lines,report_total from public.petty_cash_expense_lines l
    where l.petty_cash_report_id=r.id and l.deleted_at is null;
  if report_lines=0 then raise exception 'Debes agregar al menos un gasto'; end if;
  if exists(select 1 from public.petty_cash_expense_lines l where l.petty_cash_report_id=r.id and l.deleted_at is null and not exists(
    select 1 from public.petty_cash_line_attachments a where a.expense_line_id=l.id and a.deleted_at is null)) then
    raise exception 'Cada gasto debe tener al menos un comprobante';
  end if;
  select coalesce(
    (select l.weekly_limit from public.petty_cash_weekly_limits l where l.company_id=r.company_id and l.business_unit_id=r.business_unit_id and l.active and l.deleted_at is null),
    (select l.weekly_limit from public.petty_cash_weekly_limits l where l.company_id=r.company_id and l.business_unit_id is null and l.active and l.deleted_at is null),100000)
  into weekly_limit;
  select coalesce(sum(x.total_registered),0) into other_committed from public.petty_cash_reports x
    where x.responsible_id=r.responsible_id and x.company_id=r.company_id and x.business_unit_id=r.business_unit_id and x.week_start=r.week_start
      and x.id<>r.id and x.status in ('submitted','under_review','correction_requested','resubmitted','approved') and x.deleted_at is null;
  if other_committed+report_total>weekly_limit then raise exception 'El total semanal supera el límite disponible de Caja Chica'; end if;
  if r.report_number is null then
    local_year:=extract(year from r.week_start)::smallint;
    insert into public.petty_cash_report_sequences(company_id,business_unit_id,year,last_value) values(r.company_id,r.business_unit_id,local_year,1)
      on conflict(company_id,business_unit_id,year) do update set last_value=public.petty_cash_report_sequences.last_value+1,updated_at=now()
      returning last_value into next_value;
    select bu.code into unit_code from public.business_units bu where bu.company_id=r.company_id and bu.id=r.business_unit_id;
    r.report_number:=format('RC-%s-%s-%s',unit_code,local_year,lpad(next_value::text,6,'0'));
    r.sequence_year:=local_year; r.sequence_value:=next_value;
  end if;
  final_status:=case when r.status='correction_requested' then 'resubmitted'::public.petty_cash_report_status else 'submitted'::public.petty_cash_report_status end;
  update public.petty_cash_expense_lines set review_status='pending',reviewer_comment=null where petty_cash_report_id=r.id and deleted_at is null;
  update public.petty_cash_reports set report_number=r.report_number,sequence_year=r.sequence_year,sequence_value=r.sequence_value,
    total_lines=report_lines,total_registered=report_total,status=final_status,submitted_at=now(),
    revision_number=case when r.status='correction_requested' then r.revision_number+1 else r.revision_number end,
    reviewer_comment=case when r.status='correction_requested' then null else reviewer_comment end
  where id=r.id;
  insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
  select r.company_id,r.business_unit_id,p.id,'petty_cash.review_assigned','Rendición de Caja Chica pendiente',
    'La rendición '||r.report_number||' requiere revisión.','petty_cash_report',r.id,actor
  from public.profiles p join public.user_business_units ubu on ubu.user_id=p.id and ubu.company_id=r.company_id and ubu.business_unit_id=r.business_unit_id
  where p.active and p.deleted_at is null and exists(select 1 from public.role_permissions rp join public.permissions pm on pm.id=rp.permission_id
    where rp.role_id=p.role_id and pm.key='finance.petty_cash.review' and pm.active)
    and not exists(select 1 from public.notifications n where n.recipient_id=p.id and n.entity_type='petty_cash_report' and n.entity_id=r.id
      and n.event_key='petty_cash.review_assigned' and n.status='unread');
  return jsonb_build_object('report_number',r.report_number,'total',report_total,'weekly_total',other_committed+report_total,
    'available',weekly_limit-other_committed-report_total,'status',final_status);
end $$;

create or replace function public.decide_petty_cash_report(target_report_id uuid,target_decision text,target_comment text default null,observed_line_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r public.petty_cash_reports%rowtype; decision public.petty_cash_review_decision;
begin
  if actor is null or not public.current_user_active() or not public.has_permission('finance.petty_cash.review') then raise exception 'No tienes permiso para revisar rendiciones'; end if;
  begin decision:=target_decision::public.petty_cash_review_decision; exception when invalid_text_representation then raise exception 'Decisión no válida'; end;
  if decision='approved' and not public.has_permission('finance.petty_cash.approve') then raise exception 'No tienes permiso para aprobar rendiciones'; end if;
  if decision in ('rejected','correction_requested') and nullif(btrim(target_comment),'') is null then raise exception 'Debes ingresar un comentario'; end if;
  select * into r from public.petty_cash_reports where id=target_report_id for update;
  if not found or not public.can_access_unit(r.company_id,r.business_unit_id) then raise exception 'Rendición no disponible'; end if;
  if r.status not in ('submitted','resubmitted','under_review') then raise exception 'La rendición ya fue decidida o no está disponible'; end if;
  if decision='comment' then
    insert into public.petty_cash_review_actions(company_id,business_unit_id,petty_cash_report_id,reviewer_id,decision,comment,revision_number,observed_line_ids)
    values(r.company_id,r.business_unit_id,r.id,actor,decision,target_comment,r.revision_number,coalesce(observed_line_ids,'{}'));
  elsif decision='correction_requested' then
    update public.petty_cash_expense_lines set review_status=case when id=any(coalesce(observed_line_ids,'{}')) then 'observed'::public.petty_cash_line_review_status else 'accepted'::public.petty_cash_line_review_status end,
      reviewer_comment=case when id=any(coalesce(observed_line_ids,'{}')) then target_comment else null end
    where petty_cash_report_id=r.id and deleted_at is null;
    update public.petty_cash_reports set status='correction_requested',correction_requested_at=now(),reviewer_comment=target_comment where id=r.id;
  elsif decision='approved' then
    update public.petty_cash_expense_lines set review_status='accepted',reviewer_comment=null where petty_cash_report_id=r.id and deleted_at is null;
    update public.petty_cash_reports set status='approved',approved_at=now(),approved_by=actor,total_approved=total_registered,total_rejected=0,reviewer_comment=target_comment where id=r.id;
  else
    update public.petty_cash_reports set status='rejected',rejected_at=now(),rejected_by=actor,total_rejected=total_registered,total_approved=0,reviewer_comment=target_comment where id=r.id;
  end if;
  if decision<>'comment' then
    insert into public.petty_cash_review_actions(company_id,business_unit_id,petty_cash_report_id,reviewer_id,decision,comment,revision_number,observed_line_ids)
    values(r.company_id,r.business_unit_id,r.id,actor,decision,target_comment,r.revision_number,coalesce(observed_line_ids,'{}'));
    insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
    values(r.company_id,r.business_unit_id,r.responsible_id,'petty_cash.'||decision::text,
      case decision when 'approved' then 'Rendición aprobada' when 'rejected' then 'Rendición rechazada' else 'Corrección solicitada' end,
      'La rendición '||r.report_number||' fue actualizada.','petty_cash_report',r.id,actor);
  end if;
  return jsonb_build_object('status',case decision when 'approved' then 'approved' when 'rejected' then 'rejected' when 'correction_requested' then 'correction_requested' else r.status::text end);
end $$;

create or replace function public.delete_petty_cash_attachment(target_attachment_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a public.petty_cash_line_attachments%rowtype; state public.petty_cash_report_status;
begin
  select x.* into a from public.petty_cash_line_attachments x where x.id=target_attachment_id for update;
  if not found then return jsonb_build_object('deleted',true); end if;
  select r.status into state from public.petty_cash_reports r where r.id=a.petty_cash_report_id;
  if a.uploaded_by<>actor or state not in ('draft','correction_requested') then raise exception 'El comprobante no se puede eliminar'; end if;
  update public.petty_cash_line_attachments set deleted_at=coalesce(deleted_at,now()) where id=a.id;
  return jsonb_build_object('deleted',true,'bucket_id',a.bucket_id,'object_path',a.object_path);
end $$;

create trigger audit_petty_cash_weekly_limits after insert or update or delete on public.petty_cash_weekly_limits for each row execute function public.audit_row_change();
create trigger audit_petty_cash_reports after insert or update or delete on public.petty_cash_reports for each row execute function public.audit_row_change();
create trigger audit_petty_cash_expense_lines after insert or update or delete on public.petty_cash_expense_lines for each row execute function public.audit_row_change();
create trigger audit_petty_cash_line_attachments after insert or update or delete on public.petty_cash_line_attachments for each row execute function public.audit_row_change();
create trigger audit_petty_cash_review_actions after insert on public.petty_cash_review_actions for each row execute function public.audit_row_change();

alter table public.petty_cash_weekly_limits enable row level security;
alter table public.petty_cash_report_sequences enable row level security;
alter table public.petty_cash_reports enable row level security;
alter table public.petty_cash_expense_lines enable row level security;
alter table public.petty_cash_line_attachments enable row level security;
alter table public.petty_cash_review_actions enable row level security;

create policy petty_cash_limits_select on public.petty_cash_weekly_limits for select to authenticated using(public.can_access_company(company_id));
create policy petty_cash_limits_manage on public.petty_cash_weekly_limits for all to authenticated using(public.can_access_company(company_id) and public.has_permission('finance.petty_cash.manage')) with check(public.can_access_company(company_id) and public.has_permission('finance.petty_cash.manage'));
create policy petty_cash_reports_select on public.petty_cash_reports for select to authenticated using(public.can_view_petty_cash_report(petty_cash_reports));
create policy petty_cash_reports_insert on public.petty_cash_reports for insert to authenticated with check(responsible_id=auth.uid() and created_by=auth.uid() and status='draft' and public.can_access_unit(company_id,business_unit_id) and public.has_permission('finance.petty_cash.create'));
create policy petty_cash_reports_owner_update on public.petty_cash_reports for update to authenticated using(responsible_id=auth.uid() and status in ('draft','correction_requested') and public.has_permission('finance.petty_cash.create')) with check(responsible_id=auth.uid() and public.can_access_unit(company_id,business_unit_id));
create policy petty_cash_lines_select on public.petty_cash_expense_lines for select to authenticated using(exists(select 1 from public.petty_cash_reports r where r.id=petty_cash_report_id and public.can_view_petty_cash_report(r)));
create policy petty_cash_lines_insert on public.petty_cash_expense_lines for insert to authenticated with check(created_by=auth.uid() and exists(select 1 from public.petty_cash_reports r where r.id=petty_cash_report_id and r.responsible_id=auth.uid() and r.status in ('draft','correction_requested')));
create policy petty_cash_lines_owner_update on public.petty_cash_expense_lines for update to authenticated using(exists(select 1 from public.petty_cash_reports r where r.id=petty_cash_report_id and r.responsible_id=auth.uid() and r.status in ('draft','correction_requested'))) with check(created_by=auth.uid());
create policy petty_cash_lines_owner_delete on public.petty_cash_expense_lines for delete to authenticated using(exists(select 1 from public.petty_cash_reports r where r.id=petty_cash_report_id and r.responsible_id=auth.uid() and r.status in ('draft','correction_requested')));
create policy petty_cash_attachments_select on public.petty_cash_line_attachments for select to authenticated using(exists(select 1 from public.petty_cash_reports r where r.id=petty_cash_report_id and public.can_view_petty_cash_report(r)));
create policy petty_cash_attachments_insert on public.petty_cash_line_attachments for insert to authenticated with check(uploaded_by=auth.uid() and exists(select 1 from public.petty_cash_reports r where r.id=petty_cash_report_id and r.responsible_id=auth.uid() and r.status in ('draft','correction_requested')));
create policy petty_cash_attachments_owner_update on public.petty_cash_line_attachments for update to authenticated using(uploaded_by=auth.uid() and exists(select 1 from public.petty_cash_reports r where r.id=petty_cash_report_id and r.status in ('draft','correction_requested'))) with check(uploaded_by=auth.uid());
create policy petty_cash_review_actions_select on public.petty_cash_review_actions for select to authenticated using(exists(select 1 from public.petty_cash_reports r where r.id=petty_cash_report_id and public.can_view_petty_cash_report(r)));

grant select on public.petty_cash_weekly_limits,public.petty_cash_reports,public.petty_cash_expense_lines,
  public.petty_cash_line_attachments,public.petty_cash_review_actions to authenticated;
grant insert on public.petty_cash_reports to authenticated;
grant update(general_reason,general_observations) on public.petty_cash_reports to authenticated;
grant insert,delete on public.petty_cash_expense_lines to authenticated;
grant update(expense_date,merchant_name,document_type,document_number,expense_category_id,cost_center_id,
  description,amount,observation,sort_order,deleted_at) on public.petty_cash_expense_lines to authenticated;
grant insert on public.petty_cash_line_attachments to authenticated;
grant update(deleted_at) on public.petty_cash_line_attachments to authenticated;

drop policy if exists storage_petty_select on storage.objects;
drop policy if exists storage_petty_insert on storage.objects;
drop policy if exists storage_petty_delete on storage.objects;
create policy storage_petty_select on storage.objects for select to authenticated using(bucket_id='petty-cash-attachments' and (
  exists(select 1 from public.petty_cash_line_attachments a join public.petty_cash_reports r on r.id=a.petty_cash_report_id where a.object_path=name and a.deleted_at is null and public.can_view_petty_cash_report(r))
  or exists(select 1 from public.petty_cash_movements m where m.object_path=name and public.can_access_unit(m.company_id,m.business_unit_id) and public.has_permission('finance.petty_cash.view'))));
create policy storage_petty_insert on storage.objects for insert to authenticated with check(bucket_id='petty-cash-attachments' and public.storage_company_id(name) is not null and (
  exists(select 1 from public.petty_cash_reports r where r.id=nullif(split_part(name,'/',2),'')::uuid and r.company_id=public.storage_company_id(name) and r.responsible_id=auth.uid() and r.status in ('draft','correction_requested') and public.has_permission('finance.petty_cash.create'))
  or (public.can_access_company(public.storage_company_id(name)) and public.has_permission('finance.petty_cash.manage'))));
create policy storage_petty_delete on storage.objects for delete to authenticated using(bucket_id='petty-cash-attachments' and (
  exists(select 1 from public.petty_cash_line_attachments a join public.petty_cash_reports r on r.id=a.petty_cash_report_id where a.object_path=name and a.uploaded_by=auth.uid() and r.status in ('draft','correction_requested'))
  or (public.can_access_company(public.storage_company_id(name)) and public.has_permission('finance.petty_cash.manage'))));

revoke all on public.petty_cash_report_sequences from authenticated,anon;
revoke execute on function public.validate_petty_cash_line_scope() from public,anon,authenticated;
revoke execute on function public.guard_petty_cash_report_content() from public,anon,authenticated;
revoke execute on function public.guard_petty_cash_line_change() from public,anon,authenticated;
revoke execute on function public.refresh_petty_cash_report_totals() from public,anon,authenticated;
revoke execute on function public.can_view_petty_cash_report(public.petty_cash_reports) from public,anon;
revoke execute on function public.petty_cash_week_summary(uuid,date,uuid) from public,anon;
revoke execute on function public.submit_petty_cash_report(uuid) from public,anon;
revoke execute on function public.decide_petty_cash_report(uuid,text,text,uuid[]) from public,anon;
revoke execute on function public.delete_petty_cash_attachment(uuid) from public,anon;
grant execute on function public.can_view_petty_cash_report(public.petty_cash_reports),public.petty_cash_week_summary(uuid,date,uuid),
  public.submit_petty_cash_report(uuid),public.decide_petty_cash_report(uuid,text,text,uuid[]),public.delete_petty_cash_attachment(uuid) to authenticated;

insert into public.petty_cash_weekly_limits(company_id,business_unit_id,weekly_limit)
select c.id,null,100000 from public.companies c where c.code='OASIS'
on conflict(company_id,business_unit_id) do update set weekly_limit=excluded.weekly_limit,active=true,deleted_at=null;

comment on table public.petty_cash_reports is 'Rendiciones semanales de gastos menores; separadas del fondo físico legacy.';
comment on function public.submit_petty_cash_report(uuid) is 'Envío idempotente y transaccional con bloqueo del límite semanal por trabajador y unidad.';

commit;
