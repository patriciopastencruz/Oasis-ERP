begin;

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated using (
  (public.can_access_unit(company_id, business_unit_id) and public.has_permission('finance.payments.view'))
  or exists (
    select 1 from public.payment_requests request
    where request.id = payment_request_id
      and request.requester_id = auth.uid()
      and request.deleted_at is null
  )
);

drop policy if exists receipts_select on public.payment_receipts;
create policy receipts_select on public.payment_receipts for select to authenticated using (
  deleted_at is null and exists (
    select 1
    from public.payments payment
    join public.payment_requests request on request.id = payment.payment_request_id
    where payment.id = payment_id
      and (
        (public.can_access_unit(payment.company_id, payment.business_unit_id)
          and public.has_permission('finance.payments.view'))
        or (request.requester_id = auth.uid() and request.deleted_at is null)
      )
  )
);

drop policy if exists storage_receipt_select on storage.objects;
create policy storage_receipt_select on storage.objects for select to authenticated using (
  bucket_id = 'payment-receipts' and exists (
    select 1
    from public.payment_receipts receipt
    join public.payments payment on payment.id = receipt.payment_id
    join public.payment_requests request on request.id = payment.payment_request_id
    where receipt.object_path = name
      and receipt.deleted_at is null
      and (
        (public.can_access_unit(payment.company_id, payment.business_unit_id)
          and public.has_permission('finance.payments.view'))
        or (request.requester_id = auth.uid() and request.deleted_at is null)
      )
  )
);

commit;
