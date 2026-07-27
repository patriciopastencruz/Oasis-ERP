# Proyectos (Oasis Modulares) — arquitectura y operación

Segundo módulo de negocio exclusivo de la unidad Oasis Modulares (`OM`), después de Cotizaciones. Convierte una cotización aceptada en un proyecto, permite un seguimiento básico (estados, responsable, equipo), un registro propio de gastos y un estado de resultados. Es el primer caso del repositorio de una entidad que se convierte en otra: la cotización se conserva siempre intacta como documento comercial/histórico.

## Arquitectura

```
src/modules/sales/projects/
  domain/project.ts            Estados, categorías de gasto, tipos de documento, roles de equipo, clp(), cálculo de resultado/margen
  domain/project.test.ts
  application/
    schemas.ts                 Validación Zod de todas las acciones
    schemas.test.ts
    queries.ts                 projectsContext (reexporta salesContext de Cotizaciones) + loaders tipados
    actions.ts                 Server actions "use server" -> supabase.rpc(...) -> revalidatePath -> redirect
  database/migration.test.ts   Asserts sobre el SQL de la migración

src/app/(portal)/sales/projects/
  page.tsx        Listado (búsqueda, filtro por estado/responsable, orden por fecha)
  new/page.tsx    Creación manual O conversión (?fromQuotation=<id>)
  [id]/page.tsx   Ficha con tabs: Resumen / Gastos / Estado de resultados / Equipo / Documentos / Observaciones

src/components/sales/
  project-form.tsx            Formulario de creación/conversión
  project-expense-form.tsx    Alta de gasto
  project-status-actions.tsx  Avanzar estado, cerrar, reabrir, cancelar
  confirm-button.tsx          Botón de submit con confirmación (reutilizado en todas las acciones destructivas)

supabase/migrations/
  20260727010000_om_projects.sql   Esquema completo, funciones, RLS, permisos, bucket de storage
```

`projectsContext` reutiliza literalmente `salesContext` de Cotizaciones (mismo helper de autenticación + unidad OM) en vez de duplicarlo. La navegación se agregó como dos entradas nuevas dentro de `salesNav` (`src/components/layout/app-shell.tsx`), junto a Cotizaciones — ambos módulos comparten la misma sección del sidebar porque hoy solo los usa Oasis Modulares.

## Modelo de datos

Prefijo `om_project*`, igual convención que `om_quotation*`. Todas las tablas llevan `company_id`/`business_unit_id` (FK compuesta a `business_units`) y trigger de auditoría genérico (`audit_row_change()` → `audit_logs`), sin sistema de logs propio.

| Tabla | Contenido |
|---|---|
| `om_project_sequences` | Contador atómico por unidad y año (`insert ... on conflict do update ... returning`), igual patrón que cotizaciones. |
| `om_projects` | Entidad principal: código, nombre, estado, `quotation_id` (opcional, único cuando no es null), snapshot comercial, responsable, fechas, cierre y cancelación. |
| `om_project_members` | Equipo: usuario del sistema o colaborador externo (nombre libre), con rol. |
| `om_project_expenses` | Gastos: categoría, neto/IVA/total (IVA y total calculados por un trigger de servidor), anulación lógica (`status='voided'`, nunca DELETE). |
| `om_project_expense_attachments` | Respaldo de cada gasto (storage privado). |
| `om_project_documents` | Documentos generales del proyecto (storage privado). |
| `om_project_notes` | Bitácora cronológica, edición/eliminación restringidas al autor y con soft-delete. |
| `om_project_status_history` | Historial legible de cambios de estado (además del `audit_logs` genérico). |

**Decisión de nombres:** no existe una tabla `om_project_closures` separada — el cierre es 1:1 con el proyecto (no un historial repetible), así que vive como columnas (`closed_at/closed_by/closure_notes/actual_end_date`) directamente en `om_projects`.

### Snapshot vs. referencia

`quotation_id` es una referencia de navegación (para volver a ver la cotización original), pero **nunca** se usa en los cálculos. Al convertir, se copian como fotografía (`client_company`, `client_rut`, `client_contact`, `client_email`, `client_place`, `seller_id`, `net_income`, `iva_reference`, `total_commercial`) para que un cambio posterior en la cotización no altere silenciosamente el resultado histórico del proyecto. El ingreso neto del estado de resultados es siempre `om_projects.net_income`, jamás un join en vivo contra `om_quotations.net`.

