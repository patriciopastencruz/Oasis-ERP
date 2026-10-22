-- Preguntas a recepción para revisar los datos que usa Lucía (habitaciones,
-- precios y manuales). Cada persona guarda su propia respuesta por pregunta y
-- hostal, sin pisar la de otra; todas ven las respuestas de las hostales a las
-- que tienen acceso. Las preguntas viven en el código; aquí solo las respuestas.

create table public.lucia_staff_answers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  business_unit_id uuid not null references public.business_units(id),
  question_code text not null check (question_code ~ '^[GABC][0-9]{1,2}$'),
  user_id uuid not null references public.profiles(id),
  author_name text not null default '' check (length(author_name) <= 160),
  answer text not null check (length(trim(answer)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, business_unit_id, question_code, user_id)
);
create index lucia_staff_answers_unit_idx on public.lucia_staff_answers(company_id, business_unit_id, question_code);

alter table public.lucia_staff_answers enable row level security;
create policy lucia_staff_answers_read on public.lucia_staff_answers for select to authenticated using(
  public.can_access_unit(company_id, business_unit_id) and public.has_permission('lucia.inbox.view')
);
grant select on public.lucia_staff_answers to authenticated;

create trigger audit_lucia_staff_answers after insert or update on public.lucia_staff_answers
  for each row execute function public.audit_row_change();

-- Guarda o corrige la respuesta propia. Las preguntas B, C y A son de una
-- hostal fija (Cobija, Modulares, Atacama); las G se responden por hostal.
create or replace function public.lucia_save_staff_answer(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  code text := upper(trim(coalesce(payload->>'question_code', '')));
  unit uuid := nullif(payload->>'business_unit_id', '')::uuid;
  body text := trim(coalesce(payload->>'answer', ''));
  company uuid; unit_code text; who text; rid uuid;
begin
  if auth.uid() is null or not public.has_permission('lucia.inbox.reply') then
    raise exception 'No tienes autorización para responder.' using errcode = '42501';
  end if;
  if code !~ '^[GABC][0-9]{1,2}$' then raise exception 'Pregunta inválida.'; end if;
  if length(body) not between 1 and 2000 then raise exception 'La respuesta debe tener entre 1 y 2000 caracteres.'; end if;

  select h.company_id, bu.code into company, unit_code
  from public.lucia_hostels h join public.business_units bu on bu.id = h.business_unit_id
  where h.business_unit_id = unit;
  if company is null then raise exception 'Hostal inválida.'; end if;
  if (code like 'B%' and unit_code <> 'HOB') or (code like 'C%' and unit_code <> 'HOC') or (code like 'A%' and unit_code <> 'HU') then
    raise exception 'La pregunta no corresponde a esa hostal.';
  end if;
  if not public.can_access_unit(company, unit) then
    raise exception 'No tienes acceso a esa hostal.' using errcode = '42501';
  end if;

  select trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) into who from public.profiles p where p.id = auth.uid();

  insert into public.lucia_staff_answers(company_id, business_unit_id, question_code, user_id, author_name, answer)
  values (company, unit, code, auth.uid(), left(coalesce(who, ''), 160), body)
  on conflict (company_id, business_unit_id, question_code, user_id)
  do update set answer = excluded.answer, author_name = excluded.author_name, updated_at = now()
  returning id into rid;
  return rid;
end $$;

revoke execute on function public.lucia_save_staff_answer(jsonb) from public, anon;
grant execute on function public.lucia_save_staff_answer(jsonb) to authenticated;
