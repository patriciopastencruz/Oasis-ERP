begin;

-- Asistente ERP IA: copiloto conversacional embebido. Ayuda a los
-- usuarios a navegar y entender la plataforma usando solo conocimiento
-- verificado (nunca inventa). En esta etapa puede ejecutar consultas de
-- solo lectura sobre datos que el usuario ya puede ver por sus propios
-- permisos/RLS (herramientas Nivel 2). No hay acciones de escritura
-- habilitadas todavia.

create type public.assistant_message_role as enum ('user','assistant','system');
create type public.assistant_unresolved_status as enum ('pending','reviewed','resolved');
create type public.assistant_feedback_rating as enum ('helpful','not_helpful');
create type public.assistant_article_validation as enum ('verified','pending','deprecated');

create table public.assistant_settings(
 company_id uuid primary key references public.companies(id),
 enabled boolean not null default true,
 daily_message_limit integer not null default 60 check(daily_message_limit>0),
 welcome_message text,
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id)
);

-- Base de conocimiento en base de datos (no archivos estaticos), para que
-- el ciclo "pregunta no resuelta -> el administrador la revisa -> crea un
-- articulo" funcione sin necesidad de desplegar codigo nuevo.
create table public.assistant_knowledge_articles(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 title text not null,
 module_key text not null,
 route_patterns text[] not null default '{}',
 roles text[] not null default '{}',
 permissions text[] not null default '{}',
 keywords text[] not null default '{}',
 content text not null,
 steps text[] not null default '{}',
 related_routes jsonb not null default '[]',
 related_modules text[] not null default '{}',
 validation_status public.assistant_article_validation not null default 'pending',
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id),
 updated_by uuid references public.profiles(id)
);
create index assistant_articles_module_idx on public.assistant_knowledge_articles(company_id,module_key) where active;

create table public.assistant_conversations(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 user_id uuid not null references public.profiles(id) on delete cascade,
 title text,
 current_module text,
 current_route text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 closed_at timestamptz
);
create index assistant_conversations_user_idx on public.assistant_conversations(user_id, updated_at desc);

create table public.assistant_messages(
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
 user_id uuid not null references public.profiles(id),
 role public.assistant_message_role not null,
 content text not null check(length(content)<=8000),
 metadata jsonb,
 created_at timestamptz not null default now()
);
create index assistant_messages_conversation_idx on public.assistant_messages(conversation_id, created_at);
create index assistant_messages_user_daily_idx on public.assistant_messages(user_id, created_at);

create table public.assistant_feedback(
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null references public.assistant_messages(id) on delete cascade,
 user_id uuid not null references public.profiles(id),
 rating public.assistant_feedback_rating not null,
 comment text,
 created_at timestamptz not null default now(),
 unique(message_id,user_id)
);

create table public.assistant_unresolved_questions(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 user_id uuid not null references public.profiles(id),
 conversation_id uuid references public.assistant_conversations(id) on delete set null,
 question text not null,
 module text,
 route text,
 context jsonb,
 status public.assistant_unresolved_status not null default 'pending',
 resolution text,
 article_id uuid references public.assistant_knowledge_articles(id),
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 resolved_by uuid references public.profiles(id)
);
create index assistant_unresolved_status_idx on public.assistant_unresolved_questions(company_id,status,created_at desc);

insert into public.permissions(key,module,description) values
 ('assistant.admin.manage','assistant','Administrar el Asistente ERP: configuracion, conocimiento y preguntas no resueltas')
on conflict(key) do update set description=excluded.description,active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key='assistant.admin.manage'
where r.key='superadmin' on conflict do nothing;

alter table public.assistant_settings enable row level security;
alter table public.assistant_knowledge_articles enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_feedback enable row level security;
alter table public.assistant_unresolved_questions enable row level security;

create policy assistant_settings_read on public.assistant_settings for select to authenticated using (public.can_access_company(company_id));
create policy assistant_settings_write on public.assistant_settings for all to authenticated using (public.has_permission('assistant.admin.manage') and public.can_access_company(company_id)) with check (public.has_permission('assistant.admin.manage') and public.can_access_company(company_id));

create policy assistant_articles_read on public.assistant_knowledge_articles for select to authenticated using (active and public.can_access_company(company_id));
create policy assistant_articles_write on public.assistant_knowledge_articles for all to authenticated using (public.has_permission('assistant.admin.manage') and public.can_access_company(company_id)) with check (public.has_permission('assistant.admin.manage') and public.can_access_company(company_id));

create policy assistant_conversations_own on public.assistant_conversations for select to authenticated using (user_id=(select auth.uid()) or public.has_permission('assistant.admin.manage'));
create policy assistant_conversations_insert on public.assistant_conversations for insert to authenticated with check (user_id=(select auth.uid()) and public.can_access_company(company_id));
create policy assistant_conversations_update on public.assistant_conversations for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create policy assistant_messages_read on public.assistant_messages for select to authenticated using (exists(select 1 from public.assistant_conversations c where c.id=conversation_id and (c.user_id=(select auth.uid()) or public.has_permission('assistant.admin.manage'))));
create policy assistant_messages_insert on public.assistant_messages for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.assistant_conversations c where c.id=conversation_id and c.user_id=(select auth.uid())));

create policy assistant_feedback_own on public.assistant_feedback for select to authenticated using (user_id=(select auth.uid()) or public.has_permission('assistant.admin.manage'));
create policy assistant_feedback_insert on public.assistant_feedback for insert to authenticated with check (user_id=(select auth.uid()));

create policy assistant_unresolved_read on public.assistant_unresolved_questions for select to authenticated using (user_id=(select auth.uid()) or public.has_permission('assistant.admin.manage'));
create policy assistant_unresolved_insert on public.assistant_unresolved_questions for insert to authenticated with check (user_id=(select auth.uid()) and public.can_access_company(company_id));
create policy assistant_unresolved_update on public.assistant_unresolved_questions for update to authenticated using (public.has_permission('assistant.admin.manage') and public.can_access_company(company_id)) with check (public.has_permission('assistant.admin.manage') and public.can_access_company(company_id));

grant select,insert,update on public.assistant_settings to authenticated,service_role;
grant select,insert,update,delete on public.assistant_knowledge_articles to authenticated,service_role;
grant select,insert,update on public.assistant_conversations to authenticated,service_role;
grant select,insert on public.assistant_messages to authenticated,service_role;
grant select,insert on public.assistant_feedback to authenticated,service_role;
grant select,insert,update on public.assistant_unresolved_questions to authenticated,service_role;

insert into public.assistant_settings(company_id,enabled,daily_message_limit,welcome_message)
select id,true,60,'Hola, soy el Asistente ERP. Puedo ayudarte a utilizar la plataforma, encontrar funciones, comprender estados, revisar que informacion falta y orientarte segun la seccion en la que te encuentras.'
from public.companies
on conflict(company_id) do nothing;

commit;
