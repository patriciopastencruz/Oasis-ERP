# Dashboards por unidad de negocio

El Dashboard Ejecutivo usa la unidad seleccionada en la sesión y nunca mezcla indicadores operacionales entre unidades. La autorización se valida con `reports.executive_dashboard.view`; las consultas adicionales conservan los permisos y RLS propios de Distribuidora, Inventario y Reservas.

## Indicadores

- Todas las unidades: solicitudes, aprobaciones, pagos, pendientes, tendencia semestral y distribución por estado.
- `DA`: pedidos, entregas, pendientes y venta planificada del día.
- `OM`: materiales, existencias, valorización y salidas del día.
- `HOC`, `HOB` y `HU`: habitaciones, ocupación y disponibilidad del día.

Las unidades sin movimientos muestran valores cero o estados vacíos diseñados; no reutilizan datos de otra unidad.

## Identidad visual

La configuración central está en `src/config/business-units.ts` y los archivos se almacenan en `public/business-units`. El logo lateral y el encabezado del dashboard cambian con la unidad. Distribuidora Altiplánica usa el logo entregado por el usuario; los hostales usan emblemas de la familia visual OASIS y Oasis Modulares conserva el emblema corporativo de construcción modular.
