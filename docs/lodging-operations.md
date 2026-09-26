# Portal operativo de hostales (`/ops`)

Un solo portal para la operación de los hostales (HU, HOC, HOB y los que se agreguen a `lodgingUnitCodes`). La misma URL se adapta al usuario: permisos, rol y unidades asignadas en `user_business_units`. Comparte Supabase Auth, base de datos, permisos, RLS, `audit_logs` y notificaciones con el ERP.

- **Aseo**: ve solo habitaciones por limpiar y su limpieza en curso (sin tarifas, pagos ni datos del huésped).
- **Recepción**: indicadores del día, habitaciones por inspeccionar e inspección 100%.
- **Administración / supervisión**: todo lo anterior más el estado de todas las habitaciones.

Si el usuario tiene un solo hostal entra directo; con varios ve un selector de un toque que recuerda la última unidad (cookie `oasis_ops_unit`, validada contra sus unidades asignadas).

## Estado operacional de la habitación

`lodging_rooms.operational_status` es independiente de la reserva:

```
check-out → dirty → cleaning → pending_inspection → inspected (disponible)
                                   │
                                   └─ rechazo → dirty (retrabajo)
maintenance / out_of_service → (al resolver) pending_inspection
```

- El check-out (`lodging_check_out`) valida saldo en la base de datos, deja la habitación en `dirty` y crea la tarea de aseo.
- El check-in (`lodging_check_in`) exige `inspected`. Sin inspección muestra "Esta habitación todavía no ha sido liberada por inspección"; quien tenga `lodging.checkin.override` puede forzarlo con motivo, registrado en `audit_logs` (`action = 'checkin_override'`, estado previo, motivo, reserva y habitación).
- Reservas sin check-out formal (Airbnb/Booking importadas o sin registrar): al pasar la hora de salida del hostal (`lodging_ops_settings.default_checkout_time`, 12:00 por defecto) `lodging_ops_sync_departures` deja la habitación en `dirty` (idempotente, se ejecuta al abrir el portal).
- Cambiar el estado general a mantención/fuera de servicio desde Habitaciones sincroniza el estado operacional; al volver a disponible queda `pending_inspection`, nunca disponible directo.

## Base de datos

| Objeto | Uso |
| --- | --- |
| `lodging_rooms.operational_status`, `operational_status_changed_at`, `rework` | Estado operacional y marca de retrabajo |
| `lodging_reservations.departure_processed_at` | Salida ya procesada (check-out o automática) |
| `lodging_ops_settings` | Por hostal: hora de check-in (14:00) y check-out (12:00) por defecto, % y mínimo de auditorías, frecuencia de auditoría general y umbrales de alerta |
| `lodging_housekeeping_tasks` | Ciclo de limpieza: origen, intento, quién y cuándo comenzó/terminó, duración y checklist. Índice único: una sola tarea abierta por habitación |
| `lodging_room_inspections` | Inspección de recepción: resultado, checklist, motivo de rechazo e inspector |
| `lodging_room_status_events` | Historial de cada cambio de estado (desde, hacia, origen, motivo, tarea, reserva, actor), generado por trigger |

Funciones (todas `security definer`, validan `auth.uid()`, unidad asignada y permiso, y bloquean la fila con `for update`): `lodging_housekeeping_start`, `lodging_housekeeping_finish`, `lodging_room_inspect`, `lodging_check_in`, `lodging_check_out`, `lodging_ops_sync_departures`, `lodging_ops_board` (tablero sin datos financieros ni del huésped).

Las tablas nuevas solo conceden `select` con RLS (`lodging_ops_can_view`: unidad asignada y algún permiso operativo); toda escritura pasa por las funciones.

## Permisos y roles

| Permiso | Aseo | Recepción | Supervisor de hostales | Gerencia general | Administración |
| --- | --- | --- | --- | --- | --- |
| `lodging.housekeeping.view` | ✓ | ✓ | ✓ | | ✓ |
| `lodging.housekeeping.execute` | ✓ | | | | ✓ |
| `lodging.rooms.inspect` | | ✓ | | | ✓ |
| `lodging.operations.view` | | ✓ | ✓ | ✓ | ✓ |
| `lodging.operations.multi_unit` | | | ✓ | ✓ | ✓ |
| `lodging.maintenance.view` | | ✓ | ✓ | ✓ | ✓ |
| `lodging.maintenance.manage` | | | | | ✓ |
| `lodging.audits.execute` | | | ✓ | | ✓ |
| `lodging.audits.view` | | | ✓ | ✓ | ✓ |
| `lodging.checkin.override` | | | | | ✓ |

Administración = roles Administrador y Superadministrador. Roles nuevos: `housekeeping` (Aseo) y `lodging_supervisor` (Supervisor de hostales). Todo se ajusta en Administración → Roles; el código decide por permiso, no por nombre de rol.

## Acceso

- Link para WhatsApp: `https://oasis-erp.cl/ops`. Sin sesión redirige a `/login?next=/ops` y vuelve al portal al iniciar sesión (solo rutas internas).
- PWA "Oasis Operaciones" (`/manifest.webmanifest`, abre `/ops` en pantalla completa): en el teléfono, *Agregar a pantalla de inicio*.
- Desactivar el usuario en Administración → Usuarios revoca el acceso (las funciones y RLS exigen perfil activo).

## Estado de las fases

- Entregadas: A (modelo, estados, permisos, RLS), B (portal, selector, PWA, login), C (aseo), D (inspección 100% y check-in/out transaccionales).
- Pendientes: E incidencias y mantención, F vista multi-hostal y "requiere atención", G auditorías del supervisor (`docs/lodging-supervision.md`), H KPIs e histórico, I notificaciones y pulido.

Prueba SQL: `supabase/tests/verify_lodging_operations.sql`.
