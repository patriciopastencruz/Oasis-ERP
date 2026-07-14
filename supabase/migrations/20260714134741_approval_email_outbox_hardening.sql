begin;

-- Política negativa explícita: documenta y verifica que el outbox no es una
-- bandeja consultable por usuarios autenticados. service_role omite RLS.
create policy approval_email_outbox_deny_users
on public.approval_email_outbox
for all
to authenticated
using (false)
with check (false);

create index approval_email_outbox_scope_idx
  on public.approval_email_outbox(company_id, business_unit_id);
create index approval_email_outbox_recipient_idx
  on public.approval_email_outbox(recipient_id, created_at desc);

commit;
