# Inventario funcional del ERP — Oasis ERP

Este documento es la fuente de verdad que alimenta al Asistente ERP. Fue construido leyendo el código real del proyecto (páginas, server actions, funciones RPC de Postgres y migraciones SQL), no a partir de nombres de módulos ni listas predefinidas. Toda regla de negocio citada aquí indica el archivo y, cuando fue posible, la línea exacta donde se verificó. Todo lo que no pudo confirmarse leyendo código está marcado explícitamente como **PENDIENTE_DE_VALIDACION**.

La versión estructurada de las rutas y permisos de cada módulo vive en [`src/assistant/knowledge/generated-modules.json`](../src/assistant/knowledge/generated-modules.json), usada por el validador de acciones del asistente (`src/modules/assistant/application/action-validator.ts`) para no ofrecer nunca una navegación a una ruta inexistente o sin permiso.

Contexto común a todo el ERP: `requirePermission(permission)` (`src/modules/platform/auth/application/session.ts:56-60`) exige sesión activa y el permiso indicado, redirigiendo a `/no-access` si falta. `requireSession()` exige solo sesión activa. Los permisos del usuario se calculan en `getSessionContext()` a partir de `role_permissions` del rol asignado en `profiles.role_id`.

---

## 1. Administración General (`administration`)

Bandeja unificada de aprobaciones y gestión de usuarios/roles/unidades/flujos, pensada para el punto de vista gerencial transversal a las unidades de negocio.

| Ruta                    | Objetivo                                                                                   | Permiso                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `/admin`                | Landing con accesos a las 4 subsecciones                                                   | `administration.users.manage`                                   |
| `/admin/approvals`      | Bandeja unificada de aprobaciones (Cotizaciones/Pagos/Caja Chica/Inventario/Distribuidora) | `administration.approvals.view`                                 |
| `/admin/business-units` | CRUD de unidades de negocio                                                                | `administration.business_units.manage`                          |
| `/admin/companies`      | Ruta muerta: redirige siempre a `/admin/business-units` (`admin/companies/page.tsx:96`)    | `administration.companies.manage` (evaluado antes del redirect) |
| `/admin/profile`        | Editar datos personales propios                                                            | solo sesión                                                     |
| `/admin/users`          | CRUD de usuarios                                                                           | `administration.users.manage`                                   |
| `/admin/roles`          | CRUD de roles y sus permisos                                                               | `administration.roles.manage`                                   |
| `/admin/workflows`      | CRUD de flujos de aprobación configurables                                                 | `administration.approval_rules.manage`                          |

**Reglas de negocio confirmadas:**

- Crear/editar usuario exige que cada unidad asignada pertenezca a una de las empresas asignadas (`validateAssignments`, `admin/application/actions.ts:48-63`).
- No se puede desactivar al único superadministrador activo (`actions.ts:250-261`).
- No se puede desactivar un rol con perfiles activos asignados (`actions.ts:423-434`).
- La `key` de un rol de sistema (`is_system`) es inmutable (`actions.ts:311-312`).
- Desactivar una unidad de negocio con usuarios o flujos de aprobación activos requiere confirmación explícita (`actions.ts:587-604`); la UI actual nunca envía esa confirmación, por lo que en la práctica queda siempre bloqueado desde esta pantalla.
- Un flujo de aprobación no puede solaparse (mismo tipo/prioridad, rango de monto cruzado) con otro flujo activo de la misma unidad (`actions.ts:687-719`).
- `min_amount` no puede superar `max_amount` en un flujo (`actions.ts:678-679`).
- Los cambios a un flujo de aprobación solo aplican a solicitudes futuras — las instancias en curso quedan congeladas (texto fijo en `admin/workflows/page.tsx:34`).
- **PENDIENTE_DE_VALIDACION**: contenido exacto de `updateProfileAction`; uso real de `sendRecoveryAction` y `duplicateRoleAction` (existen pero no están enlazadas a ningún botón visible).

---

## 2. Proveedores (`suppliers`)

