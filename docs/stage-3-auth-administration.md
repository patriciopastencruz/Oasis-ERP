# Etapa 3 — Autenticación y administración

## Arquitectura

- `src/lib/supabase`: clientes SSR y cliente administrativo exclusivo de servidor.
- `modules/platform/auth/application`: sesión, permisos y acciones Auth.
- `modules/platform/admin/application`: invitaciones y bootstrap administrativo.
- `src/proxy.ts`: renovación de cookies y protección global de rutas.
- `app/(auth)`: login, recuperación, nueva contraseña y setup inicial.
- `app/(portal)`: layout privado y rutas autorizadas.

## Autenticación

Supabase Auth administra credenciales. El navegador recibe únicamente la clave publishable. El proxy renueva la sesión y redirige usuarios anónimos. Login, logout, recuperación, callback PKCE y cambio de contraseña reutilizan el cliente SSR con cookies seguras.

## Autorización

Las rutas consultan permisos mediante `role_permissions`; no comparan nombres de roles. El menú filtra por las mismas claves. RLS permanece como barrera definitiva. Las mutaciones de Auth que requieren privilegios usan `SUPABASE_SECRET_KEY` en módulos marcados `server-only`.

## Primer Superadministrador

`/setup` solo funciona cuando `profiles` está vacío. Crea la cuenta Auth, perfil, rol `superadmin`, asociación a Oasis Company y todas sus unidades. Después queda bloqueado por el conteo de perfiles. Debe deshabilitarse o protegerse adicionalmente a nivel de despliegue una vez inicializado.

## Usuarios

`/admin/users` lista perfiles y permite invitar una cuenta con rol, empresa y unidad inicial. La invitación dirige al flujo de nueva contraseña. También permite activar/desactivar el perfil. La administración de credenciales nunca escribe contraseñas en tablas públicas.

## Avance 3B y limitaciones sin cambio SQL

La base aprobada no contiene columnas o buckets para avatar de perfil y logo de empresa, ni preferencias por usuario. Usuarios, roles, empresas y unidades ya cuentan con acciones de creación y activación/desactivación; edición avanzada requiere completar sus formularios. Workflows aún no tiene CRUD completo y por ello la Etapa 3 no se considera cerrada.

## Variables

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`.env.local` está ignorado y nunca debe versionarse.
