# Distribuidora Altiplánica

## Objetivo y ubicación

El módulo reemplaza la planilla operativa de hielo y agua y vive dentro de OASIS ERP como dominio principal independiente de **Finanzas**, para la unidad existente `DA`. Reutiliza Auth, perfiles, unidades, permisos, auditoría, notificaciones, Supabase SSR y el layout general. No crea autenticación, aplicación ni base paralela. Las claves técnicas `finance.distribution.*` se conservan por compatibilidad con los permisos ya migrados; no representan una dependencia visual ni funcional del menú Finanzas.

## Arquitectura

- UI: App Router en `src/app/(portal)/finance/distribution`; la ruta histórica se conserva por compatibilidad. Pedidos, rutas, clientes, catálogos, estado de pago, cobranzas, reportabilidad y solicitudes se presentan como accesos directos independientes en el menú lateral, sin un contenedor general ni una segunda barra de navegación dentro de las páginas.
- Casos de uso: Server Actions en `src/modules/finance/distribution/application`.
- Invariantes puras: `src/modules/finance/distribution/domain`.
- Persistencia: migración `20260714041525_altiplanica_distribution_module.sql` con RLS y funciones transaccionales.
- Exportaciones: Excel de cierre y PDF de estado de pago en rutas autenticadas bajo `src/app/api/finance/distribution`.

La base recalcula precios y totales. El navegador nunca decide el total, el cupo de crédito, las transiciones ni el saldo de un cobro.

## Modelo de datos

Los prefijos `dist_` aíslan el dominio sin duplicar entidades transversales. Las tablas principales son clientes y clasificaciones, productos y categorías, precios históricos, pedidos y líneas, historial de estados, solicitudes, entregas, pagos y aplicaciones, y cierres diarios. Todos los registros operativos incluyen empresa y unidad. Los pedidos y clientes usan secuencias atómicas; las operaciones sensibles se auditan mediante `audit_logs`.

No hay borrado físico de pedidos. Cancelación y anulación conservan trazabilidad. Los catálogos iniciales se cargan de forma idempotente y no incluyen clientes ficticios.

## Roles y permisos

- `general_manager`, `operations_manager` y `superadmin`: acceso integral.
- `administrator`: clientes, catálogos, pedidos, rutas, revisiones, cobros, cierres, reportes y auditoría.
- `administrative`: crea clientes y pedidos, asigna y ordena rutas, cobra, reporta y solicita cambios; un trigger impide editar datos comerciales guardados.
- `driver`: solo consulta y opera pedidos propios; puede iniciar ruta, entregar, informar no entrega y registrar cobros.

La navegación oculta opciones no autorizadas, las Server Actions vuelven a comprobar permisos y RLS aplica el alcance por unidad/chofer. Las funciones sensibles validan estado actual, fecha cerrada, crédito y propiedad.

## Estados y flujos

Pedido: `draft → scheduled → assigned → en_route → delivered | partially_delivered | not_delivered`; una no entrega puede pasar a `rescheduled`. Cancelaciones y anulaciones son terminales. El trigger de pedidos bloquea toda transición no declarada.

Pago: `pending`, `partial`, `paid`, `credit`, `overdue`, `voided`. Se calcula independientemente de la entrega y desde aplicaciones confirmadas.

El Administrativo crea una solicitud `edit` o `void` con snapshot previo. El Administrador aprueba o rechaza una sola vez; solo la aprobación aplica la mutación y deja snapshot final.

Un pedido admite edición (fecha, hora, dirección, notas, descuento, productos y cantidades) mientras no esté `delivered`, `partially_delivered`, `cancelled` ni `voided`. El Administrador (o rol con `finance.distribution.orders.manage`) edita directamente desde `/finance/distribution/orders/[id]`; el Administrativo solo puede solicitarlo desde la misma pantalla, con motivo obligatorio. `dist_update_order` recalcula precios, descuento y total en el servidor y reemplaza las líneas del pedido; la aprobación de una solicitud de edición usa la misma función. Anular un pedido ya editado no revierte cambios previos.

## Crédito, entrega y cierre

El precio se resuelve por vigencia: primero precio del cliente y luego estándar. La línea guarda precio, origen y registro aplicado. Antes de un crédito se valida autorización, vigencia, bloqueo y cupo. Los clientes ocasionales solo se admiten en ventas de ruta y nunca a crédito.

La entrega conserva cantidad planificada y permite cantidad real. El cierre usa `dist_daily_summary`, excluye anulados y calcula ventas, cobros, operación, kilos de hielo desde `ice_weight_kg` y unidades de agua. Al cerrar se persiste un snapshot auditable y las funciones normales rechazan cambios de esa fecha.

Un pedido `scheduled` o `assigned` admite anulación con motivo obligatorio; el Administrador anula directamente desde `/finance/distribution/orders/[id]` y el Administrativo solo puede solicitarla desde la misma pantalla (`dist_void_order` y `dist_request_order_change`/`dist_review_order_change`). El motivo ya no se pide en el listado principal de pedidos, solo al confirmar la anulación en el detalle. Un pedido en ruta, entregado, ya anulado o cancelado no admite una nueva anulación.

Cada producto de venta está vinculado a su materia prima de empaque (`dist_products.material_id`, sección de Inventario y Materiales). Al marcar un pedido como `delivered` o `partially_delivered`, `dist_change_order_status` descuenta automáticamente `planned_quantity × conversion_factor` del stock de esa materia prima y registra el movimiento en `inventory_movements` con referencia al número de pedido; el consumo queda marcado en `dist_orders.materials_consumed_at` para no aplicarse dos veces. El stock de materia prima puede quedar negativo: es la señal de que la compra no alcanzó a cubrir lo entregado y de que hay que anticipar la próxima compra. Anular un pedido ya entregado no revierte el consumo registrado. Las salidas manuales (`register_inventory_output`) siguen bloqueando saldo insuficiente porque son una decisión explícita del operador.

## PDF y Excel

`/api/finance/distribution/statement.pdf?customer=<uuid>` genera un Estado de Pago privado y autorizado. `/api/finance/distribution/reports.xlsx?date=YYYY-MM-DD` exporta el cierre. Ambos validan permiso de exportación y unidad antes de consultar datos.

## Ejecución y pruebas

```bash
pnpm exec supabase db reset --local --yes
docker exec -i supabase_db_oasis-erp psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/verify_altiplanica_distribution.sql
docker exec -i supabase_db_oasis-erp psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/verify_distribution_stock.sql
docker exec -i supabase_db_oasis-erp psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/verify_distribution_order_consumption.sql
docker exec -i supabase_db_oasis-erp psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/verify_distribution_order_editing.sql
docker exec -i supabase_db_oasis-erp psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/verify_distribution_order_void.sql
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Para desplegar, aplicar la migración mediante el flujo Supabase habitual del ERP y desplegar la misma revisión de Next.js. No se agregaron variables de entorno. Antes de operar, un Administrador debe definir precios estándar vigentes.
