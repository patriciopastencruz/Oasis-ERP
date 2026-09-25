# Flujo de caja por unidad de negocio

Finanzas → **Flujo de caja** permite a cada unidad de negocio (HOC, HOB, HU, OM, DA) registrar a diario sus ingresos y gastos, cerrar el día y consultar la caja mensual. La unidad es la seleccionada en la barra lateral.

## Pantallas

| Ruta | Uso |
| --- | --- |
| `/finance/cash-flow?date=AAAA-MM-DD` | Cierre diario: registro de ingresos y gastos, resumen por medio de pago y cierre del día. |
| `/finance/cash-flow/monthly?month=AAAA-MM` | Caja mensual: ingresos, gastos, utilidad, margen, detalle diario con acumulado, categorías y medios de pago. |
| `/finance/cash-flow/categories` | Alta y desactivación de categorías de la unidad. |
| `/api/finance/cash-flow/monthly.xlsx?month=AAAA-MM` | Exportación Excel (resumen, diario y movimientos). |

## Reglas

- Montos enteros en CLP, fecha en `America/Santiago`; no se aceptan fechas futuras.
- Los movimientos no se eliminan: se **anulan** con motivo y quedan en `audit_logs`.
- El **cierre** lo calcula `cash_flow_close_day` desde los movimientos vigentes. Registra además el arqueo: efectivo esperado = fondo inicial + ingresos en efectivo − gastos en efectivo; si se informa el efectivo contado, guarda la diferencia. El fondo inicial se sugiere desde el efectivo contado del último cierre.
- Un día cerrado no admite registrar ni anular movimientos. Reabrirlo exige `finance.cash_flow.manage` y un motivo; al volver a cerrarlo se recalculan los totales.
- Cada unidad recibe categorías base al crearse (trigger en `business_units`).

## Permisos

| Permiso | Roles iniciales |
| --- | --- |
| `finance.cash_flow.view` / `finance.cash_flow.record` | superadmin, general_manager, area_manager, finance_manager, administrator, operations_manager, administrative, receptionist |
| `finance.cash_flow.manage` | superadmin, general_manager, finance_manager |

Se ajustan desde Administración → Roles. Las tablas `cash_flow_categories`, `cash_flow_entries` y `cash_flow_daily_closings` solo conceden `select` (RLS por unidad); toda escritura pasa por funciones PostgreSQL que validan permiso y acceso a la unidad.

Prueba SQL: `supabase/tests/verify_cash_flow_daily_closing.sql`.
