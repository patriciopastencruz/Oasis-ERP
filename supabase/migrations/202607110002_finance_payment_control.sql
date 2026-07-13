begin;

create type public.payment_request_type as enum ('supplier_payment', 'reimbursement', 'petty_cash', 'advance', 'other');
create type public.payment_priority as enum ('urgent', 'normal', 'scheduled');
create type public.payment_request_status as enum ('draft', 'pending_approval', 'under_review', 'correction_requested', 'approved', 'rejected', 'scheduled', 'paid', 'cancelled');
create type public.approval_action_type as enum ('review', 'approve', 'reject', 'request_correction', 'cancel');
create type public.payment_method as enum ('bank_transfer', 'card', 'petty_cash', 'check', 'cash', 'other');
create type public.account_type as enum ('checking', 'sight', 'savings', 'rut', 'other');
create type public.petty_cash_movement_type as enum ('expense', 'replenishment', 'authorized_adjustment');
create type public.petty_cash_movement_status as enum ('draft', 'posted', 'voided');

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  rut text not null,
  legal_name text not null,
  trade_name text,
  bank_name text,
  account_type public.account_type,
  account_number text,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id), deleted_at timestamptz,
  unique (company_id, rut), unique (company_id, id)
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  business_unit_id uuid, code text not null, name text not null, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id), deleted_at timestamptz,
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  unique nulls not distinct (company_id, business_unit_id, code), unique (company_id, id)
);

create table public.cost_centers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  business_unit_id uuid, code text not null, name text not null, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id), deleted_at timestamptz,
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  unique nulls not distinct (company_id, business_unit_id, code), unique (company_id, id)
);

create table public.payment_request_sequences (
  company_id uuid not null, business_unit_id uuid not null, year smallint not null check (year between 2020 and 2200),
  last_value bigint not null default 0 check (last_value >= 0), updated_at timestamptz not null default now(),
  primary key (company_id, business_unit_id, year),
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id) on delete cascade
);

create table public.approval_rules (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, business_unit_id uuid not null,
  min_amount numeric(18,2) not null check (min_amount >= 0 and min_amount = trunc(min_amount)), max_amount numeric(18,2) check (max_amount = trunc(max_amount)),
  required_role_id uuid not null references public.roles(id), approval_level integer not null check (approval_level > 0),
  active boolean not null default true, valid_from date not null default current_date, valid_until date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id), deleted_at timestamptz,
  amount_range numrange generated always as (numrange(min_amount, max_amount, '[]')) stored,
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  check (max_amount is null or max_amount >= min_amount),
  check (valid_until is null or valid_until >= valid_from), unique (company_id, id)
);

alter table public.approval_rules add constraint approval_rules_no_active_overlap
exclude using gist (company_id with =, business_unit_id with =, amount_range with &&)
where (active and deleted_at is null);

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, business_unit_id uuid not null,
  request_number text, sequence_year smallint, sequence_value bigint,
  requester_id uuid not null references public.profiles(id), request_type public.payment_request_type not null,
  supplier_id uuid, supplier_rut text not null, supplier_legal_name text not null,
  bank_name text, account_type public.account_type, account_number text, supplier_email text,
  amount numeric(18,2) not null check (amount > 0 and amount = trunc(amount)), currency char(3) not null default 'CLP' check (currency = 'CLP'),
  expense_category_id uuid not null, cost_center_id uuid not null,
  description text not null, requested_payment_date date, priority public.payment_priority not null default 'normal',
  notes text, status public.payment_request_status not null default 'draft',
  required_approval_rule_id uuid, required_approval_level integer,
  submitted_at timestamptz, approved_at timestamptz, rejected_at timestamptz, cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id), deleted_at timestamptz,
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers(company_id, id),
  foreign key (company_id, expense_category_id) references public.expense_categories(company_id, id),
  foreign key (company_id, cost_center_id) references public.cost_centers(company_id, id),
  foreign key (company_id, required_approval_rule_id) references public.approval_rules(company_id, id),
  check (priority <> 'scheduled' or requested_payment_date is not null),
  check ((status = 'draft' and request_number is null) or status <> 'draft'),
  check ((status <> 'cancelled') or (cancellation_reason is not null and cancelled_at is not null)),
  unique (company_id, business_unit_id, sequence_year, sequence_value), unique (company_id, request_number),
  unique (company_id, id)
);

create table public.payment_request_attachments (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, payment_request_id uuid not null,
  bucket_id text not null default 'payment-request-attachments' check (bucket_id = 'payment-request-attachments'),
  object_path text not null, original_name text not null, mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by uuid not null references auth.users(id), created_at timestamptz not null default now(), deleted_at timestamptz,
  foreign key (company_id, payment_request_id) references public.payment_requests(company_id, id) on delete cascade,
  check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')), unique (bucket_id, object_path)
);