### Correlativo

`PRY-OM-<año>-<secuencia de 6 dígitos>`, asignado de inmediato al crear el proyecto (manual o por conversión) — a diferencia de cotizaciones (que lo asignan recién al enviar, para no dejar huecos por borradores), un proyecto no tiene concepto de borrador.

### Listado de integrantes de la unidad

`user_business_units` tiene RLS restringida a filas propias, así que no sirve para poblar los selectores de responsable/equipo. Se agregó `public.om_list_unit_members(company,unit)` — una función `security definer` que exige que quien llama ya tenga acceso a la unidad, en el mismo espíritu que la función `public.shares_business_unit()` ya existente para mostrar nombres de colegas en otras bandejas de aprobación.

## Estado de resultados

```
Ingreso neto (net_income, snapshot)
- Gastos netos (suma de net_amount de gastos activos)
= Resultado del proyecto
Margen % = resultado / ingreso neto × 100   (ingreso neto = 0 → "No disponible", nunca división por cero)
```

El IVA de la venta (`iva_reference`) y el IVA de los gastos se muestran aparte, nunca dentro del margen operativo.

## Permisos (módulo `sales`, mismo namespace que `sales.quotations.*`)

`sales.projects.{view,create,update,convert_from_quotation,manage_team,manage_expenses,manage_documents,add_notes,close,reopen,cancel}`

- `seller`: create, update, convert_from_quotation, manage_team, manage_expenses, manage_documents, add_notes.
- `operations_manager`, `general_manager`: view, close, reopen, cancel.
- `superadmin`: todos.

## RLS y seguridad

Todas las mutaciones pasan por funciones `security invoker` que verifican `has_permission(...)` y `can_access_unit(company,unit)` antes de escribir — la autorización real ocurre en la base de datos, no ocultando botones en la interfaz. Un proyecto finalizado o cancelado bloquea ediciones, gastos, equipo y documentos nuevos a nivel de función (no solo de UI); reabrir requiere el permiso especial `sales.projects.reopen`. Los archivos se guardan en el bucket privado `modular-project-attachments` (10MB, PDF/JPG/PNG), con políticas de storage que verifican pertenencia al proyecto + permiso, igual patrón que `payment-request-attachments`/`petty-cash-attachments`. Nunca se confía en montos calculados en el navegador: IVA y total de cada gasto se recalculan en un trigger `before insert/update`.

## Estado de la migración

Aplicada en producción (proyecto Supabase `oasiscompany`) el 2026-07-27. Un primer intento falló a mitad de camino por una columna ambigua (`name`) en las políticas de storage que hacen join con `om_project_documents`/`om_project_expense_attachments` (ambas tienen su propia columna `name`/`original_name`); como toda la migración está envuelta en `begin;`/`commit;`, el fallo revirtió atómicamente sin dejar nada a medio crear — se verificó con `supabase db dump` que no quedó ningún rastro antes de corregir y reintentar. El fix califica explícitamente `storage.objects.name` en esas dos políticas.

Para aplicar en otro entorno:

```bash
supabase db push --linked --dry-run   # confirmar qué migraciones quedan pendientes
supabase db push --linked --yes
supabase db dump --linked -s public | grep -A5 "create table public.om_projects"   # verificar que llegó
```

## Pruebas ejecutadas

`pnpm test` — dominio (transiciones de estado, cálculo de IVA/total, estado de resultados con ingreso cero), esquemas Zod (campos obligatorios, montos no negativos, validación de archivos) y asserts sobre el SQL de la migración (tablas, checks, RLS, storage, permisos).

## Limitaciones de esta primera etapa

No implementado a propósito (alcance explícito de este MVP): carta Gantt, calendario, tareas/subtareas, etapas detalladas de fabricación, dependencias, presupuesto vs. gasto, horas trabajadas, remuneraciones, consumo automático de inventario, órdenes de compra, alertas automáticas, paneles avanzados, IA para proyectos.

Seguimiento manual pendiente: probar el flujo completo end-to-end en la app desplegada (conversión, gastos, cierre) con un usuario real de Oasis Modulares — la migración ya está aplicada en producción, pero el código de la app (este PR) todavía no se ha desplegado ni fusionado a `main`.
