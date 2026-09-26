# Cierre mensual gerencial de hostales (HU / HOC / HOB)

Gestión de reservas → **Cierre mensual** (`/lodging/monthly?month=AAAA-MM`) arma el estado de resultados de cada hostal y el informe ejecutivo del mes. Hay un cierre por unidad y por mes.

## De dónde sale cada cifra

| Partida | Origen |
| --- | --- |
| Venta hospedaje | **Automático**: pagos confirmados con fecha de pago en el mes (hora de Santiago), descontando reembolsos. |
| Comisiones plataformas | **Automático**: `commission` de las reservas no canceladas con llegada en el mes. |
| Gastos diarios | **Automático**: gastos de los cierres diarios **emitidos** del mes, agrupados por su categoría. |
| Resto de ingresos, costos fijos, variables, inversión, retiros y otros | **Manual**: líneas con categoría, descripción, monto, pagado por y estado (pagado / pendiente). |

Utilidad = ingresos − costos fijos − costos variables − inversión − retiros − otros gastos. Los totales los calcula `lodging_monthly_summary_internal` en PostgreSQL.

## Flujo

1. **Iniciar cierre**: crea el borrador del mes y copia las líneas de **costos fijos** del último mes como plantilla, marcadas como pendientes.
2. Administración agrega, edita, quita o marca como pagadas las líneas mientras el mes está en preparación.
3. **Cerrar mes**: guarda una foto del estado de resultados (`snapshot`) y los totales; desde ahí el informe no cambia aunque lleguen pagos o gastos.
4. **Reabrir** (con motivo): vuelve a preparación y los totales se recalculan en vivo.

## Categorías

`/lodging/monthly/categories` administra la estructura por hostal (sección + nombre). Las marcadas como **gasto diario** aparecen en el selector de categoría del cierre diario; recepción debe elegir una categoría para cada gasto. Los gastos diarios anteriores a esta versión quedan como "Gastos diarios sin categoría" (costo variable).

## Informe PDF (`/api/lodging/monthly/report.pdf?month=AAAA-MM`)

1. Resumen ejecutivo: KPIs financieros y operacionales (ocupación, ADR, RevPAR, costo por noche, punto de equilibrio), conclusiones automáticas, cascada de ingresos a utilidad y estructura de costos.
2. Ocupación: ingreso cobrado acumulado vs mes anterior, calendario de ocupación, ocupación por día de la semana y semana a semana.
3. Habitaciones: ocupación y venta por tipo, medios de pago, ocupación e ingreso por habitación, rentabilidad por noche y punto de equilibrio.
4. Estado de resultados detallado con origen de cada partida y control del cierre.

La operación (ocupación, venta por noche y por habitación) se calcula desde las reservas: la venta de una estadía se reparte por noche (`total / noches`).

## Permisos

| Permiso | Roles iniciales |
| --- | --- |
| `lodging.monthly_closing.view` | administrator, superadmin, general_manager, finance_manager |
| `lodging.monthly_closing.manage` | administrator, superadmin |

Flujo de caja (Finanzas) no se muestra en los hostales; sus rutas redirigen al cierre mensual.

Pruebas SQL: `supabase/tests/verify_lodging_monthly_closing.sql` y `verify_lodging_daily_closing.sql`.
