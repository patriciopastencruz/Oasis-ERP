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
