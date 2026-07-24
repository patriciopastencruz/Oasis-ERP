begin;

-- Artículos de conocimiento iniciales del Asistente ERP. Contenido basado
-- en el inventario funcional verificado (docs/inventario-funcional-erp.md),
-- por eso todos nacen con validation_status = 'verified'. Se insertan por
-- cada empresa existente, igual que el seed de assistant_settings.

insert into public.assistant_knowledge_articles
  (company_id, title, module_key, route_patterns, roles, permissions, keywords, content, steps, related_routes, related_modules, validation_status, active)
select c.id, v.title, v.module_key, v.route_patterns, '{}'::text[], v.permissions, v.keywords, v.content, v.steps, v.related_routes::jsonb, v.related_modules, 'verified', true
from public.companies c
cross join (values
(
  'Cómo crear y enviar una cotización',
  'sales_quotations',
  array['/sales/quotations*'],
  array['sales.quotations.create'],
  array['cotizacion','cotizaciones','presupuesto','cliente','enviar'],
  'En Cotizaciones puedes crear un borrador nuevo desde "/sales/quotations/new": completa la empresa cliente y agrega al menos un ítem con cantidad y precio. El sistema calcula automáticamente el IVA (19%) sobre el neto. El descuento no puede superar el subtotal. El correlativo (COT-año-secuencial) se asigna recién cuando envías la cotización a aprobación, no al guardar el borrador.',
  array['Ve a Cotizaciones > Nueva cotización','Completa los datos del cliente','Agrega al menos un ítem con cantidad y precio','Revisa el descuento y los términos','Guarda el borrador','Desde el detalle, presiona "Enviar a aprobación"'],
  '[{"label":"Nueva cotización","route":"/sales/quotations/new"}]',
  array['sales_quotations']
),
(
  'Aprobación de cotizaciones',
  'sales_quotations',
  array['/sales/quotations/approvals'],
  array['sales.quotations.approve'],
  array['cotizacion','aprobar','rechazar','pending'],
  'Las cotizaciones enviadas quedan en estado "pending" y aparecen en Cotizaciones > Aprobación. Quien aprueba debe escribir un comentario de resolución y elegir Aprobar o Rechazar. Si quien envía la cotización también tiene permiso de aprobación (por ejemplo un gerente), la cotización se aprueba automáticamente al enviarla, sin pasar por esta bandeja.',
  array['Ve a Cotizaciones > Aprobación','Revisa la cotización pendiente','Escribe un comentario','Presiona Aprobar o Rechazar'],
  '[{"label":"Aprobación de cotizaciones","route":"/sales/quotations/approvals","requiredPermission":"sales.quotations.approve"}]',
  array['sales_quotations']
),
(
  'Descargar PDF y marcar cotización como entregada',
  'sales_quotations',
  array['/sales/quotations/*'],
  array['sales.quotations.create'],
  array['cotizacion','pdf','entregada','descargar'],
  'El botón para descargar el PDF de una cotización solo aparece cuando el estado es "approved" o "delivered". Marcar una cotización como entregada solo lo puede hacer el creador y únicamente cuando el estado es "approved".',
  array[]::text[],
  '[]',
  array['sales_quotations']
),
(
  'Crear una rendición de Caja Chica',
  'petty_cash',
  array['/finance/petty-cash*'],
  array['finance.petty_cash.create'],
  array['caja chica','rendicion','gasto','comprobante','limite semanal'],
  'En Caja Chica > Nueva rendición puedes registrar los gastos de una semana (que debe iniciar en lunes). Cada gasto debe tener al menos un comprobante adjunto (PDF, JPG o PNG, máximo 10 MB). El total de la semana no puede superar el límite semanal vigente de tu unidad (100.000 CLP por defecto, configurable). Puedes guardar el borrador aunque se pase del límite, pero no podrás enviarlo hasta ajustarlo.',
  array['Ve a Caja Chica > Nueva rendición','Elige la semana (debe empezar en lunes)','Agrega cada gasto con su comprobante','Revisa el saldo disponible mostrado en pantalla','Guarda el borrador y luego envíalo'],
  '[{"label":"Nueva rendición","route":"/finance/petty-cash/new"},{"label":"Mis rendiciones","route":"/finance/petty-cash/my-reports"}]',
  array['petty_cash']
),
(
  'Revisar y aprobar una rendición de Caja Chica',
  'petty_cash',
  array['/finance/petty-cash/reviews/*'],
  array['finance.petty_cash.review'],
  array['caja chica','revisar','aprobar','rechazar','corregir'],
  'Solo se pueden decidir rendiciones en estado enviado, en revisión o reenviado. Rechazar o solicitar corrección exige un comentario obligatorio. Aprobar una rendición requiere el permiso finance.petty_cash.approve (revisar y comentar no son suficientes para aprobar).',
  array[]::text[],
  '[]',
  array['petty_cash']
),
(
  'Crear una solicitud de pago',
  'payment_control',
  array['/finance/payment-control/new','/finance/payment-control/requests*'],
  array['finance.payment_requests.create'],
  array['solicitud de pago','pago a proveedor','reembolso','anticipo'],
  'En Solicitud de Pagos > Nueva solicitud eliges tipo de solicitud, proveedor, monto y adjuntas respaldos (PDF/JPG/PNG, máximo 4 archivos de hasta 10 MB cada uno). Si eliges prioridad "programada", debes indicar la fecha de pago. Solo puedes editar tus propias solicitudes mientras estén en borrador o en corrección solicitada.',
  array['Ve a Solicitud de Pagos > Nueva solicitud','Elige tipo, proveedor y monto','Adjunta los respaldos requeridos','Guarda el borrador','Envíala a aprobación desde el detalle'],
  '[{"label":"Nueva solicitud de pago","route":"/finance/payment-control/new"},{"label":"Mis solicitudes","route":"/finance/payment-control/my-requests"}]',
  array['payment_control']
),
(
  'Aprobar una solicitud de pago',
  'payment_control',
  array['/finance/payment-control/approvals*'],
  array['finance.approvals.decide'],
  array['aprobar pago','rechazar pago','solicitud de pago'],
  'La bandeja de aprobaciones de pago muestra solo las etapas que puedes decidir según el flujo de aprobación configurado. Si la etapa lo exige, debes escribir un comentario o adjuntar un respaldo adicional para poder decidir.',
  array[]::text[],
  '[]',
  array['payment_control']
),
(
  'Ejecutar o anular un pago aprobado',
  'payment_control',
  array['/finance/payment-control/payments*'],
  array['finance.payments.view'],
  array['ejecutar pago','anular pago','comprobante de pago'],
  'Ejecutar un pago exige adjuntar el comprobante y requiere el permiso finance.payments.execute; el monto ejecutado debe coincidir exactamente con el monto aprobado. Anular una solicitud aprobada o programada requiere el permiso finance.payments.manage y un motivo de al menos 3 caracteres.',
  array[]::text[],
  '[]',
  array['payment_control']
),
(
  'Maestro de materiales y stock',
  'inventory',
  array['/inventory/materials*'],
  array['inventory.materials.view'],
  array['material','stock','inventario','codigo'],
  'Cada material creado recibe automáticamente un código correlativo (MAT-0001, MAT-0002...). Para editar o desactivar un material debes enviar una solicitud de cambio (solo puede haber una solicitud pendiente por material a la vez); un administrador con el permiso de aprobaciones de inventario debe decidirla.',
  array['Ve a Inventario > Maestro de materiales','Busca el material por código, nombre o categoría','Para modificarlo, entra a su ficha y solicita el cambio'],
  '[{"label":"Maestro de materiales","route":"/inventory/materials"},{"label":"Nuevo material","route":"/inventory/materials/new","requiredPermission":"inventory.materials.create"}]',
  array['inventory']
),
(
  'Ingresar una factura de compra de inventario',
  'inventory',
  array['/inventory/invoices*'],
  array['inventory.purchases.create'],
  array['factura','compra','proveedor','stock'],
  'Al registrar una factura de compra el stock del material aumenta y el precio promedio se recalcula automáticamente (costo promedio ponderado). No se puede registrar la misma factura dos veces para el mismo proveedor.',
  array[]::text[],
  '[]',
  array['inventory']
),
(
  'Registrar una salida de material',
  'inventory',
  array['/inventory/outputs*'],
  array['inventory.outputs.create'],
  array['salida','consumo','perdida','stock negativo'],
  'Una salida puede ser consumo operacional o pérdida/falla. Si es pérdida, debes indicar un motivo de al menos 3 caracteres. El sistema no permite registrar una salida que deje el stock del material en negativo.',
  array[]::text[],
  '[]',
  array['inventory']
),
(
  'Crear un pedido en Distribuidora Altiplánica',
  'distribution',
  array['/finance/distribution/orders*'],
  array['finance.distribution.orders.create'],
  array['pedido','distribuidora','cliente','credito'],
  'Un pedido planificado siempre requiere un cliente registrado (no admite cliente ocasional). Si el pago es a crédito, el cliente debe tener crédito habilitado, estado de crédito vigente y sin bloqueo comercial. El pedido se rechaza si excede el límite de crédito del cliente, salvo que quien lo cree tenga el permiso de gestión de pedidos.',
  array['Ve a Distribuidora > Nuevo pedido','Elige el cliente y la fecha de entrega','Agrega los productos y cantidades','Elige método y condición de pago','Confirma el pedido'],
  '[{"label":"Nuevo pedido","route":"/finance/distribution/orders/new"}]',
  array['distribution']
),
(
  'Registrar un cobro en Distribuidora',
  'distribution',
  array['/finance/distribution/payments'],
  array['finance.distribution.view'],
  array['cobro','pago cliente','distribuidora'],
  'Un cobro no puede superar la deuda pendiente del pedido (no se permite sobrepago). Si el usuario tiene rol de chofer, solo puede registrar cobros de los pedidos que tiene asignados.',
  array[]::text[],
  '[]',
  array['distribution']
),
(
  'Stock de materia prima en Distribuidora',
  'distribution',
  array['/finance/distribution/stock'],
  array['finance.distribution.stock.view'],
  array['materia prima','stock','factura','salida','distribuidora'],
  'El stock de materia prima se gestiona con facturas de compra (que aumentan stock) y salidas de consumo operacional o pérdida. Para registrar cualquiera de las dos operaciones necesitas el permiso finance.distribution.stock.manage.',
  array[]::text[],
  '[]',
  array['distribution']
),
(
  'Check-in, check-out y pagos de una reserva',
  'lodging',
  array['/lodging/reservations/*'],
  array['lodging.reservations.view'],
  array['reserva','check-in','check-out','pago','hospedaje','hostal'],
  'El check-in solo está disponible cuando la reserva está confirmada; el check-out solo cuando ya se hizo el check-in. Las reservas importadas desde Booking o Airbnb no se pueden editar en el ERP salvo un formulario de "información interna" que no se sincroniza al canal de origen. Anular un pago requiere motivo y el permiso lodging.payments.void.',
  array[]::text[],
  '[]',
  array['lodging']
),
(
  'Bandeja de aprobaciones de Administración General',
  'administration',
  array['/admin/approvals'],
  array['administration.approvals.view'],
  array['aprobaciones','administracion general','pendientes'],
  'Administración General reúne en una sola bandeja las aprobaciones pendientes de Cotizaciones, Solicitud de Pagos, Caja Chica, Inventario y Distribuidora. Cotizaciones, Inventario y Distribuidora se pueden aprobar o rechazar directamente desde ahí; Solicitud de Pagos y Caja Chica llevan a su propia pantalla de revisión por ser más complejas.',
  array[]::text[],
  '[{"label":"Bandeja de aprobaciones","route":"/admin/approvals"}]',
  array['administration']
),
(
  'Gestión de usuarios y roles',
  'administration',
  array['/admin/users','/admin/roles'],
  array['administration.users.manage','administration.roles.manage'],
  array['usuario','rol','permiso','crear usuario'],
  'Al crear un usuario debes asignarle al menos una unidad de negocio, y cada unidad elegida debe pertenecer a una de las empresas asignadas al usuario. No se puede desactivar al único superadministrador activo. No se puede desactivar un rol si todavía hay usuarios activos con ese rol asignado.',
  array[]::text[],
  '[{"label":"Usuarios","route":"/admin/users","requiredPermission":"administration.users.manage"},{"label":"Roles y permisos","route":"/admin/roles","requiredPermission":"administration.roles.manage"}]',
  array['administration']
),
(
  'Configurar flujos de aprobación',
  'administration',
  array['/admin/workflows'],
  array['administration.approval_rules.manage'],
  array['flujo de aprobacion','workflow','etapas'],
  'Un flujo de aprobación define etapas ordenadas, cada una con un rol requerido. Dos flujos activos de la misma unidad no pueden solaparse en tipo de solicitud, prioridad y rango de monto. Los cambios a un flujo solo aplican a solicitudes futuras: las que ya están en curso quedan con el flujo que tenían al momento de enviarse.',
  array[]::text[],
  '[]',
  array['administration']
),
(
  'Alta de proveedor y cuenta bancaria',
  'suppliers',
  array['/suppliers*'],
  array['finance.suppliers.manage'],
  array['proveedor','cuenta bancaria','rut'],
  'El RUT del proveedor debe ser único por empresa. Cada proveedor tiene una única cuenta bancaria, y el banco debe elegirse de la lista de bancos chilenos disponibles.',
  array[]::text[],
  '[]',
  array['suppliers']
),
(
  'KPIs del Panel ejecutivo',
  'dashboard',
  array['/dashboard'],
  array['reports.executive_dashboard.view'],
  array['dashboard','kpi','panel ejecutivo','indicadores'],
  'El Panel ejecutivo siempre muestra KPIs financieros del mes (solicitado, aprobado, pagado, pendiente) y una sección operativa que cambia según el código de tu unidad de negocio: Distribuidora ve pedidos y ventas del día, unidades de Inventario ven stock y salidas, y unidades de hospedaje ven ocupación. Si no tienes el permiso operativo de tu unidad, esa sección simplemente no aparece.',
  array[]::text[],
  '[{"label":"Panel ejecutivo","route":"/dashboard"}]',
  array['dashboard']
)
) as v(title, module_key, route_patterns, permissions, keywords, content, steps, related_routes, related_modules);

commit;