create table public.approval_actions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, business_unit_id uuid not null,
  payment_request_id uuid not null, approver_id uuid not null references public.profiles(id),
  role_id_at_action uuid not null references public.roles(id), action public.approval_action_type not null,
  comment text, request_amount_at_action numeric(18,2) not null check (request_amount_at_action > 0),
  approval_level integer not null check (approval_level > 0), ip_address inet, user_agent text,
  created_at timestamptz not null default now(),
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  foreign key (company_id, payment_request_id) references public.payment_requests(company_id, id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, business_unit_id uuid not null,
  payment_request_id uuid not null, scheduled_date date not null, paid_at timestamptz,
  method public.payment_method, operation_number text, notes text,
  receipt_waived boolean not null default false, receipt_waiver_reason text,
  scheduled_by uuid not null references auth.users(id), paid_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  foreign key (company_id, payment_request_id) references public.payment_requests(company_id, id),
  check (not receipt_waived or nullif(btrim(receipt_waiver_reason), '') is not null),
  check (paid_at is null or (method is not null and paid_by is not null)),
  check (paid_at is null or method in ('cash', 'petty_cash') or nullif(btrim(operation_number), '') is not null),
  unique (company_id, payment_request_id), unique (company_id, id)
);

create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, payment_id uuid not null,
  bucket_id text not null default 'payment-receipts' check (bucket_id = 'payment-receipts'),
  object_path text not null, original_name text not null, mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by uuid not null references auth.users(id), created_at timestamptz not null default now(), deleted_at timestamptz,
  foreign key (company_id, payment_id) references public.payments(company_id, id) on delete cascade,
  check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')), unique (bucket_id, object_path)
);

create table public.petty_cash_accounts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, business_unit_id uuid not null,
  responsible_id uuid not null references public.profiles(id), target_amount numeric(18,2) not null default 100000 check (target_amount > 0 and target_amount = trunc(target_amount)),
  current_balance numeric(18,2) not null default 100000 check (current_balance >= 0 and current_balance = trunc(current_balance)), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id), deleted_at timestamptz,
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id), unique (company_id, id)
);
create unique index petty_cash_one_active_per_unit on public.petty_cash_accounts(company_id, business_unit_id) where active and deleted_at is null;

create table public.petty_cash_movements (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, business_unit_id uuid not null,
  petty_cash_account_id uuid not null, movement_date date not null default current_date,
  supplier_id uuid, supplier_name text, description text not null, expense_category_id uuid,
  amount numeric(18,2) not null check (amount > 0 and amount = trunc(amount)), movement_type public.petty_cash_movement_type not null,
  status public.petty_cash_movement_status not null default 'draft', balance_before numeric(18,2), balance_after numeric(18,2),
  bucket_id text check (bucket_id is null or bucket_id = 'petty-cash-attachments'), object_path text,
  original_name text, mime_type text, size_bytes bigint check (size_bytes is null or size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id), voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text,
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  foreign key (company_id, petty_cash_account_id) references public.petty_cash_accounts(company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers(company_id, id),
  foreign key (company_id, expense_category_id) references public.expense_categories(company_id, id),
  check ((object_path is null and bucket_id is null) or (object_path is not null and bucket_id is not null)),
  check (mime_type is null or mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  check (status <> 'voided' or (voided_at is not null and voided_by is not null and nullif(btrim(void_reason), '') is not null))
);

create index suppliers_company_name_idx on public.suppliers(company_id, legal_name) where active;
create index payment_requests_scope_status_idx on public.payment_requests(company_id, business_unit_id, status, created_at desc) where deleted_at is null;
create index payment_requests_requester_idx on public.payment_requests(requester_id, created_at desc) where deleted_at is null;
create index payment_requests_supplier_idx on public.payment_requests(company_id, supplier_id, created_at desc);
create index approval_actions_request_idx on public.approval_actions(payment_request_id, created_at desc);
create index payments_schedule_idx on public.payments(company_id, scheduled_date, paid_at);
create index petty_cash_movements_account_idx on public.petty_cash_movements(petty_cash_account_id, movement_date, created_at);

create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger expense_categories_updated_at before update on public.expense_categories for each row execute function public.set_updated_at();
create trigger cost_centers_updated_at before update on public.cost_centers for each row execute function public.set_updated_at();
create trigger approval_rules_updated_at before update on public.approval_rules for each row execute function public.set_updated_at();
create trigger payment_requests_updated_at before update on public.payment_requests for each row execute function public.set_updated_at();
create trigger payments_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger petty_cash_accounts_updated_at before update on public.petty_cash_accounts for each row execute function public.set_updated_at();
create trigger petty_cash_movements_updated_at before update on public.petty_cash_movements for each row execute function public.set_updated_at();

commit;
