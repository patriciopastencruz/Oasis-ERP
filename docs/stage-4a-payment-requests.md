# Etapa 4A — Solicitudes de pago

Gestión de Pagos implementa registro, borradores, respaldos privados, previsualización del workflow, envío, listado y detalle. Las rutas son `/finance/payment-control`, `/new`, `/my-requests` y `/requests/[id]`.

La seguridad se basa en sesión SSR, permisos, contexto de empresa/unidad y RLS. Las Server Actions vuelven a validar el contexto. PostgreSQL es la fuente de verdad para seleccionar y congelar workflows mediante `preview_payment_request_workflow` y `submit_payment_request`.

Los archivos se guardan en el bucket privado `payment-request-attachments`, con rutas `{company_id}/{payment_request_id}/{uuid}.{extension}`. La eliminación primero autoriza y marca `deleted_at`, y después borra el objeto de Storage.

Permisos principales: `finance.payment_requests.create`, `view_own`, `view_unit`, `view_company`, `finance.suppliers.view` y, para alta rápida, `finance.suppliers.manage`.

No forman parte de esta etapa las decisiones de aprobación, programación o ejecución de pagos ni Caja Chica.
