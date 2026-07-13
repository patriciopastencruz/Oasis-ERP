# Etapa 3B — Administración

Estado actual: usuarios, roles, empresas y unidades disponen de mutaciones seguras básicas; workflows continúa pendiente de CRUD completo. Ninguna operación remota fue ejecutada.

Todas las acciones viven en `modules/platform/admin/application/actions.ts`, validan `permissions.key` y usan un cliente `server-only`. Las invitaciones fallidas compensan Auth, perfil y asignaciones. La desactivación del último Superadministrador y de roles con usuarios activos queda bloqueada.

La prueba remota está bloqueada hasta crear `.env.local` con las cuatro variables documentadas y obtener autorización explícita para crear la primera cuenta.
