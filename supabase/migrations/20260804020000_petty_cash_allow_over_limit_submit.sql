-- Antes, enviar una rendición que superaba el saldo semanal disponible de
-- Caja Chica quedaba bloqueado por completo (ni el botón ni el RPC lo
-- permitían), dejando a la trabajadora sin forma de rendir gastos reales de
-- la semana una vez agotado el tope. Ahora el envío se permite siempre; la
-- rendición queda marcada con `exceeds_weekly_limit` para que se vea en rojo
-- en la interfaz y el equipo de finanzas la identifique al revisar/aprobar.
alter table public.petty_cash_reports
  add column if not exists exceeds_weekly_limit boolean not null default false;

create or replace function public.submit_petty_cash_report(target_report_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r public.petty_cash_reports%rowtype; unit_code text; local_year smallint; next_value bigint;
  report_total numeric(18,2); report_lines int; weekly_limit numeric(18,2); other_committed numeric(18,2); final_status public.petty_cash_report_status;
  missing_receipts text; exceeds_limit boolean;
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
  select string_agg(l.description,', ' order by l.sort_order) into missing_receipts
  from public.petty_cash_expense_lines l
  where l.petty_cash_report_id=r.id and l.deleted_at is null and not exists(
    select 1 from public.petty_cash_line_attachments a where a.expense_line_id=l.id and a.deleted_at is null);
  if missing_receipts is not null then
    raise exception 'Falta comprobante en: %', missing_receipts;
  end if;
  select coalesce(
    (select l.weekly_limit from public.petty_cash_weekly_limits l where l.company_id=r.company_id and l.business_unit_id=r.business_unit_id and l.active and l.deleted_at is null),
    (select l.weekly_limit from public.petty_cash_weekly_limits l where l.company_id=r.company_id and l.business_unit_id is null and l.active and l.deleted_at is null),100000)
  into weekly_limit;
  select coalesce(sum(x.total_registered),0) into other_committed from public.petty_cash_reports x
    where x.responsible_id=r.responsible_id and x.company_id=r.company_id and x.business_unit_id=r.business_unit_id and x.week_start=r.week_start
      and x.id<>r.id and x.status in ('submitted','under_review','correction_requested','resubmitted','approved') and x.deleted_at is null;
  exceeds_limit:=other_committed+report_total>weekly_limit;
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
    total_lines=report_lines,total_registered=report_total,status=final_status,submitted_at=now(),exceeds_weekly_limit=exceeds_limit,
    revision_number=case when r.status='correction_requested' then r.revision_number+1 else r.revision_number end,
    reviewer_comment=case when r.status='correction_requested' then null else reviewer_comment end
  where id=r.id;
  insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
  select r.company_id,r.business_unit_id,p.id,'petty_cash.review_assigned','Rendición de Caja Chica pendiente',
    'La rendición '||r.report_number||' requiere revisión.'||case when exceeds_limit then ' Supera el saldo semanal disponible.' else '' end,'petty_cash_report',r.id,actor
  from public.profiles p join public.user_business_units ubu on ubu.user_id=p.id and ubu.company_id=r.company_id and ubu.business_unit_id=r.business_unit_id
  where p.active and p.deleted_at is null and exists(select 1 from public.role_permissions rp join public.permissions pm on pm.id=rp.permission_id
    where rp.role_id=p.role_id and pm.key='finance.petty_cash.review' and pm.active)
    and not exists(select 1 from public.notifications n where n.recipient_id=p.id and n.entity_type='petty_cash_report' and n.entity_id=r.id
      and n.event_key='petty_cash.review_assigned' and n.status='unread');
  return jsonb_build_object('report_number',r.report_number,'total',report_total,'weekly_total',other_committed+report_total,
    'available',weekly_limit-other_committed-report_total,'status',final_status,'exceeds_weekly_limit',exceeds_limit);
end $$;
