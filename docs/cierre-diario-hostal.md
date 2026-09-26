# Cierre diario de hostales (HOC / HU)

Gestión de reservas → **Cierre diario** genera el reporte de cierre del día a partir de las reservas y los pagos registrados en el ERP. Recepción solo agrega los **gastos** y las **observaciones**.

## Flujo

1. `/lodging/closing?date=AAAA-MM-DD`: los indicadores se calculan solos. Recepción agrega los gastos del día, los problemas reportados, los elementos que deben reponerse y las observaciones generales, y presiona **Guardar y previsualizar** (el cierre queda en borrador).
2. `/lodging/closing/[id]`: vista previa con el mismo formato del PDF. **Generar PDF y enviar** emite el cierre, recalcula los indicadores con los pagos vigentes y envía el PDF por correo a los usuarios activos con rol Administrador o Superadministrador.
3. Una vez emitido, **Compartir por WhatsApp** abre el menú de compartir del teléfono con el PDF adjunto. En computador descarga el PDF y abre WhatsApp con un resumen del cierre. También está **Descargar PDF** y **Reenviar correo**.

Recepción puede cerrar hoy o, como máximo, el día anterior, y no puede modificar un cierre emitido. Administración (`lodging.closings.manage`) puede cerrar fechas anteriores y corregir un cierre emitido: al corregirlo vuelve a borrador y debe emitirse de nuevo.

## Indicadores (función `lodging_closing_metrics_internal`)

| Indicador | Cálculo |
| --- | --- |
| Total habitaciones | Habitaciones activas que no están en mantención ni fuera de servicio. |
| Habitaciones ocupadas / disponibles, % ocupación | Habitaciones con una estadía no cancelada que cubre la noche de la fecha (`check_in ≤ fecha < check_out`). No cuenta los bloqueos de mantención. |
| Venta promedio por tipo y general | Venta por noche (`total_value / noches`) dividida por las habitaciones ocupadas. El tipo se define en **Habitaciones → Tipo de habitación**. |
| Monto efectivo, transferencia, tarjeta, Airbnb (y Booking, empresa u otro si existen) | Pagos confirmados con `paid_at` en esa fecha (hora de Santiago). Los reembolsos se restan. Refleja lo que ingresó ese día. |
| Monto pendiente | Saldo (`total − pagos confirmados`) de las estadías en curso o que salen ese día. |
| Gasto total | Suma de los gastos manuales del cierre. |
| Adicionales | Resultado del día (ingreso − gasto), huéspedes alojados, llegadas y salidas, reservas sin precio, detalle de ingresos, detalle de saldos pendientes y detalle de gastos. |

Cada cierre guarda una copia de sus indicadores (`metrics`) y sus totales en columnas, para que los reportes históricos no cambien.

## Reportes

`/lodging/closing/reports?period=week|fortnight|month&date=AAAA-MM-DD` (permiso `lodging.closings.reports`) consolida los cierres **emitidos** de la semana (lunes a domingo), la quincena (1–15 / 16–fin de mes) o el mes. Muestra el ingreso efectivo por medio de pago, el gasto acumulado, el resultado, la ocupación promedio (ponderada por habitaciones-noche), la disponibilidad promedio, la venta promedio y los días sin cierre. El PDF del período se descarga en `/api/lodging/closing/period.pdf`.

## Permisos

| Permiso | Roles iniciales |
| --- | --- |
| `lodging.closings.create` | receptionist, administrator, superadmin |
| `lodging.closings.reports` | administrator, superadmin, general_manager, finance_manager |
| `lodging.closings.manage` | administrator, superadmin |

El correo usa `RESEND_API_KEY` y `RESEND_FROM_EMAIL`, las mismas variables que las notificaciones de aprobación. Prueba SQL: `supabase/tests/verify_lodging_daily_closing.sql`.
