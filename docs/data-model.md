# Modelo de datos preliminar de OASIS ERP

Este documento describe el núcleo de organización única y el primer módulo, Finanzas → Solicitud de Pagos.

Todas las claves principales serán UUID; montos usarán `numeric(18,2)`, fechas `timestamptz` y entidades administrables `active` o `deleted_at`.

## Núcleo de plataforma

| Tabla                 | Propósito y relaciones principales                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `companies`           | Registro técnico único, implícito y no administrable desde la interfaz.                                     |
| `business_units`      | Pertenece obligatoriamente a `companies`; código único dentro de la empresa.                                |
| `profiles`            | Extensión 1:1 de `auth.users`; datos personales y rol principal.                                            |
| `user_companies`      | Asignación técnica automática al registro organizacional único.                                             |
| `user_business_units` | Unidades asignadas; la unidad debe pertenecer a una empresa autorizada.                                     |
| `roles`               | Rol principal global y configurable; el alcance de datos se define mediante asignaciones de empresa/unidad. |
| `permissions`         | Catálogo estable de capacidades, independiente de los roles.                                                |
| `role_permissions`    | Relación N:M administrable entre roles y permisos.                                                          |
| `notifications`       | Eventos internos por destinatario, empresa y entidad.                                                       |
| `audit_logs`          | Registro inmutable con empresa, actor, acción y valores anterior/nuevo.                                     |
| `app_settings`        | Parámetros globales o por empresa, nunca secretos.                                                          |

## Finanzas → Solicitud de Pagos

| Tabla                         | Propósito y relaciones principales                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `suppliers`                   | Proveedores chilenos pertenecientes a una empresa; RUT único por empresa.               |
| `expense_categories`          | Categorías pertenecientes a empresa y opcionalmente unidad.                             |
| `cost_centers`                | Centros de costo pertenecientes a empresa y opcionalmente unidad.                       |
| `payment_requests`            | Solicitud con empresa, unidad, correlativo, monto, estado, proveedor y regla congelada. |
| `payment_request_attachments` | Metadatos y ruta privada de respaldos.                                                  |
| `approval_rules`              | Legado de 2A; deprecada por workflows configurables.                                    |
| `approval_actions`            | Legado de 2A; deprecada por decisiones vinculadas a etapas.                             |
| `payments`                    | Programación y ejecución de una solicitud aprobada.                                     |
| `payment_receipts`            | Metadatos y ruta privada de comprobantes.                                               |
| `petty_cash_accounts`         | Una caja activa por empresa/unidad y fondo objetivo.                                    |
| `petty_cash_movements`        | Libro de gastos, reposiciones y ajustes autorizados.                                    |

## Jerarquía y aislamiento

```text
companies
├── business_units
├── user_companies
├── roles / asignaciones
├── suppliers
├── expense_categories
├── cost_centers
└── payment_requests
    ├── attachments
    ├── approval_actions
    └── payments
        └── receipts
```

Aunque una unidad permite derivar la empresa, las tablas operacionales críticas conservarán `company_id` para políticas RLS claras, particionado futuro y consultas eficientes. Se usarán claves foráneas compuestas o triggers para impedir que `company_id` y `business_unit_id` pertenezcan a organizaciones diferentes.

## Roles + Permissions

Se recomienda incorporarlos desde la primera migración. El código verificará claves de permiso, no nombres de roles. Los roles iniciales serán presets modificables; agregar o quitar un permiso será una operación administrativa auditada.

Un usuario tendrá un rol principal. Su permiso efectivo requerirá simultáneamente:

1. Usuario activo.
2. Rol con el permiso requerido.
3. Acceso a la empresa.
4. Acceso a la unidad cuando la operación sea específica de unidad.
5. Cumplimiento de reglas de negocio, como el límite de aprobación.

## Restricciones esenciales

- Código de empresa único globalmente.
- Código de unidad único dentro de cada empresa.
- RUT de proveedor normalizado único dentro de cada empresa.
- Reglas activas no superpuestas para empresa y unidad.
- Una caja chica activa por unidad mediante índice único parcial.
- Correlativo único por empresa, unidad y año.
- Ninguna relación puede cruzar empresas accidentalmente.
- Solicitudes rechazadas, anuladas o no aprobadas no pueden pagarse.
- Archivos privados: PDF, JPG, JPEG o PNG, máximo inicial de 10 MB.

## Datos iniciales previstos

Organización base: registro técnico único.

Unidades: Hostal Oasis Centro, Hostal Oasis Cobija, Oasis Modulares y Distribuidora Altiplánica.

Reglas por unidad: `0–100.000 Administrador`, `100.001–500.000 Finanzas`, `500.001 en adelante Gerente de área`.

Los módulos futuros crearán tablas propias referenciando `company_id` y, cuando corresponda, `business_unit_id`; no reutilizarán tablas financieras para conceptos distintos.

## Evolución 2A.1 de aprobaciones

`approval_rules` y `approval_actions` quedan deprecadas. El modelo activo usa `approval_workflows`, `approval_workflow_conditions`, `approval_workflow_steps`, `payment_request_approval_instances`, `payment_request_approval_steps` y `payment_request_approval_decisions`. Configuración e instancias se mantienen separadas para congelar monto, roles, orden, obligatoriedad y políticas de cada solicitud.
