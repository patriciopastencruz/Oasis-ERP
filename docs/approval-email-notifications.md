# Correos de solicitudes de aprobación

## Alcance

OASIS ERP envía correo a los usuarios que reciben una asignación de aprobación
en los flujos vigentes:

- Solicitudes de pago y sus etapas secuenciales.
- Rendiciones de Caja Chica.
- Solicitudes de edición o desactivación de materiales de Inventario.
- Solicitudes de edición o anulación de pedidos de Distribuidora Altiplánica.

Los destinatarios se resuelven con los mismos roles, permisos y unidades de
negocio de las notificaciones internas. El correo no agrega ni reemplaza
permisos: el enlace vuelve a OASIS ERP, donde backend y RLS validan el acceso.

## Decisión técnica

La migración `20260714134220_approval_email_notifications.sql` incorpora
`approval_email_outbox`. Un trigger sobre `notifications` encola únicamente
eventos `*.approval_assigned` y `*.review_assigned`. Esto mantiene la auditoría,
evita duplicados por `notification_id` y desacopla la operación comercial del
proveedor de correo.

Después de confirmar cada solicitud, el servidor reclama trabajos de la cola
con bloqueo concurrente y los entrega mediante Resend. Cada envío usa una clave
de idempotencia derivada de la notificación. Un fallo de correo se registra con
número de intentos y siguiente fecha de reintento, pero no revierte la solicitud.

La tabla tiene RLS sin políticas para usuarios finales y solo `service_role`
puede leerla o actualizarla. La API key nunca se expone al navegador.

## Configuración

Variables de entorno requeridas en producción:

```dotenv
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL="OASIS ERP <notificaciones@correo.example.cl>"
NEXT_PUBLIC_APP_URL=https://oasis-erp.vercel.app
```

El dominio del remitente debe estar verificado en Resend mediante SPF y DKIM.
Si la configuración aún no existe, las solicitudes continúan operativas y los
correos permanecen pendientes en la cola.

## Operación

Estados de `approval_email_outbox`:

- `pending`: listo para envío.
- `sending`: reclamado por una ejecución.
- `sent`: aceptado por Resend, con `provider_message_id` y `sent_at`.
- `failed`: fallo registrado; se reintentará en una solicitud posterior hasta
  completar cinco intentos.

Las notificaciones internas siguen siendo la fuente funcional principal y
permanecen disponibles aunque el proveedor de correo falle.
