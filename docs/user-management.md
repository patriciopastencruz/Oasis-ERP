# Administración de usuarios

Permiso requerido: `administration.users.manage`.

El listado permite búsqueda por nombre/correo, estado e invitación con rol, empresas y unidades múltiples. El servidor verifica que cada unidad pertenezca a una empresa asignada. Las operaciones disponibles incluyen crear/invitar, actualizar asignaciones mediante Server Action, activar/desactivar, reenviar invitación y enviar recuperación.

No existe eliminación física desde la interfaz. Si falla el perfil o una asignación después de crear Auth, se eliminan los registros parciales y la cuenta Auth.
