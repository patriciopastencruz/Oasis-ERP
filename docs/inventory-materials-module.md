# Inventario y Materiales · Oasis Modulares

El módulo controla materiales de la unidad **Oasis Modulares** dentro del límite multiempresa existente. Incluye maestro con código automático `MAT-0001`, stock inicial, precios estándar/promedio/última compra e imagen privada.

## Operaciones

- Las facturas aceptan varios materiales, impiden duplicados por proveedor y número, guardan respaldo privado y actualizan stock/precios de forma transaccional.
- Las salidas distinguen consumo operacional y falla o pérdida. Nunca permiten stock negativo y exigen observación para fallas o pérdidas.
- Cada variación genera un movimiento inmutable con stock anterior y posterior.
- Las ediciones y desactivaciones generan solicitudes. Solo usuarios con `inventory.approvals.decide` pueden aprobarlas o rechazarlas.
- Los reportes de stock, facturas, salidas y movimientos se descargan en Excel y aceptan rango de fechas.

## Seguridad

Todas las tablas tienen RLS por empresa y unidad. Los adjuntos viven en buckets privados y se abren mediante enlaces firmados de corta duración. Las operaciones que modifican stock se ejecutan en funciones PostgreSQL transaccionales y verifican permiso, unidad y usuario autenticado.

## Puesta en marcha

Aplicar `202607120006_inventory_materials.sql` al proyecto Supabase. La migración registra permisos para Superadministrador, Gerente general, Gerente de área y Administrador. Los permisos también pueden ajustarse desde la administración de roles.

La primera versión excluye bodegas múltiples, fabricación, recetas, reservas, códigos de barras, costos por proyecto e integración contable.
