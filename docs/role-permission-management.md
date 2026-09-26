# Roles y permisos

Permiso requerido: `administration.roles.manage`.

Las keys son estables y únicas. Los roles base no pueden cambiar de key. Se pueden crear roles, asignar permisos, duplicar y activar/desactivar. Un rol con usuarios activos no puede desactivarse hasta reasignarlos.

Las modificaciones se ejecutan en servidor y la auditoría conserva actor y valores relevantes.


## Roles operativos de hostales

- **Aseo** (`housekeeping`): `lodging.housekeeping.view` y `lodging.housekeeping.execute`. Entra directo al portal `/ops`; no tiene acceso al ERP ni a información financiera.
- **Supervisor de hostales** (`lodging_supervisor`): operación multi-hostal y auditorías (`lodging.operations.view`, `lodging.operations.multi_unit`, `lodging.audits.*`, `lodging.maintenance.view`).
- Recepción suma `lodging.rooms.inspect`, `lodging.operations.view`, `lodging.housekeeping.view` y `lodging.maintenance.view`.
- Solo administración tiene `lodging.checkin.override` (check-in sin inspección, con motivo auditado).

Detalle completo en `docs/lodging-operations.md`.
