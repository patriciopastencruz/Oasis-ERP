# Arquitectura de OASIS ERP

## Solicitud de Pagos

La capa de aplicación usa Server Actions con el cliente SSR autenticado. RLS conserva la barrera principal. La migración 007 expone operaciones transaccionales para previsualización, borrado lógico de respaldos y envío idempotente; la selección de workflows permanece exclusivamente en PostgreSQL. Storage utiliza buckets privados y URLs firmadas.

Las migraciones posteriores incorporan decisiones, notificaciones encadenadas, programación y ejecución idempotentes, cuenta bancaria 1:1, snapshot bancario y permisos de reportes. Ninguna operación normal usa `service_role`.

## Objetivo

OASIS ERP es una aplicación modular de organización única. Finanzas → Solicitud de Pagos es el primer módulo, no el límite del producto. La arquitectura separa capacidades para que nuevos dominios se agreguen sin reescribir autenticación, autorización, auditoría o navegación.

## Contexto organizacional

La interfaz expone únicamente `Unidades de negocio`. El registro base de organización y su `company_id` se conservan internamente como límite técnico de integridad, RLS y auditoría, pero no son administrables ni seleccionables. El crecimiento organizacional ocurre agregando nuevas unidades.

## Núcleo de plataforma

El núcleo compartido contendrá únicamente capacidades transversales:

- Identidad y perfiles.
- Organización fija y unidades de negocio.
- Roles, permisos y asignaciones.
- Auditoría y notificaciones.
- Configuración general y navegación autorizada.

No contendrá reglas financieras, de inventario, producción, hostales o ventas.

## Módulos de negocio

```text
OASIS ERP
├── Dashboard Ejecutivo
├── Finanzas
│   ├── Solicitud de Pagos          [alcance actual]
│   ├── Caja Chica                [posterior]
│   ├── Proveedores               [posterior]
│   └── Tesorería                 [futuro]
├── Compras
│   ├── Solicitudes de Compra
│   ├── Órdenes de Compra
│   └── Recepción
├── Inventario
│   ├── Productos
│   ├── Movimientos
│   ├── Bodega
│   └── Stock
├── Producción
│   ├── Producción de Modulares
│   ├── Órdenes de Producción
│   ├── Control de Avance
│   ├── Materiales
│   └── Mano de Obra
├── Hostales
│   ├── Reservas
│   ├── Habitaciones
│   ├── Huéspedes
│   └── Check-in / Check-out
├── Ventas
│   ├── Clientes
│   ├── Cotizaciones
│   ├── Contratos
│   └── Facturación
├── Reportes
│   ├── Indicadores
│   ├── Dashboard Ejecutivo
│   └── Exportaciones
├── Administración
│   ├── Usuarios, Roles y Empresas
│   ├── Unidades de Negocio
│   ├── Centros de Costo y Categorías
│   ├── Límites de Aprobación
│   └── Configuración General
└── Auditoría
    ├── Historial
    ├── Logs
    └── Seguridad
```

Estos módulos futuros son límites arquitectónicos, no funcionalidades implementadas.

## Estructura interna de un módulo

Cada módulo podrá crecer con cuatro áreas:

```text
module/
├── domain/          # Entidades, invariantes y transiciones puras
├── application/     # Casos de uso y contratos
├── infrastructure/  # Consultas Supabase y adaptadores
└── ui/              # Componentes y formularios del módulo
```

La comunicación entre módulos será por contratos explícitos o servicios del núcleo. Se evitarán consultas a tablas internas de otro módulo desde componentes visuales.

## Autorización configurable

Un usuario conserva un rol principal, pero el rol será solo una agrupación administrable de permisos. Las acciones usan permisos estables y específicos, por ejemplo:

- `finance.payment_requests.create`
- `finance.payment_requests.view_unit`
- `finance.approvals.decide`
- `finance.payments.schedule`
- `finance.payments.execute`
- `administration.companies.manage`

El menú se genera a partir del catálogo modular y los permisos efectivos. Esto mejora la experiencia, pero no reemplaza controles en servidor y RLS. La base de datos determinará usuario, empresa, unidades y permiso sin confiar en el navegador.

## Flujo de Solicitud de Pagos

Al enviar una solicitud, el servidor busca una regla activa no superpuesta para su empresa, unidad y monto. La solicitud conserva la regla y nivel aplicados. Una decisión válida completa la aprobación; Gerente general y Superadministrador pueden reemplazar al aprobador requerido dejando auditoría.

```text
draft → pending_approval
pending_approval → under_review | approved | rejected | correction_requested
under_review → approved | rejected | correction_requested
correction_requested → pending_approval
approved → scheduled | cancelled
scheduled → paid | cancelled
```

Desde la Etapa 2A.1, la selección y secuencia de aprobación se configuran mediante workflows, condiciones y etapas. Cada envío crea una instancia congelada; ninguna regla por monto queda distribuida en la aplicación. Los contratos de Dashboard Ejecutivo se implementan como vista `security_invoker` y funciones agregadas que heredan RLS.

## Evolución sostenible

- Los identificadores de empresa evitan una migración multiempresa disruptiva en el futuro.
- Los permisos configurables evitan condicionales rígidos por rol.
- El catálogo modular desacopla navegación de implementación.
- El núcleo compartido evita duplicar identidad, auditoría y configuración.
- Los límites de dominio permiten evolucionar y probar cada módulo aisladamente.
