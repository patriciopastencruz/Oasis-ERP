# Etapa 4C — Programación y ejecución de pagos

Las rutas `/finance/payment-control/payments`, `/scheduled`, `/paid` y `/payments/[id]` permiten gestionar solicitudes aprobadas. `schedule_payment` y `execute_payment` son las únicas operaciones de cambio de estado: bloquean filas, validan permisos y son idempotentes.

La ejecución exige un comprobante privado en `payment-receipts`, monto igual al aprobado y referencia para medios distintos de efectivo o Caja Chica. RLS limita empresa y unidad. Los triggers existentes registran auditoría y notifican al solicitante.

Permisos separados: `finance.payments.view`, `finance.payments.schedule` y `finance.payments.execute`. No se implementan pagos parciales, integración bancaria, conciliación automática ni Caja Chica.
