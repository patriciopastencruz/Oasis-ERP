begin;

-- Revisión manual de comprobantes: constancia de quién revisó una reserva marcada por la revisión
-- automática, cuándo y con qué resultado. Solo se agregan registros: una nueva revisión no borra la anterior.
insert into public.permissions(key,module,description) values
 ('lodging.receipts.review','lodging','Revisar manualmente los comprobantes de pago de las reservas y dejar constancia')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.key='lodging.receipts.review' and r.key in('administrator','superadmin','general_manager','finance_manager')
on conflict do nothing;

create table public.lodging_receipt_reviews(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 business_unit_id uuid not null,
 reservation_id uuid not null references public.lodging_reservations(id),
 outcome text not null check(outcome in('ok','corrected','escalated','pending_receipt')),
 comment text not null check(char_length(btrim(comment)) between 3 and 500),
 reviewed_by uuid not null references public.profiles(id),
 reviewed_at timestamptz not null default now(),
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index lodging_receipt_reviews_reservation_idx on public.lodging_receipt_reviews(reservation_id,reviewed_at desc);
create index lodging_receipt_reviews_unit_idx on public.lodging_receipt_reviews(company_id,business_unit_id,reviewed_at desc);
create index lodging_receipt_reviews_reviewer_idx on public.lodging_receipt_reviews(reviewed_by);

create trigger audit_lodging_receipt_reviews after insert or update or delete on public.lodging_receipt_reviews for each row execute function public.audit_row_change();

alter table public.lodging_receipt_reviews enable row level security;
create policy lodging_receipt_reviews_select on public.lodging_receipt_reviews for select to authenticated
 using(public.can_access_unit(company_id,business_unit_id)
   and (public.has_permission('lodging.receipts.review') or public.has_permission('lodging.closings.reports')));
revoke all on public.lodging_receipt_reviews from public,anon,authenticated;
grant select on public.lodging_receipt_reviews to authenticated;

-- Registrar una revisión. Solo quien tiene el permiso de revisar comprobantes y acceso al hostal de la reserva.
create or replace function public.lodging_review_receipts(target_reservation uuid,p_outcome text,p_comment text) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); r public.lodging_reservations; v_comment text:=btrim(coalesce(p_comment,'')); new_id uuid;
begin
 if me is null or not public.has_permission('lodging.receipts.review') then raise exception 'Sin autorizacion'; end if;
 select * into r from public.lodging_reservations where id=target_reservation;
 if r.id is null or not public.can_access_unit(r.company_id,r.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if p_outcome is null or p_outcome not in('ok','corrected','escalated','pending_receipt') then raise exception 'Resultado de revision no valido'; end if;
 if char_length(v_comment)<3 then raise exception 'Escribe un comentario de lo que revisaste'; end if;
 if char_length(v_comment)>500 then raise exception 'El comentario no puede superar 500 caracteres'; end if;
 insert into public.lodging_receipt_reviews(company_id,business_unit_id,reservation_id,outcome,comment,reviewed_by)
 values(r.company_id,r.business_unit_id,r.id,p_outcome,v_comment,me) returning id into new_id;
 return new_id;
end $$;
revoke execute on function public.lodging_review_receipts(uuid,text,text) from public,anon;
grant execute on function public.lodging_review_receipts(uuid,text,text) to authenticated;

commit;
