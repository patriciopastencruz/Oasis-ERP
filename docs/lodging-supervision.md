# Supervisión de hostales

Estado: **pendiente (fases F y G)**. La base ya está preparada: rol `lodging_supervisor` (Supervisor de hostales), permisos `lodging.operations.multi_unit`, `lodging.audits.execute` y `lodging.audits.view`, y parámetros por hostal en `lodging_ops_settings` (`audit_sample_pct` 15%, `audit_min_per_week` 3, `facility_audit_days` 7).

## Diseño acordado

- El supervisor usa el mismo `/ops` y cambia de hostal en un toque; verá por hostal el estado de la operación y las auditorías de la semana.
- **Recepción inspecciona el 100%; el supervisor audita por muestreo**: 15–20% de las habitaciones limpiadas en la semana (lunes a domingo), mínimo 3 por hostal, configurable.
- Muestreo mixto (aleatorio + riesgo): rechazos previos, reclamos, incidencias recurrentes, mantención reciente, habitaciones sin auditoría hace tiempo y tasas recientes de rechazo o auditorías fallidas. Uso operacional, no sancionatorio.
- La muestra no se revela por adelantado: al llegar al hostal, *REALIZAR AUDITORÍA* entrega una habitación elegida en ese momento.
- Checklist breve con resultado aprobado/fallido (observación obligatoria si falla), vinculado a quién limpió y quién inspeccionó.
- Auditoría general del establecimiento (semanal o quincenal) con ítems OK / observación / problema y foto opcional en Storage privado.

El histórico de estados (`lodging_room_status_events`), las limpiezas (`lodging_housekeeping_tasks`) y las inspecciones (`lodging_room_inspections`) ya se registran desde la fase A y alimentarán el muestreo por riesgo y los KPIs.
