begin;

-- La cuenta queda disponible al guardarse; se conserva el campo histórico para
-- compatibilidad con snapshots de solicitudes ya enviadas.
update public.supplier_bank_accounts
set verification_status = 'verified',
    verified_at = coalesce(verified_at, updated_at, now()),
    verified_by = coalesce(verified_by, created_by),
    verification_notes = null
where verification_status <> 'verified';

create or replace function public.save_supplier_bank_account(
 target_supplier uuid,target_bank text,target_type public.account_type,target_number text,
 target_holder text,target_holder_rut text,target_email text,target_active boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); supplier public.suppliers%rowtype; account_id uuid;
begin
 if actor is null or not public.current_user_active() or not public.has_permission('finance.supplier_bank_accounts.manage') then raise exception 'Usuario no autorizado'; end if;
 select * into supplier from public.suppliers where id=target_supplier and deleted_at is null;
 if not found or not public.can_access_company(supplier.company_id) then raise exception 'Proveedor no autorizado'; end if;
 if not public.is_valid_chilean_rut(target_holder_rut) then raise exception 'RUT del titular inválido'; end if;
 insert into public.supplier_bank_accounts(company_id,supplier_id,bank_name,account_type,account_number,account_holder_name,account_holder_rut,receipt_email,active,verification_status,verified_at,verified_by,created_by)
 values(supplier.company_id,supplier.id,btrim(target_bank),target_type,btrim(target_number),btrim(target_holder),public.normalize_chilean_rut(target_holder_rut),nullif(btrim(target_email),''),target_active,'verified',now(),actor,actor)
 on conflict(supplier_id) do update set bank_name=excluded.bank_name,account_type=excluded.account_type,account_number=excluded.account_number,
  account_holder_name=excluded.account_holder_name,account_holder_rut=excluded.account_holder_rut,receipt_email=excluded.receipt_email,active=excluded.active,
  verification_status='verified',verified_at=now(),verified_by=actor,verification_notes=null,deleted_at=null
 returning id into account_id;return account_id;
end $$;

update public.permissions
set active = false,
    description = 'Permiso retirado: las cuentas quedan disponibles al guardarse'
where key = 'finance.supplier_bank_accounts.verify';

revoke execute on function public.verify_supplier_bank_account(uuid,public.bank_account_verification_status,text) from authenticated;

commit;
