begin;
create or replace function public.supplier_bank_account_summary(target_supplier uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();supplier public.suppliers%rowtype;account public.supplier_bank_accounts%rowtype;
begin
 if actor is null or not public.current_user_active() or not public.has_permission('finance.payment_requests.create') then raise exception 'Usuario no autorizado';end if;
 select * into supplier from public.suppliers where id=target_supplier and deleted_at is null;
 if not found or not public.can_access_company(supplier.company_id) then raise exception 'Proveedor no autorizado';end if;
 select * into account from public.supplier_bank_accounts where supplier_id=supplier.id and deleted_at is null;
 if not found then return jsonb_build_object('available',false,'message','Este proveedor no tiene una cuenta bancaria principal disponible.');end if;
 return jsonb_build_object('available',account.active,'bank_name',account.bank_name,'account_type',account.account_type,
  'masked_number',case when length(account.account_number)<=4 then repeat('*',length(account.account_number)) else repeat('*',greatest(length(account.account_number)-4,4))||right(account.account_number,4) end,
  'account_holder_name',account.account_holder_name,'verification_status',account.verification_status,
  'verified',account.active and account.verification_status='verified');
end $$;
revoke all on function public.supplier_bank_account_summary(uuid) from public,anon;
grant execute on function public.supplier_bank_account_summary(uuid) to authenticated,service_role;
commit;
