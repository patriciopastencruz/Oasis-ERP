begin;

alter table public.companies
  add column bank_name text,
  add column bank_account_type text,
  add column bank_account_number text,
  add column bank_account_holder_name text,
  add column bank_account_holder_rut text,
  add column bank_receipt_email text,
  add constraint companies_bank_account_type_check
    check (bank_account_type is null or bank_account_type in ('checking','sight','savings','rut','other'));

comment on column public.companies.bank_name is 'Banco de la cuenta principal de la empresa.';
comment on column public.companies.bank_account_number is 'Número de la cuenta bancaria principal de la empresa.';

commit;
