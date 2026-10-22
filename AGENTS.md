# Guía permanente para agentes de OASIS ERP

- Trabajar dentro de Next.js App Router y Supabase existentes; no crear autenticación, bases ni aplicaciones paralelas.
- Mantener `company_id` y `business_unit_id` en todo dato de dominio y validar ambos con RLS.
- La autorización se expresa con permisos persistidos, se comprueba en Server Actions y se vuelve a imponer en PostgreSQL.
- Todas las tablas públicas nuevas deben tener RLS, `GRANT` explícitos e índices para sus filtros operativos.
- Usar `supabase migration new <nombre>` para crear migraciones. Verificar con reset local y pruebas SQL antes de finalizar.
- No eliminar operaciones comerciales. Usar estado, anulación o `deleted_at` y conservar auditoría en `audit_logs`.
- No confiar en totales, estados, precios ni roles enviados por el navegador. Las transacciones sensibles pertenecen a funciones PostgreSQL.
- Mantener Server Components para lectura y Server Actions para mutaciones; limitar Client Components a interacción local.
- Respetar las unidades especiales existentes: `OM` inventario, `HU` alojamiento y `DA` Distribuidora Altiplánica.
- Ejecutar `pnpm test`, `pnpm lint`, `pnpm typecheck` y `pnpm build` tras cambios funcionales.

## Contexto actual y despliegue

- **Antes de trabajar, leer `docs/estado-del-proyecto-para-agentes.md`**: estado real del sistema, decisiones recientes y trampas conocidas. Si contradice a este archivo en algo operativo, gana el código y `git log`.
- Desplegar son **dos pasos independientes**: `git push origin main` (Vercel publica el código, no corre migraciones) y `npx supabase db push --linked` (esquema). Antes: `npx supabase migration list --linked` y `db push --linked --dry-run`. Si el código depende de la migración, aplicar la migración primero. Cada cambio terminado debe quedar desplegado.
- **Hay varias sesiones de agentes sobre el mismo checkout y todas empujan a `main`.** Un commit local en `main` no queda en espera. Si la migración no está aprobada, usar una rama; no dejar migraciones a medias en `supabase/migrations/`. Agregar archivos por nombre (nunca `git add .`): en la raíz hay PDF/zips/.docx que no son del proyecto.
- El repositorio es **público**: nunca subir claves, `.env`, datos de huéspedes ni de personal. Los tests de migraciones comparan texto SQL; las migraciones van en `begin; … commit;`.
- Para probar UI con datos locales, usar Supabase por Docker y un `.env.development.local` temporal (ver el documento de estado). No escribir contraseñas en formularios.
- Preferir estado derivado de datos reales a banderas guardadas que puedan quedar desfasadas.

