# Etapa 2A.2 — Pruebas funcionales locales

## Alcance

El arnés `scripts/stage-2a2-local-tests.mjs` crea usuarios reales en Supabase Auth local y opera mediante sesiones `authenticated`. `service_role` se usa exclusivamente para preparar catálogos, asignaciones y consultar resultados de auditoría. Un `db reset` posterior elimina todos los datos.

## Usuarios ficticios

| Rol                   | Correo local                       |
| --------------------- | ---------------------------------- |
| Superadministrador    | `superadmin@oasis.local.test`      |
| Gerente general       | `general_manager@oasis.local.test` |
| Gerente de área       | `area_manager@oasis.local.test`    |
| Encargado de finanzas | `finance_manager@oasis.local.test` |
| Administrador         | `administrator@oasis.local.test`   |
| Trabajador            | `worker@oasis.local.test`          |

La contraseña está marcada dentro del arnés como exclusivamente local y no corresponde a ninguna cuenta real. Las cuentas no se crean en el seed ni pueden llegar al proyecto remoto mediante migraciones.

## Escenarios

Se ejecutan 30 aserciones sobre: aislamiento multiempresa, propiedad de solicitudes, permisos por rol, workflows por monto/tipo, snapshots, secuencia, paralelo, rechazo, corrección `restart_all`, sustitución, Storage privado, dashboards, KPI y auditoría.

## Ejecución

Con Supabase local iniciado:

```bash
eval "$(pnpm exec supabase status -o env 2>/dev/null)"
export API_URL PUBLISHABLE_KEY SECRET_KEY
node scripts/stage-2a2-local-tests.mjs
```

No mostrar ni persistir las variables locales. Al terminar:

```bash
pnpm exec supabase db reset
```

## Correcciones detectadas

1. Se concedieron privilegios SQL explícitos a `service_role`; omitir RLS no reemplaza los grants de PostgreSQL.
2. `prepare_payment_request` pasó a `SECURITY DEFINER` con `search_path=''` y ejecución directa revocada para poder actualizar el contador privado de correlativos.
3. Se corrigió el escenario de Storage: un Administrador sí puede ver respaldos de su unidad; la denegación correcta se prueba con un Trabajador intentando leer una solicitud ajena.
