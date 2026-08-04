begin;

-- El tablero de tareas era gestionable por completo (crear/editar/borrar)
-- por cualquier rol. Se restringe: crear, editar, eliminar o reasignar
-- una tarjeta queda reservado a roles gerenciales/administrativos
-- (tasks.board.manage). Cualquier persona con acceso al tablero conserva
-- la posibilidad de mover SU PROPIA tarjeta asignada entre columnas
-- (Pendiente/En ejecución/Terminado), sin poder editarla ni borrarla.
--
-- tasks_move_card pasa a security definer: el responsable no tiene el
-- permiso 'tasks.board.manage', así que la política RLS de escritura de
-- task_cards (que sigue exigiendo ese permiso para insert/update/delete
-- directos vía REST) le bloquearía el UPDATE. La función valida ella misma
-- que quien llama sea el responsable o tenga el permiso de gestión, y
-- recién entonces actualiza el estado saltándose esa política -- igual que
-- submit_petty_cash_report valida y luego actualiza sin depender de que el
-- trabajador tenga permisos de escritura directos sobre la tabla.

delete from public.role_permissions rp using public.roles r, public.permissions p
where rp.role_id=r.id and rp.permission_id=p.id and p.key='tasks.board.manage'
  and r.key not in('superadmin','general_manager','area_manager','operations_manager','administrator');

create or replace function public.tasks_move_card(target_card uuid,target_status text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); c public.task_cards; next_order int;
begin
 if me is null or not public.current_user_active() then raise exception 'Sesion no valida'; end if;
 if target_status not in('pending','in_progress','done') then raise exception 'Estado invalido'; end if;
 select * into strict c from public.task_cards where id=target_card and deleted_at is null for update;
 if not public.can_access_company(c.company_id) then raise exception 'Compania no autorizada'; end if;
 if not (public.has_permission('tasks.board.manage') or c.assignee_id=me) then raise exception 'Sin autorizacion'; end if;
 select coalesce(max(sort_order)+1,0) into next_order from public.task_cards where company_id=c.company_id and status=target_status and deleted_at is null;
 update public.task_cards set status=target_status,sort_order=next_order,updated_by=me,updated_at=now() where id=c.id;
end $$;
revoke execute on function public.tasks_move_card(uuid,text) from public,anon;
grant execute on function public.tasks_move_card(uuid,text) to authenticated;

commit;
