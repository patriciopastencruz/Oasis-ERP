# Supervisión de hostales: auditoría semanal (fase G)

El supervisor usa el mismo portal `/ops` (sin volver a iniciar sesión ni entrar al ERP) y ve todos los hostales que tiene asignados. **Recepción inspecciona el 100%; el supervisor audita por muestreo** para validar la calidad del aseo y de la inspección.

## Meta semanal (lunes a domingo, hora de Santiago)

`meta = máx(mínimo, ⌈limpiezas de la semana × %⌉)`, sin superar las habitaciones distintas limpiadas (no se puede auditar lo que no se limpió). Valores por hostal en `lodging_ops_settings`: `audit_sample_pct` (20% por defecto), `audit_min_per_week` (3).

Ejemplos: 20 limpiezas → 4; 12 → 3; 8 → 3; si solo se limpiaron 2 habitaciones → 2.

`cumplimiento = auditorías realizadas / meta × 100`. Semáforo configurable (`audit_ok_pct` 100, `audit_warning_pct` 80): 100% OK, 80–99% atención, <80% pendiente relevante. Las auditorías descartadas no cuentan.

## Realizar auditoría

*REALIZAR AUDITORÍA* elige la habitación **en ese momento** (`lodging_audit_draw`), sin revelar la muestra por adelantado. Una habitación es auditable si: tuvo una limpieza terminada en los últimos 7 días aprobada por recepción, está `inspected`, no tiene huésped (check-in o estadía importada en curso) y no fue auditada en la semana.

Selección ponderada por riesgo con componente aleatorio (Efraimidis–Spirakis: `-ln(random())/puntaje`). Puntaje = 1 + factores:

| Factor | Peso |
| --- | --- |
| Rechazo de recepción en 30 días | +2 |
| Última limpieza fue retrabajo | +1,5 |
| Incidencias en 60 días (máx. 3) | +1 c/u |
| Mantención o fuera de servicio en 30 días | +1,5 |
| Semanas sin auditoría (máx. 4; nunca auditada = 4) | +0,5 c/u |
| Tasa de rechazo reciente de quien limpió | +3 × tasa |
| Tasa de auditorías fallidas de quien inspeccionó | +3 × tasa |
| Check-in hoy o mañana | +0,5 |
| Reclamos recientes | preparado (sin fuente de datos aún) |

Con una auditoría abierta, el botón la retoma (no se puede volver a sortear). Si la habitación dejó de estar disponible (p. ej. llegó el huésped), *No puedo auditar esta habitación* la descarta con motivo y el sistema elige otra.

## Checklist y resultado

10 puntos (presentación, limpieza, cama y ropa de cama, baño, toallas/amenities, agua caliente, equipamiento, iluminación, olores, sin desperfectos) con **OK / Observación / Falla**.

- Sin fallas → **aprobada** (`passed`); las observaciones quedan registradas. No cambia el estado de la habitación.
- Con alguna falla → **fallida** (`failed`): observación obligatoria, **origen** (limpieza, inspección de recepción, problema técnico, problema nuevo posterior a la inspección), categoría, gravedad y acción: *nueva limpieza* (la habitación vuelve a aseo con tarea de origen `audit`), *incidencia de mantención* (`lodging_incidents`), *observación administrativa* o ninguna.

Se registra hostal, habitación, tarea de aseo, quién limpió, quién inspeccionó, supervisor, fecha, checklist, puntaje y factores de selección. Es control operacional: **no sanciona automáticamente**.

## Indicadores, alertas e histórico

- **Semana** (portada del supervisor y `/ops/audits`): meta, realizadas, pendientes, cumplimiento, aprobadas, fallidas, % conformidad, hallazgos (ítems con observación o falla), incidencias generadas y total multi-hostal.
- **Mes** (`/ops/audits?month=`): % aprobadas/fallidas, discrepancia recepción vs supervisor (aprobadas por recepción que fallaron por aseo o inspección), origen de las fallas, categorías (vs mes anterior), habitaciones con más fallas, reincidentes (2+ fallas en 60 días), retrabajos y % de rechazos de recepción.
- **Requiere atención** (calculado al abrir, una alerta por situación y hostal, sin notificaciones repetidas): hostal sin auditorías desde el miércoles, pendientes desde el viernes, auditorías fallidas, habitaciones reincidentes, 2+ fallas del mes con el mismo origen y categorías que se duplican.
- **Histórico por habitación** (`/ops/room/[id]`): limpiezas, inspecciones, auditorías e incidencias agrupadas por semana.

## Base de datos y seguridad

Tablas: `lodging_supervisor_audits` (índices únicos: una auditoría por habitación y semana, una abierta por supervisor y hostal) y `lodging_incidents` (base de la fase E). Funciones: `lodging_audit_draw`, `lodging_audit_skip`, `lodging_audit_submit`, `lodging_audit_week_summary`, `lodging_audit_month_kpis`, `lodging_audit_detail`, `lodging_room_history`.

Permisos: `lodging.audits.execute` (auditar), `lodging.audits.view` (ver), `lodging.operations.multi_unit`. Todas las funciones validan `auth.uid()`, unidad asignada y permiso; las tablas solo conceden `select` con RLS por unidad. Un supervisor no puede auditar ni ver hostales que no tiene asignados.

Prueba SQL: `supabase/tests/verify_lodging_audits.sql`.