| Ruta              | Objetivo                                    | Permiso                                                                                              |
| ----------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/suppliers`      | Listado de proveedores (RUT enmascarado)    | `finance.suppliers.view`                                                                             |
| `/suppliers/new`  | Alta de proveedor                           | `finance.suppliers.manage`                                                                           |
| `/suppliers/[id]` | Ficha + cuenta bancaria única del proveedor | `finance.supplier_bank_accounts.view` (guardar cuenta exige `finance.supplier_bank_accounts.manage`) |

Nota de arquitectura: estas rutas son re-exports puros de `src/app/(portal)/finance/payment-control/suppliers/*` — el mismo componente se sirve en ambas rutas.

**Reglas confirmadas:** RUT único por empresa (`23505` → "Ya existe un proveedor con ese RUT en la empresa"); cada proveedor tiene una única cuenta bancaria; el banco debe pertenecer a una lista cerrada de bancos chilenos (`isChileanBank`).

---

## 3. Panel ejecutivo (`dashboard`)

`/dashboard` — permiso `reports.executive_dashboard.view`. KPIs financieros del mes (solicitado/aprobado/pagado/pendiente vía RPC `executive_payment_summary`), tendencia de 6 meses, estados del mes. Sección operativa **varía exactamente por código de unidad**:

- `DA` (Distribuidora): requiere además `finance.distribution.view` → pedidos de hoy/entregados/pendientes/venta del día.
- `OM` (Materiales): requiere además `inventory.materials.view` → stock, valor, salidas de hoy.
- `HOC`/`HOB`/`HU` (Hospedaje): requiere además `lodging.reservations.view` → habitaciones/ocupadas/disponibles/% ocupación.
- Cualquier otra unidad: sin sección operativa.

Si falta el permiso operativo correspondiente, la sección desaparece silenciosamente (sin mensaje de error).

---

## 4. Notificaciones (`notifications`)

`/notifications` — solo sesión, sin permiso adicional; cada usuario ve únicamente sus propias notificaciones (`recipient_id = ctx.user.id`). Navegación desde una notificación resuelta por `notificationActionPath()` (`src/lib/notifications/approval-email-template.ts:17-38`) con reglas exactas por `entity_type`.

---

## 5. Solicitud de Pagos (`payment_control`)

| Ruta                                      | Objetivo                | Permiso                                                                                           |
| ----------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `/finance/payment-control`                | Hub del módulo          | solo sesión                                                                                       |
| `/finance/payment-control/new`            | Crear borrador          | `finance.payment_requests.create`                                                                 |
| `/finance/payment-control/my-requests`    | Mis solicitudes         | solo sesión (filtrado por `requester_id`)                                                         |
| `/finance/payment-control/requests/[id]`  | Detalle/edición         | solo sesión + RLS (editable solo si dueño y estado `draft`/`correction_requested`)                |
| `/finance/payment-control/approvals`      | Bandeja de aprobaciones | `finance.approvals.decide`                                                                        |
| `/finance/payment-control/approvals/[id]` | Decidir una etapa       | `finance.approvals.decide`                                                                        |
| `/finance/payment-control/payments`       | Cola de pagos           | `finance.payments.view`                                                                           |
| `/finance/payment-control/payments/[id]`  | Ejecutar/anular pago    | `finance.payments.view` (ejecutar: `finance.payments.execute`; anular: `finance.payments.manage`) |
| `/finance/payment-control/payments/paid`  | Pagos ejecutados        | `finance.payments.view`                                                                           |
| `/finance/payment-control/reports`        | Reportes exportables    | `finance.reports.view` (exportar: `finance.reports.export`)                                       |
| `/finance/payment-control/dashboard`      | Dashboard financiero    | `finance.reports.view`                                                                            |
| `/finance/payment-control/categories`     | Categorías de gasto     | `finance.expense_categories.manage` o `administration.categories.manage`                          |
| `/finance/payment-control/cost-centers`   | Centros de costo        | `finance.cost_centers.manage` o `administration.cost_centers.manage`                              |

**Estados** (`payment_requests.status`): `draft → pending_approval → under_review/approved/rejected/correction_requested → (approved) → scheduled/cancelled → paid`.

**Reglas de negocio confirmadas:**

- Adjuntos: PDF/JPEG/PNG únicamente, máx. 10 MB, máx. 4 archivos (`schemas.ts:72-78`, `actions.ts:185-193`).
- Monto entero positivo obligatorio (`schemas.ts:36-39`).
- Fecha de pago obligatoria si prioridad = `scheduled` (`schemas.ts:55-62`).
- Solo el solicitante puede editar, y solo en `draft`/`correction_requested` (`actions.ts:154-158`).
- Decisión de aprobación: comentario obligatorio si no es `approve`, adjunto obligatorio si la etapa lo exige.
- Ejecución de pago: comprobante obligatorio; **el monto ejecutado debe coincidir exactamente con el aprobado**, validado en BD (`202607120002_direct_payment_registration.sql:65`).
- Anulación: motivo obligatorio ≥3 caracteres, solo aplicable a `approved`/`scheduled` (`20260715141306_payment_request_cancellation.sql:11-14`).
- El flujo de aprobación se determina por condiciones configurables (`approval_workflow_conditions`: tipo, prioridad, rango de monto) — no hay montos fijos hardcodeados en TypeScript.
- **PENDIENTE_DE_VALIDACION**: lógica interna completa de `can_approve_workflow_step`, `submit_payment_request`, `decide_payment_request_approval_step` (RPCs no leídas en detalle); contenido de `/api/finance/reports.csv|xlsx`.

---

## 6. Caja Chica (`petty_cash`)

| Ruta                               | Objetivo                                    | Permiso                                                         |
| ---------------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `/finance/petty-cash`              | Home / KPIs de la semana                    | solo sesión                                                     |
| `/finance/petty-cash/new`          | Nueva rendición                             | `finance.petty_cash.create`                                     |
| `/finance/petty-cash/my-reports`   | Mis rendiciones                             | solo sesión                                                     |
| `/finance/petty-cash/reports`      | Reporte consolidado por línea + exportación | `finance.petty_cash.reports.view` (exportar: `.reports.export`) |
| `/finance/petty-cash/reports/[id]` | Detalle/edición de rendición                | solo sesión + RLS                                               |
| `/finance/petty-cash/approved`     | Rendiciones aprobadas                       | `finance.petty_cash.reports.view` o `.manage`                   |
| `/finance/petty-cash/dashboard`    | Dashboard semanal                           | `finance.petty_cash.reports.view`                               |
| `/finance/petty-cash/reviews/[id]` | Revisar y decidir                           | `finance.petty_cash.review` (aprobar: `.approve`)               |

**Estados:** `draft, submitted, under_review, correction_requested, resubmitted, approved, rejected, cancelled`.

**Reglas de negocio confirmadas:**

- Límite **semanal** (no mensual, no por línea) — tabla `petty_cash_weekly_limits`, 100.000 CLP por defecto, configurable por unidad o por compañía (`20260714004000...sql:38-48,229-260`).
- Cada gasto debe tener al menos un comprobante adjunto (`...sql:279-282`).
- El total comprometido de la semana (otras rendiciones activas + la actual) no puede superar el límite vigente (`...sql:290`).
- Adjuntos: PDF/JPEG/PNG, máx. 10 MB.
- La semana debe iniciar en lunes y durar exactamente 7 días; no se puede rendir una semana futura.
- Rechazo o solicitud de corrección exige comentario obligatorio; solo quien tiene `finance.petty_cash.approve` puede aprobar.
- Rendición inmutable fuera de `draft`/`correction_requested` (excepto campos de revisión por el revisor).
- Correlativo `RC-<código_unidad>-<año>-<secuencia>` asignado al primer envío.

---

## 7. Distribuidora Altiplánica (`distribution`)

Todas las páginas usan `distributionContext(permission?)` (default `finance.distribution.view`), que además resuelve la unidad de código `DA` del usuario.

| Ruta                                       | Objetivo                                          | Permiso                                                                                              |
| ------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/finance/distribution/catalogs`           | Catálogo de productos y precios                   | `finance.distribution.view` (crear precio exige `.catalogs.manage`, validado en la action)           |
| `/finance/distribution/stock`              | Stock de materia prima (facturas/salidas)         | `.stock.view` (gestionar: `.stock.manage`)                                                           |
| `/finance/distribution/account-statements` | Estado de cuenta por cliente                      | `.reports.view`                                                                                      |
| `/finance/distribution/payments`           | Registrar cobros                                  | `finance.distribution.view` (cobrar exige `.payments.manage` o rol chofer `.driver`)                 |
| `/finance/distribution/reports`            | Cierre diario + reporte por período               | `.reports.view` (cerrar jornada: `.closures.manage`)                                                 |
| `/finance/distribution/customers`          | Alta de clientes                                  | `finance.distribution.view` (crear exige `.customers.manage`)                                        |
| `/finance/distribution/customers/[id]`     | Ficha, edición, precios especiales, baja lógica   | edición: `.customers.edit`; precios: `.catalogs.manage`                                              |
| `/finance/distribution/orders/new`         | Nuevo pedido planificado                          | `.orders.create` (`requirePermission` bloquea acceso completo, no solo la action)                    |
| `/finance/distribution/orders/[id]`        | Detalle, edición directa/por solicitud, anulación | `finance.distribution.view` (editar directo: `.orders.manage`; solicitar cambio: `.requests.create`) |

**Reglas de negocio confirmadas:**

- Stock de materia prima: no se permite dejar stock negativo desde el registro manual de salidas (`register_inventory_output` a nivel de aplicación); factura duplicada por proveedor rechazada.
- Cobros: no se puede sobrepagar la deuda del pedido (`dist_register_payment`, migración línea 337); un chofer solo puede cobrar sus propios pedidos asignados.
- Cliente: `credit_days` entre 0 y 365; sin crédito habilitado fuerza `credit_limit=0`, `credit_status='suspended'`.
- Creación de pedido (`dist_create_order`): unidad debe estar abierta (no cerrada por `dist_closed`); pedidos planificados requieren cliente registrado; pago a crédito exige `has_credit=true`, `credit_status='current'`, sin bloqueo comercial; **el límite de crédito del cliente se puede exceder solo si quien crea tiene `finance.distribution.orders.manage`**.
- Edición/anulación de pedido solo permitida en estados `scheduled`/`assigned` (anulación) o mientras no esté `delivered/partially_delivered/cancelled/voided` (edición).
- Cierre de jornada (`closeDayAction`) es de una sola vía desde esta pantalla — no hay botón para reabrir.
- **PENDIENTE_DE_VALIDACION**: lógica exacta de `dist_resolve_price`, `dist_outstanding`, `dist_daily_summary` más allá de lo confirmado; si `dist_void_order` valida el estado a nivel de BD además de la UI.

---

## 8. Reservas / Hospedaje (`lodging`)

Unidades con código `HU` (Hostal Uruguay) y `HOC` (Hostal Oasis Centro), resueltas por `lodgingContext(permission?)` (default `lodging.reservations.view`).

| Ruta                         | Objetivo                                | Permiso                                                            |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| `/lodging`                   | Calendario semanal de reservas          | `lodging.reservations.view`                                        |
| `/lodging/arrivals`          | Llegadas de hoy                         | `lodging.reservations.view`                                        |
| `/lodging/departures`        | Salidas de hoy                          | `lodging.reservations.view`                                        |
| `/lodging/ical`              | Sincronización con Booking/Airbnb       | `lodging.ical.sync`                                                |
| `/lodging/reservations`      | Listado de reservas                     | `lodging.reservations.view`                                        |
| `/lodging/reservations/new`  | Nueva reserva                           | `lodging.reservations.manage`                                      |
| `/lodging/reservations/[id]` | Detalle: check-in/out, pagos, anulación | `lodging.reservations.view` (anular pago: `lodging.payments.void`) |
| `/lodging/rooms`             | Habitaciones                            | `lodging.reservations.view`                                        |
| `/lodging/settings`          | Configuración de Reservas               | `lodging.reservations.view`                                        |

**Reglas confirmadas:** las reservas importadas de Booking/Airbnb (`imported_from_ical`) no pueden editarse desde el ERP salvo un formulario de "información interna" que no se sincroniza al canal de origen; check-in solo disponible en estado `confirmed`, check-out solo en `checked_in`; anular un pago exige motivo (`void_reason`, mín. 3 caracteres) y permiso `lodging.payments.void`.

---

## 9. Ventas / Cotizaciones (`sales_quotations`)

| Ruta                          | Objetivo                                | Permiso                                                                        |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `/sales/quotations`           | Listado (filtro por estado)             | `sales.quotations.create`                                                      |
| `/sales/quotations/new`       | Nueva cotización (nace en `draft`)      | `sales.quotations.create`                                                      |
| `/sales/quotations/[id]`      | Detalle/edición/envío/entrega/PDF       | `sales.quotations.create` (editable solo si dueño y estado `draft`/`rejected`) |
| `/sales/quotations/approvals` | Aprobar/rechazar cotizaciones `pending` | `sales.quotations.approve`                                                     |

**Estados:** `draft, pending, approved, rejected, delivered`.

**Reglas de negocio confirmadas:**

- Debe existir al menos un ítem; cantidad y precio unitario deben ser válidos (`om_create_quotation`, `20260721050000_om_quotations.sql:71-94`).
- Descuento entre 0 y el subtotal.
- IVA = 19% sobre el neto (`net = subtotal - discount`).
- El correlativo `COT-{año}-{secuencial}` se asigna solo al enviar a aprobación, no al crear el borrador.
- **Auto-aprobación**: si quien envía la cotización también tiene `sales.quotations.approve` (p. ej. gerente de operaciones/general/área), pasa directo a `approved` sin pasar por `pending` (`20260721060000_om_quotations_manager_self_approve.sql:13-34`).
- Solo se puede editar/enviar en estados `draft`/`rejected`, y solo el creador.
- El PDF (`/api/sales/quotations/[id]/pdf`) solo está disponible si el estado es `approved`/`delivered`.
- Marcar como entregada exige estado `approved` y ser el creador.
- Términos por defecto (`DEFAULT_QUOTATION_TERMS`, `domain/quotation.ts:12-16`): validez de 5 días hábiles, montos netos + IVA, medios de pago con recargo 3% en tarjeta, anticipo 50%, se trabaja con OC/contrato.
- **PENDIENTE_DE_VALIDACION**: si `om_review_quotation` valida longitud mínima del comentario de resolución a nivel de BD (el HTML lo exige, el RPC no lo valida explícitamente).

---

## 10. Inventario (`inventory`)

| Ruta                        | Objetivo                                                              | Permiso                                                          |
| --------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `/inventory`                | Menú principal                                                        | `inventory.materials.view`                                       |
| `/inventory/materials`      | Maestro de materiales                                                 | `inventory.materials.view`                                       |
| `/inventory/materials/new`  | Nuevo material (código `MAT-####` automático)                         | `inventory.materials.create`                                     |
| `/inventory/materials/[id]` | Ficha, historial, solicitar edición/desactivación                     | `inventory.materials.view` (solicitar cambio: `.request_change`) |
| `/inventory/invoices`       | Facturas de compra                                                    | `inventory.materials.view`                                       |
| `/inventory/invoices/new`   | Ingresar factura (aumenta stock, recalcula precio promedio ponderado) | `inventory.purchases.create`                                     |
| `/inventory/outputs`        | Salidas de material                                                   | `inventory.materials.view`                                       |
| `/inventory/outputs/new`    | Registrar salida (consumo o pérdida)                                  | `inventory.outputs.create`                                       |
| `/inventory/movements`      | Historial general de movimientos (últimos 500)                        | `inventory.materials.view`                                       |
| `/inventory/reports`        | Exportación a Excel                                                   | `inventory.reports.export`                                       |
| `/inventory/approvals`      | Decidir solicitudes de cambio                                         | `inventory.approvals.decide`                                     |

**Estados del material:** `active, inactive, pending_deletion`. **Tipos de movimiento:** `initial_stock, purchase, operational_consumption, loss`.

**Reglas de negocio confirmadas:**

- Código correlativo `MAT-0001`, `MAT-0002`... asignado automáticamente al crear.
- Imagen del material: solo JPEG/PNG, máx. 5 MB.
- Solo puede existir **una solicitud de cambio pendiente por material** a la vez (índice único parcial).
- Solicitar desactivación deja el material en `pending_deletion` de inmediato, antes de la decisión.
- Ingreso de factura: costo promedio ponderado recalculado en cada compra; factura duplicada por proveedor rechazada (`unique(company_id, supplier_id, invoice_number)`).
- Registro de salida manual: **rechaza dejar stock negativo** a nivel de aplicación (`register_inventory_output`); motivo obligatorio (mín. 3 caracteres) si el tipo es `loss`.
- **Nota importante de integridad**: los constraints de BD que impedían stock negativo en `inventory_movements` fueron eliminados en migraciones posteriores para permitir que el consumo automático de materia prima del módulo Distribuidora deje stock en negativo intencionalmente — la ruta manual de salidas sigue bloqueando negativo, pero ahora solo por validación de aplicación, no por constraint de BD.
- Aprobar una solicitud de edición aplica los valores propuestos sin re-validar rangos más allá de los constraints de tabla existentes.
- **PENDIENTE_DE_VALIDACION**: contenido de `/api/inventory/reports.xlsx`; contenido de `dispatchApprovalEmails()`.

---

## 11. Asistente ERP (`assistant`)

Módulo nuevo, agregado en esta misma entrega. Ver [`docs/asistente-erp.md`](./asistente-erp.md) para el detalle de su propia arquitectura, tablas, endpoints y seguridad — no se documenta aquí para evitar duplicación.

---

## Módulos que NO existen en el proyecto (confirmado por ausencia de rutas)

Se verificó el árbol completo bajo `src/app/(portal)/` — no existen módulos de CRM, Prospectos, Producción, Compras (como módulo separado de Inventario) ni Configuración general más allá de lo ya listado. `src/config/modules.ts` está desactualizado (marca módulos ya construidos como `planned`) y **no se usó como fuente** para este inventario.

## Resumen de reglas marcadas PENDIENTE_DE_VALIDACION

Ver el detalle dentro de cada sección. En síntesis, lo no confirmado corresponde siempre a: (a) lógica interna de funciones RPC de Postgres que no fueron leídas línea por línea, (b) contenido de endpoints de exportación (`/api/**/reports.*`), y (c) un puñado de funciones auxiliares (`dispatchApprovalEmails`, `updateProfileAction`) fuera del alcance explícito de la lectura. El asistente debe responder "no tengo información suficiente" ante preguntas que dependan exclusivamente de estos puntos, y registrar la pregunta como no resuelta.
