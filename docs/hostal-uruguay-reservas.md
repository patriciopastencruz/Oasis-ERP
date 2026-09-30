# Hostal Uruguay · Gestión de reservas

El módulo aparece al seleccionar **Hostal Uruguay** en el selector de unidad. Su pantalla principal es el calendario semanal y contiene solamente Calendario, Reservas, Llegadas, Salidas, Habitaciones, Sincronización iCal y Configuración.

## Puesta en marcha

1. Copie `.env.example` a `.env.local` y complete las claves de Supabase.
2. Defina `CRON_SECRET` con un valor largo y aleatorio.
3. Ejecute `pnpm exec supabase db reset` para aplicar migraciones y datos iniciales locales.
4. Asigne al usuario la unidad Hostal Uruguay y un rol con permisos `lodging.*`.
5. Inicie con `pnpm dev`.

La migración crea cinco habitaciones editables. No están codificadas en la interfaz: toda habitación activa nueva aparece automáticamente en el calendario.

## Booking y Airbnb

En **Sincronización iCal**, el administrador selecciona una habitación, proveedor y pega la URL HTTPS de importación. El sistema bloquea localhost, IP privadas y redes reservadas, valida redirecciones, limita tiempo/tamaño y prueba el archivo antes de guardarlo. Use el enlace Oasis de esa misma habitación como calendario para importar en Booking o Airbnb.

El botón **Actualizar calendarios** procesa todas las configuraciones activas. En Vercel, `vercel.json` ejecuta el mismo proceso cada 15 minutos con `Authorization: Bearer $CRON_SECRET`.

iCal sincroniza únicamente ocupación. Las tarifas, comisiones, promociones, políticas, mensajería y cambios comerciales originales siguen administrándose en Booking o Airbnb. Los calendarios Oasis exportan `SUMMARY:No disponible` y nunca datos personales.

## Operación

- **Nueva reserva:** seleccione habitación, fechas, huésped, tarifa y pago opcional. PostgreSQL impide superposiciones incluso ante solicitudes simultáneas.
- **Editar fechas:** abra una reserva desde el calendario y cambie entrada o salida. El sistema vuelve a validar la disponibilidad, recalcula noches y total, y registra la modificación en auditoría. Se permite también con la estadía en curso (check-in hecho); con check-out solo el administrador o superior; nunca en anuladas. Las fechas importadas por iCal se cambian en Booking/Airbnb.
- **Corregir precio:** en una reserva directa, **Corregir precio** permite cambiar tarifa por noche, descuento y recargo con motivo obligatorio. El total lo recalcula PostgreSQL (`update_lodging_reservation_price` y el trigger `guard_lodging_reservation_price`, que ignora cualquier total enviado por el navegador) y queda en `audit_logs` (`update_reservation_price`). Una reserva con check-out solo la corrige el administrador o superior; las de Booking/Airbnb se corrigen en **Completar información interna**.
- **Anular reserva:** si la reserva empieza **hoy o después**, recepción la anula de inmediato con motivo (**Anular reserva**). Si empezó en un **día anterior**, recepción usa **Solicitar anulación** con motivo; queda pendiente y avisa (notificación y correo) a quienes tienen `lodging.reservations.cancel_approve` (Administrador, Gerente general, Superadministrador). El aprobador la aprueba o rechaza (con motivo) desde la reserva; las pendientes se listan arriba en **Reservas** y en **Administración → Aprobaciones**. Quien ya puede aprobar anula de inmediato. La reserva no se borra: pasa a anulada con su motivo, se conservan los pagos (registrar reembolso si corresponde) y queda en `audit_logs` (`cancel_reservation`). No aplica a reservas con check-in o check-out ni a las de Booking/Airbnb, que se anulan en la plataforma. Tabla `lodging_reservation_cancellations`; funciones `lodging_reservation_cancel_request` y `lodging_reservation_cancel_decide`.
- **Extensión:** abra la reserva original y pulse **Extender estadía**. Se crea una nueva reserva directa vinculada desde la fecha de salida original.
- **Pagos:** abra una reserva, registre abonos/pagos/devoluciones y adjunte comprobantes PDF/JPG/PNG/WEBP de hasta 10 MB. Los archivos están en un bucket privado y se abren mediante URL firmada de cinco minutos.
- **Booking/Airbnb:** abra el registro importado para consultar y completar información interna. Las fechas originales se actualizan desde el canal, no desde Oasis.
- **Tarifas:** cada habitación tiene una tarifa base y, opcionalmente, **tarifas por cantidad de personas** (`lodging_rooms.rates_by_guests`, p. ej. `{"1":27000,"2":32000,"3":36000}`), que se editan en Habitaciones. Al crear una reserva la tarifa por noche se sugiere según la habitación y las personas (si no hay tarifa para esa cantidad se usa la del máximo definido; sin tarifas por personas, la base) y recepción puede ajustarla. No altera reservas existentes ni canales externos. Hostal Cobija se cargó con sus 15 habitaciones (C1–C8 mini deptos, HAB1–HAB7 simples) y sus tarifas por 1, 2 y 3 personas.
- **Check-in/out:** el check-in marca la habitación ocupada. El check-out exige saldo cero y la deja en limpieza.

## Solución de problemas

- Si una unidad no aparece, revise la asignación del usuario en Administración.
- Si iCal falla, confirme que la URL sea HTTPS pública y devuelva un `VCALENDAR` válido.
- Un evento desaparecido una vez se marca como ausente, pero no se cancela automáticamente. `STATUS:CANCELLED` sí se considera señal confiable.
- Los detalles técnicos quedan en `lodging_sync_logs` y requieren `lodging.audit.view`.
