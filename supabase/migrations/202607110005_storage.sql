begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('payment-request-attachments', 'payment-request-attachments', false, 10485760, array['application/pdf','image/jpeg','image/png']),
  ('payment-receipts', 'payment-receipts', false, 10485760, array['application/pdf','image/jpeg','image/png']),
  ('petty-cash-attachments', 'petty-cash-attachments', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_company_id(object_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
declare first_segment text;
begin
  first_segment := split_part(object_name, '/', 1);
  return first_segment::uuid;
exception when invalid_text_representation then return null;
end $$;

create policy storage_request_select on storage.objects for select to authenticated using (
  bucket_id = 'payment-request-attachments' and exists (
    select 1 from public.payment_request_attachments a
    join public.payment_requests r on r.id = a.payment_request_id
    where a.object_path = name and a.deleted_at is null and public.can_view_request(r)
  )
);
create policy storage_request_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'payment-request-attachments'
  and public.can_access_company(public.storage_company_id(name))
  and public.has_permission('finance.payment_requests.create')
);
create policy storage_request_delete on storage.objects for delete to authenticated using (
  bucket_id = 'payment-request-attachments' and exists (
    select 1 from public.payment_request_attachments a
    where a.object_path = name and a.uploaded_by = auth.uid() and a.deleted_at is null
  )
);

create policy storage_receipt_select on storage.objects for select to authenticated using (
  bucket_id = 'payment-receipts' and exists (
    select 1 from public.payment_receipts r
    join public.payments p on p.id = r.payment_id
    where r.object_path = name and r.deleted_at is null
      and public.can_access_unit(p.company_id, p.business_unit_id)
      and public.has_permission('finance.payments.view')
  )
);
create policy storage_receipt_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'payment-receipts'
  and public.can_access_company(public.storage_company_id(name))
  and public.has_permission('finance.payments.execute')
);
create policy storage_receipt_delete on storage.objects for delete to authenticated using (
  bucket_id = 'payment-receipts' and public.can_access_company(public.storage_company_id(name))
  and public.has_permission('finance.payments.execute')
);

create policy storage_petty_select on storage.objects for select to authenticated using (
  bucket_id = 'petty-cash-attachments' and exists (
    select 1 from public.petty_cash_movements m where m.object_path = name
      and public.can_access_unit(m.company_id, m.business_unit_id)
      and public.has_permission('finance.petty_cash.view')
  )
);
create policy storage_petty_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'petty-cash-attachments'
  and public.can_access_company(public.storage_company_id(name))
  and public.has_permission('finance.petty_cash.manage')
);
create policy storage_petty_delete on storage.objects for delete to authenticated using (
  bucket_id = 'petty-cash-attachments'
  and public.can_access_company(public.storage_company_id(name))
  and public.has_permission('finance.petty_cash.manage')
);

comment on function public.storage_company_id(text) is 'Extrae company_id de rutas company_uuid/entity_uuid/file; devuelve null si es inválida.';

commit;
