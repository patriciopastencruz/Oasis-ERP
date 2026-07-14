# Administración de usuarios

Permiso requerido: `administration.users.manage`.

El listado permite búsqueda por nombre/correo y estado, además de creación inmediata con rol, empresas, unidades múltiples y contraseña inicial. El servidor verifica que cada unidad pertenezca a una empresa asignada. Las operaciones disponibles incluyen crear, actualizar asignaciones mediante Server Action, activar/desactivar y enviar recuperación de contraseña cuando sea necesario.

No existe eliminación física desde la interfaz. Si falla el perfil o una asignación después de crear Auth, se eliminan los registros parciales y la cuenta Auth.
