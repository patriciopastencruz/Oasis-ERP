begin;

-- Respaldo de cierre: el responsable de una tarjeta puede adjuntar un
-- documento o foto (por ejemplo al terminarla), sin necesitar el permiso
-- de gestión completo. Mismo patrón de dos pasos que el resto del repo
-- (petty cash, documentos de proyectos OM): se inserta la fila de
-- metadata primero (autorizada por RLS), y el archivo se sube directo a
-- Storage con esa misma ruta. A diferencia de otras tablas del repo, el
-- borrado de un adjunto es físico (no soft-delete): el archivo se elimina
-- de Storage al mismo tiempo, así que no tiene sentido dejar la fila de
-- metadata "borrada" apuntando a un objeto que ya no existe.

create table public.task_card_attachments(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 task_card_id uuid not null references public.task_cards(id) on delete cascade,
 object_path text not null,
 original_name text not null,
 mime_type text not null check(mime_type in('application/pdf','image/jpeg','image/png')),
 size_bytes bigint not null check(size_bytes between 1 and 10485760),
 uploaded_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(object_path)
);
create index task_card_attachments_card_idx on public.task_card_attachments(task_card_id);

create trigger audit_task_card_attachments after insert or delete on public.task_card_attachments for each row execute function public.audit_row_change();

alter table public.task_card_attachments enable row level security;

create policy task_card_attachments_select on public.task_card_attachments for select to authenticated using(
 exists(select 1 from public.task_cards c where c.id=task_card_id and public.can_access_company(c.company_id) and public.has_permission('tasks.board.view'))
);
create policy task_card_attachments_insert on public.task_card_attachments for insert to authenticated with check(
 uploaded_by=auth.uid() and exists(
   select 1 from public.task_cards c where c.id=task_card_id and c.company_id=company_id and c.deleted_at is null
     and public.can_access_company(c.company_id) and (c.assignee_id=auth.uid() or public.has_permission('tasks.board.manage'))
 )
);
create policy task_card_attachments_delete on public.task_card_attachments for delete to authenticated using(
 exists(select 1 from public.task_cards c where c.id=task_card_id and public.can_access_company(c.company_id)
   and (c.assignee_id=auth.uid() or public.has_permission('tasks.board.manage')))
);
grant select,insert,delete on public.task_card_attachments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-card-attachments','task-card-attachments',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create policy storage_task_card_select on storage.objects for select to authenticated using(
 bucket_id='task-card-attachments' and exists(
   select 1 from public.task_card_attachments a join public.task_cards c on c.id=a.task_card_id
   where a.object_path=storage.objects.name and public.can_access_company(c.company_id) and public.has_permission('tasks.board.view')
 )
);
create policy storage_task_card_insert on storage.objects for insert to authenticated with check(
 bucket_id='task-card-attachments' and public.storage_company_id(name) is not null and exists(
   select 1 from public.task_cards c where c.id=nullif(split_part(name,'/',2),'')::uuid and c.company_id=public.storage_company_id(name) and c.deleted_at is null
     and public.can_access_company(c.company_id) and (c.assignee_id=auth.uid() or public.has_permission('tasks.board.manage'))
 )
);
create policy storage_task_card_delete on storage.objects for delete to authenticated using(
 bucket_id='task-card-attachments' and exists(
   select 1 from public.task_card_attachments a join public.task_cards c on c.id=a.task_card_id
   where a.object_path=storage.objects.name and public.can_access_company(c.company_id) and (c.assignee_id=auth.uid() or public.has_permission('tasks.board.manage'))
 )
);

commit;
