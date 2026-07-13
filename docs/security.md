# Seguridad y autorización

## Controles

- RLS en todas las tablas operacionales.
- Identidad obtenida con `auth.uid()` y permisos consultados en PostgreSQL.
- Roles, unidades y límites enviados por el cliente nunca se consideran autoridad.
- Server Actions y Route Handlers repetirán las validaciones relevantes.
- Buckets privados separados para respaldos y comprobantes; visualización mediante URL firmada de corta duración.
- Clave secreta únicamente en servidor y nunca incluida en bundles del navegador.
- Funciones `security definer` solo si son indispensables, con `search_path` fijo y autorización explícita.

## Visibilidad

- Trabajador: solicitudes propias.
- Administrador, Finanzas y Gerente de área: unidades asignadas según permiso.
- Gerente general: todas las unidades según configuración.
- Superadministrador: administración completa.
- Solo el rol requerido, Gerente general o Superadministrador pueden aprobar.
- Solo Finanzas o roles autorizados pueden programar y registrar pagos.

## Primer Superadministrador

No se crearán contraseñas ni usuarios ficticios en seeds. El primer usuario debe registrarse y verificar su correo con Supabase Auth. Después, un operador con acceso al SQL Editor asignará dentro de una transacción el rol `superadmin` al UUID exacto de esa cuenta. La consulta concreta se entregará junto con las migraciones de la Etapa 2 y deberá retirarse del flujo operativo normal una vez completado el bootstrap.
