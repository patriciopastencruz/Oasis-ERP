# Hostal Uruguay · Gestión de reservas

El módulo aparece al seleccionar **Hostal Uruguay** en el selector de unidad. Su pantalla principal es el calendario semanal y contiene Calendario, Reservas, Llegadas, Salidas, Habitaciones y Configuración (la antigua pantalla de Sincronización iCal ya no se usa; ver más abajo). Hay además módulos propios de Gastos (solo HU), cierres diario y mensual, aseo/inspección y Lucía; el panorama general está en `docs/estado-del-proyecto-para-agentes.md`.

## Puesta en marcha

1. Copie `.env.example` a `.env.local` y complete las claves de Supabase.
2. Defina `CRON_SECRET` con un valor largo y aleatorio.
3. Ejecute `pnpm exec supabase db reset` para aplicar migraciones y datos iniciales locales.
4. Asigne al usuario la unidad Hostal Uruguay y un rol con permisos `lodging.*`.
5. Inicie con `pnpm dev`.

La migración crea cinco habitaciones editables. No están codificadas en la interfaz: toda habitación activa nueva aparece automáticamente en el calendario.

## Booking y Airbnb

> **Desde el 2026-10-19 el calendario se maneja a mano en el ERP.** La importación por iCal está desactivada: migración `20261019170000_lodging_disable_ota_calendar_sync.sql` dejó las conexiones inactivas y cerró los enlaces de exportación (`export_enabled=false`), se eliminó el cron de sincronización y `/lodging/ical` redirige al calendario. No se borró nada: las reservas ya importadas siguen como reservas normales. El código de sincronización (`synchronizeUnit`) permanece en `actions.ts` sin uso, por si se retoma.

Las reservas de Booking y Airbnb se registran manualmente (origen Booking/Airbnb) o permanecen las que ya se habían importado. Una reserva manual puede solaparse con una importada en la misma habitación (el calendario las muestra en carriles separados); dos manuales o dos importadas siguen chocando.

Si se reactivara iCal, tener presente:

- La reconciliación que cancela un evento "ausente dos veces" solo debe mirar estadías cuyo `ends_on` es **hoy o después**. Booking/Airbnb dejan de listar estadías terminadas (no las marcan `CANCELLED`); reconciliar contra todo el historial las cancelaba solas y desaparecían del calendario. Ya está acotado así en `synchronizeUnit`.
- Una misma `UID` puede aparecer en el feed de varias habitaciones que comparten "tipo de habitación" en la plataforma; el sync la registraba como reserva en cada una (duplicadas). No hay deduplicación todavía.
- iCal solo trae ocupación y nunca datos del huésped ni precio: por eso las importadas llegan con nombre genérico ("Reserva Booking — información pendiente") y total $0 hasta completar la información interna.

## Calendario

Muestra 10 días desde ayer, con navegación por semanas y filtros por habitación y origen. En cada reserva:

- **Punto verde/rojo** en la esquina inferior derecha: verde cuando ya están el **nombre real** del huésped y un **precio mayor a $0**; rojo si falta alguno. Se calcula con los datos reales (`hasCompleteInfo` en `weekly-calendar.tsx`); no depende de `information_complete`, que solo es `false` para importadas y `true` por defecto en las demás.
- **Ícono de persona o de grupo** según `guest_count` (1 o más) y **ícono de ingreso** cuando el huésped ya hizo check-in (`status = checked_in`).
- **Ícono de dinero** cuando el pago tiene un comprobante cargado, y un recuadro con los datos de la reserva al pasar el mouse.
- **Reasignar habitación arrastrando**: arrastre la reserva a la fila de otra habitación. Requiere `lodging.reservations.manage`; no se pueden mover reservas anuladas ni con check-out. Se valida en servidor (`reassignReservationRoomAction`) que la habitación sea de la misma unidad y que no choque en fechas; si choca, aparece "La habitación ya está reservada en esas fechas." y la reserva vuelve a su lugar. Útil cuando la plataforma asigna una pieza distinta a la registrada.

## Operación

