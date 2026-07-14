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
- **Extensión:** abra la reserva original y pulse **Extender estadía**. Se crea una nueva reserva directa vinculada desde la fecha de salida original.
- **Pagos:** abra una reserva, registre abonos/pagos/devoluciones y adjunte comprobantes PDF/JPG/PNG/WEBP de hasta 10 MB. Los archivos están en un bucket privado y se abren mediante URL firmada de cinco minutos.
- **Booking/Airbnb:** abra el registro importado para consultar y completar información interna. Las fechas originales se actualizan desde el canal, no desde Oasis.
- **Tarifas:** cambie la tarifa base en Habitaciones. Solo se sugiere en futuras reservas directas; no altera reservas existentes ni canales externos.
- **Check-in/out:** el check-in marca la habitación ocupada. El check-out exige saldo cero y la deja en limpieza.

## Solución de problemas

- Si una unidad no aparece, revise la asignación del usuario en Administración.
- Si iCal falla, confirme que la URL sea HTTPS pública y devuelva un `VCALENDAR` válido.
- Un evento desaparecido una vez se marca como ausente, pero no se cancela automáticamente. `STATUS:CANCELLED` sí se considera señal confiable.
- Los detalles técnicos quedan en `lodging_sync_logs` y requieren `lodging.audit.view`.
