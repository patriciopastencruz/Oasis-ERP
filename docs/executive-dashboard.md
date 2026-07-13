# Preparación del Dashboard Ejecutivo

No se implementó interfaz. La subetapa 2A.1 entrega contratos de lectura agregados y sujetos a RLS.

## Contratos

- `dashboard_payment_facts`: vista mínima `security_invoker` sobre solicitudes y pagos.
- `executive_payment_summary`: KPIs generales con rango y contexto opcional.
- `payment_status_summary`: cantidades y montos por estado, empresa y unidad.
- `monthly_payment_trend`: tendencia mensual solicitada, aprobada y pagada.
- `approval_performance_summary`: tiempos y tasas por empresa/unidad.
- `payment_dimension_summary`: empresa, unidad, categoría, centro de costo o proveedor.
- `upcoming_payments`: pagos programados desde hoy hasta N días.
- `overdue_payments`: pagos programados cuya fecha ya venció.

## Contexto empresa → unidad

Cada función acepta `filter_company` y/o `filter_unit`. Un filtro nulo consolida únicamente filas visibles por RLS; no significa acceso global. El selector futuro deberá alimentarse desde `user_companies` y `user_business_units`.

## Seguridad

La vista usa `security_invoker`, por lo que conserva RLS de `payment_requests` y `payments`. Las funciones son `security invoker` por defecto, no usan service role y solo se conceden a `authenticated`. Los datos retornados son agregados o campos mínimos de agenda de pagos.

## Fechas

Toda agrupación y comparación de calendario usa `America/Santiago`. Los timestamps continúan almacenados como `timestamptz`. Las solicitudes anuladas se excluyen de gasto y tasas; las rechazadas se incluyen solo en métricas explícitas de rechazo.

## Rendimiento

No se almacenan KPI derivados. Se agregaron índices sobre empresa, unidad, fechas, estado y prioridad. Si el volumen futuro justifica materialización, deberá medirse y diseñarse con refresco y aislamiento explícitos, no introducirse prematuramente.