- **Nueva reserva:** seleccione habitación, fechas, huésped, tarifa y pago opcional. PostgreSQL impide superposiciones incluso ante solicitudes simultáneas.
- **Editar fechas:** abra una reserva desde el calendario y cambie entrada o salida. El sistema vuelve a validar la disponibilidad, recalcula noches y total, y registra la modificación en auditoría. Se permite también con la estadía en curso (check-in hecho); con check-out solo el administrador o superior; nunca en anuladas. Las fechas importadas por iCal se cambian en Booking/Airbnb.
- **Corregir precio:** en una reserva directa, **Corregir precio** permite cambiar tarifa por noche, descuento y recargo con motivo obligatorio. El total lo recalcula PostgreSQL (`update_lodging_reservation_price` y el trigger `guard_lodging_reservation_price`, que ignora cualquier total enviado por el navegador) y queda en `audit_logs` (`update_reservation_price`). Una reserva con check-out solo la corrige el administrador o superior; las de Booking/Airbnb se corrigen en **Completar información interna**.
- **Anular reserva:** si la reserva empieza **hoy o después**, recepción la anula de inmediato con motivo (**Anular reserva**). Si empezó en un **día anterior**, recepción usa **Solicitar anulación** con motivo; queda pendiente y avisa (notificación y correo) a quienes tienen `lodging.reservations.cancel_approve` (Administrador, Gerente general, Superadministrador). El aprobador la aprueba o rechaza (con motivo) desde la reserva; las pendientes se listan arriba en **Reservas** y en **Administración → Aprobaciones**. Quien ya puede aprobar anula de inmediato. La reserva no se borra: pasa a anulada con su motivo, se conservan los pagos (registrar reembolso si corresponde) y queda en `audit_logs` (`cancel_reservation`). No aplica a reservas con check-in o check-out ni a las de Booking/Airbnb, que se anulan en la plataforma. Tabla `lodging_reservation_cancellations`; funciones `lodging_reservation_cancel_request` y `lodging_reservation_cancel_decide`.
- **Extensión:** abra la reserva original y pulse **Extender estadía**. Se crea una nueva reserva directa vinculada desde la fecha de salida original.
- **Pagos:** abra una reserva, registre abonos/pagos/devoluciones y adjunte comprobantes PDF/JPG/PNG/WEBP de hasta 10 MB. Los archivos están en un bucket privado y se abren mediante URL firmada de cinco minutos. Un pago mayor al saldo exige una observación de al menos 3 caracteres; si la reserva tiene precio $0 el saldo es $0 y cualquier pago "supera el saldo", por eso conviene cargar el precio antes. Un comprobante subido por error se puede **quitar** (borrado lógico auditado, `remove_lodging_payment_receipt`, permiso `lodging.payments.manage`); **anular un pago** requiere `lodging.payments.void` (Administrador y Superadministrador).
- **Saldos pendientes:** en Reportabilidad, la pestaña Saldos pendientes reúne todas las reservas con deuda, identifica vencidas, alojadas y próximas, y muestra cliente, contacto, fechas, total, pagado y saldo con acceso a la reserva.
- **Historial de reservas:** en Reportabilidad, permite revisar por mes huésped, habitación, estadía, tarifa, descuentos, recargos, total calculado, total registrado y pagos. Marca automáticamente reservas sin precio, con solo total informado o con diferencias de cálculo.
- **Booking/Airbnb:** abra el registro para consultar y completar la **información interna**. La primera vez que se completa una reserva importada, nº de huéspedes, valor total, comisión y teléfono salen **vacíos** (sin 1 ni 0 precargados) y el nombre sugiere "Reserva Booking" o "Reserva Airbnb"; al editar de nuevo se muestran los datos guardados. **Guarde primero esta información (en especial el precio) y recién después registre pagos o adjunte comprobantes.**
- **Tarifas:** cada habitación tiene una tarifa base y, opcionalmente, **tarifas por cantidad de personas** (`lodging_rooms.rates_by_guests`, p. ej. `{"1":27000,"2":32000,"3":36000}`), que se editan en Habitaciones. Al crear una reserva la tarifa por noche se sugiere según la habitación y las personas (si no hay tarifa para esa cantidad se usa la del máximo definido; sin tarifas por personas, la base) y recepción puede ajustarla. No altera reservas existentes ni canales externos. Hostal Cobija se cargó con sus 15 habitaciones (C1–C8 mini deptos, HAB1–HAB7 simples) y sus tarifas por 1, 2 y 3 personas.
- **Check-in/out:** el check-in marca la habitación ocupada. El check-out exige saldo cero y la deja en limpieza.

## Solución de problemas

- Si una unidad no aparece, revise la asignación del usuario en Administración.
- La sincronización iCal está desactivada (ver Booking y Airbnb). El historial técnico de ejecuciones anteriores sigue en `lodging_sync_logs` y requiere `lodging.audit.view`.
- Si "no deja registrar un pago" con el mensaje "Un pago superior al saldo requiere una observación", revise si la reserva tiene precio cargado: con total $0 el saldo es $0. Guarde la información interna y reintente.
