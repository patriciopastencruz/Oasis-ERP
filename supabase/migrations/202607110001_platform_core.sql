begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

set timezone = 'America/Santiago';
alter database postgres set timezone to 'America/Santiago';

create type public.setting_scope as enum ('global', 'company');
create type public.notification_status as enum ('unread', 'read', 'archived');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$'),
  legal_name text not null,
  trade_name text not null,
  rut text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deleted_at timestamptz,
  unique (code), unique (rut), unique (id, code)
);

create table public.business_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$'),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deleted_at timestamptz,
  unique (company_id, code), unique (company_id, id)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z][a-z0-9_.-]+$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deleted_at timestamptz,
  unique (key)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_.-]+$'),
  module text not null,
  description text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (role_id, permission_id)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  job_title text not null,
  active boolean not null default true,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deleted_at timestamptz
);

create table public.user_companies (
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (user_id, company_id)
);

create table public.user_business_units (
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null,
  business_unit_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (user_id, business_unit_id),
  foreign key (user_id, company_id) references public.user_companies(user_id, company_id) on delete cascade,
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id) on delete cascade
);

create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  scope public.setting_scope not null,
  company_id uuid references public.companies(id),
  key text not null,
  value jsonb not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  check ((scope = 'global' and company_id is null) or (scope = 'company' and company_id is not null)),
  unique nulls not distinct (company_id, key)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  business_unit_id uuid,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  request_id text,
  created_at timestamptz not null default now(),
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  business_unit_id uuid,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  title text not null,
  body text not null,
  entity_type text,
  entity_id uuid,
  status public.notification_status not null default 'unread',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  foreign key (company_id, business_unit_id) references public.business_units(company_id, id),
  check ((status = 'read' and read_at is not null) or status <> 'read')
);

create index business_units_company_idx on public.business_units(company_id) where deleted_at is null;
create index profiles_role_idx on public.profiles(role_id) where active;
create unique index profiles_email_unique_idx on public.profiles(lower(email));
create index user_companies_company_idx on public.user_companies(company_id, user_id);
create index user_business_units_scope_idx on public.user_business_units(company_id, business_unit_id, user_id);
create index audit_logs_scope_time_idx on public.audit_logs(company_id, business_unit_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);
create index notifications_recipient_idx on public.notifications(recipient_id, status, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger companies_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger business_units_updated_at before update on public.business_units for each row execute function public.set_updated_at();
create trigger roles_updated_at before update on public.roles for each row execute function public.set_updated_at();
create trigger permissions_updated_at before update on public.permissions for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger app_settings_updated_at before update on public.app_settings for each row execute function public.set_updated_at();

comment on table public.companies is 'Tenant superior de OASIS ERP.';
comment on table public.audit_logs is 'Bitácora append-only; no admite cambios por usuarios de aplicación.';

commit;
