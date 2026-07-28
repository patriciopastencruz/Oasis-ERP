begin;

-- Permite eliminar (soft-delete) una rendicion de Caja Chica mientras siga
-- en borrador: solo el propio trabajador responsable puede borrarla, igual
-- que la regla ya usada para editar (draft) y para borrar comprobantes.

create or replace function public.delete_petty_cash_report(target_report_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r public.petty_cash_reports%rowtype;
begin
  if actor is null or not public.current_user_active() then raise exception 'Sesión no válida'; end if;
  select * into r from public.petty_cash_reports where id=target_report_id and deleted_at is null for update;
  if not found or r.responsible_id<>actor or r.created_by<>actor then raise exception 'Rendición no disponible'; end if;
  if r.status<>'draft' then raise exception 'Solo puedes eliminar rendiciones en borrador'; end if;
  update public.petty_cash_reports set deleted_at=now() where id=r.id;
  return jsonb_build_object('deleted',true);
end $$;

revoke execute on function public.delete_petty_cash_report(uuid) from public,anon;
grant execute on function public.delete_petty_cash_report(uuid) to authenticated;

commit;
