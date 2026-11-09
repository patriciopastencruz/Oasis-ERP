begin;

-- Páginas compartidas de Oasis Modulares: se sube un archivo .html (por ejemplo, el visor 3D de una casa
-- generado con Claude) y el ERP lo publica en https://oasis-erp.cl/p/<enlace>, sin sesión. El contenido vive en
-- una tabla aparte para que la auditoría guarde solo los datos de la página, no el HTML completo.
create table public.om_shared_pages(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,
 business_unit_id uuid not null,
 title text not null check(char_length(btrim(title)) between 2 and 120),
 slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
 source_url text check(source_url is null or (source_url ~ '^https://' and char_length(source_url)<=500)),
 active boolean not null default true,
 html_bytes integer not null check(html_bytes>0),
 content_version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),updated_by uuid references public.profiles(id),
 deleted_at timestamptz,
 foreign key(company_id,business_unit_id) references public.business_units(company_id,id)
);
create index om_shared_pages_unit_idx on public.om_shared_pages(company_id,business_unit_id,created_at desc) where deleted_at is null;

create table public.om_shared_page_contents(
 page_id uuid primary key references public.om_shared_pages(id) on delete cascade,
 html text not null check(char_length(html) between 1 and 2000000),
 updated_at timestamptz not null default now()
);

create trigger om_shared_pages_updated_at before update on public.om_shared_pages for each row execute function public.set_updated_at();
create trigger audit_om_shared_pages after insert or update on public.om_shared_pages for each row execute function public.audit_row_change();

alter table public.om_shared_pages enable row level security;
alter table public.om_shared_page_contents enable row level security;

create policy om_shared_pages_read on public.om_shared_pages for select to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.quotations.create'));
create policy om_shared_pages_insert on public.om_shared_pages for insert to authenticated with check(
 created_by=(select auth.uid()) and public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.quotations.create'));
create policy om_shared_pages_update on public.om_shared_pages for update to authenticated using(
 public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.quotations.create'))
 with check(public.can_access_unit(company_id,business_unit_id) and public.has_permission('sales.quotations.create'));

create policy om_shared_page_contents_read on public.om_shared_page_contents for select to authenticated using(
 public.has_permission('sales.quotations.create') and exists(select 1 from public.om_shared_pages p where p.id=page_id and public.can_access_unit(p.company_id,p.business_unit_id)));
create policy om_shared_page_contents_insert on public.om_shared_page_contents for insert to authenticated with check(
 public.has_permission('sales.quotations.create') and exists(select 1 from public.om_shared_pages p where p.id=page_id and public.can_access_unit(p.company_id,p.business_unit_id)));
create policy om_shared_page_contents_update on public.om_shared_page_contents for update to authenticated using(
 public.has_permission('sales.quotations.create') and exists(select 1 from public.om_shared_pages p where p.id=page_id and public.can_access_unit(p.company_id,p.business_unit_id)))
 with check(public.has_permission('sales.quotations.create') and exists(select 1 from public.om_shared_pages p where p.id=page_id and public.can_access_unit(p.company_id,p.business_unit_id)));

revoke all on public.om_shared_pages from public,anon,authenticated;
revoke all on public.om_shared_page_contents from public,anon,authenticated;
grant select,insert,update on public.om_shared_pages to authenticated,service_role;
grant select,insert,update on public.om_shared_page_contents to authenticated,service_role;

-- Crea la página y su contenido en una sola transacción, siempre en la unidad Oasis Modulares (OM).
create function public.om_create_shared_page(p_title text,p_slug text,p_source_url text,p_html text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare unit record; page_id uuid;
begin
 if not public.has_permission('sales.quotations.create') then raise exception 'Sin autorización'; end if;
 select bu.company_id,bu.id into unit from public.business_units bu
  where bu.code='OM' and bu.active and public.can_access_unit(bu.company_id,bu.id) limit 1;
 if unit.id is null then raise exception 'Unidad no autorizada'; end if;
 if p_html is null or char_length(btrim(p_html))=0 or position('<' in p_html)=0 then raise exception 'El archivo no parece una página HTML'; end if;
 insert into public.om_shared_pages(company_id,business_unit_id,title,slug,source_url,html_bytes,created_by)
 values(unit.company_id,unit.id,btrim(p_title),p_slug,nullif(btrim(coalesce(p_source_url,'')),''),octet_length(p_html),auth.uid())
 returning id into page_id;
 insert into public.om_shared_page_contents(page_id,html) values(page_id,p_html);
 return page_id;
end $$;

-- Reemplaza el archivo de una página existente; el enlace no cambia.
create function public.om_replace_shared_page_html(p_page uuid,p_html text)
returns void language plpgsql security invoker set search_path='' as $$
declare found_id uuid;
begin
 if not public.has_permission('sales.quotations.create') then raise exception 'Sin autorización'; end if;
 if p_html is null or char_length(btrim(p_html))=0 or position('<' in p_html)=0 then raise exception 'El archivo no parece una página HTML'; end if;
 select id into found_id from public.om_shared_pages where id=p_page and deleted_at is null for update;
 if found_id is null then raise exception 'Página no encontrada'; end if;
 update public.om_shared_page_contents set html=p_html,updated_at=now() where page_id=p_page;
 update public.om_shared_pages set html_bytes=octet_length(p_html),content_version=content_version+1,updated_by=auth.uid() where id=p_page;
end $$;

revoke execute on function public.om_create_shared_page(text,text,text,text) from public,anon;
revoke execute on function public.om_replace_shared_page_html(uuid,text) from public,anon;
grant execute on function public.om_create_shared_page(text,text,text,text) to authenticated;
grant execute on function public.om_replace_shared_page_html(uuid,text) to authenticated;

commit;
