# OASIS ERP

Finanzas → Solicitud de Pagos incluye registro y edición de borradores, respaldos privados, envío a workflows configurables, listado filtrable y seguimiento detallado. Consulta `docs/stage-4a-payment-requests.md` y `docs/payment-request-user-guide.md`.

La programación y ejecución financiera se documenta en `docs/stage-4c-payment-execution.md` y `docs/finance-payment-user-guide.md`.

El ciclo completo del módulo está documentado en `docs/finance-payment-module.md`, incluyendo guías de aprobaciones, cuentas bancarias y reportes.

Plataforma modular de gestión empresarial. Los alcances funcionales actuales son **Finanzas → Solicitud de Pagos** e **Inventario y Materiales → Oasis Modulares**; los demás dominios se mantienen como extensiones futuras.

La unidad **Oasis Modulares** cuenta además con Inventario y Materiales: maestro, facturas de compra, salidas, aprobaciones, trazabilidad y reportes Excel. Consulta `docs/inventory-materials-module.md`.

La unidad **Hostal Uruguay** incluye el módulo funcional **Gestión de reservas**: calendario semanal, habitaciones, reservas directas y externas, pagos, comprobantes privados, check-in/out e iCal. Consulta `docs/hostal-uruguay-reservas.md`.

La **Etapa 2A.1** está generada para revisión: evoluciona aprobaciones hacia flujos configurables y prepara contratos seguros para dashboards, pero todavía no se aplicó nada a Supabase.

## Alcance actual

Solicitud de Pagos permitirá registrar, aprobar, programar y auditar pagos. Sus decisiones confirmadas son:

- Un rol principal por usuario y permisos independientes configurables.
- Un único nivel de aprobación determinado por monto y unidad.
- Gerente general y Superadministrador pueden reemplazar al aprobador requerido con auditoría.
- Reglas obligatorias por unidad; una aprobación válida completa la decisión.
- Una caja chica activa por unidad.
- Moneda CLP, proveedores chilenos y validación de RUT.
- Correlativo por unidad y año, por ejemplo `HOC-2026-000001`.
- Zona horaria `America/Santiago` y formato `es-CL`.

## Organización

OASIS ERP opera exclusivamente para su organización base. La empresa queda implícita en la interfaz y el nivel administrable son las unidades de negocio:

```text
OASIS ERP
└── Unidades de negocio
    ├── Hostal Oasis Centro
    ├── Hostal Oasis Cobija
    ├── Oasis Modulares
    └── Distribuidora Altiplánica
```

`companies` será el límite superior de propiedad y aislamiento. Una empresa tendrá muchas unidades de negocio; los datos operacionales pertenecerán directa o indirectamente a una empresa. Esto permitirá incorporar otras organizaciones independientes sin mezclar datos ni duplicar la aplicación.

## Mapa modular

| Dominio             | Capacidades                                                     |
| ------------------- | --------------------------------------------------------------- |
| Dashboard Ejecutivo | Vista consolidada futura                                        |
| Finanzas            | **Solicitud de Pagos**, Caja Chica, Proveedores, Tesorería futura |
| Compras             | Solicitudes, órdenes y recepción                                |
| Inventario          | Productos, movimientos, bodega y stock                          |
| Producción          | Modulares, órdenes, avance, materiales y mano de obra           |
| Hostales            | Reservas, habitaciones, huéspedes y check-in/check-out          |
| Ventas              | Clientes, cotizaciones, contratos y facturación                 |
| Reportes            | Indicadores, Dashboard Ejecutivo y exportaciones                |
| Administración      | Usuarios, roles, empresas, unidades, catálogos y configuración  |
| Auditoría           | Historial, logs y seguridad                                     |

Solo Finanzas → Solicitud de Pagos pertenece al alcance de desarrollo actual.

## Arquitectura del código

```text
src/
├── app/                         # Rutas y composición Next.js
├── components/                  # UI transversal, sin reglas de dominio
├── config/                      # Marca y catálogo modular
├── lib/                         # Infraestructura compartida
└── modules/
    ├── platform/                # Empresas, identidad, permisos y auditoría
    ├── executive-dashboard/     # Futuro
    ├── finance/
    │   ├── payment-control/     # Alcance actual
    │   ├── petty-cash/          # Etapa futura del módulo Finanzas
    │   ├── suppliers/           # Etapa futura del módulo Finanzas
    │   └── treasury/            # Futuro
    ├── purchasing/              # Futuro
    ├── inventory/               # Futuro
    ├── production/              # Futuro
    ├── lodging/                 # Futuro
    ├── sales/                   # Futuro
    └── reporting/               # Futuro
```

Cada módulo tendrá contratos, dominio, aplicación e infraestructura propios. Los módulos compartirán identidad y contexto empresarial mediante el núcleo de plataforma, no mediante importaciones directas entre dominios.

## Roles y permisos

Los roles agrupan permisos; no constituyen permisos codificados en la interfaz. El modelo será:

```text
Usuario → Rol principal → Permisos del rol
                   ↘ Empresa(s) y unidad(es) asignadas
```

Las capacidades usarán claves estables como `finance.payment_requests.create` o `finance.payments.execute`. El menú consultará permisos para presentación, mientras acciones de servidor y RLS aplicarán la autorización real. Cambiar permisos de un rol no requerirá modificar ni desplegar código.

## Desarrollo local

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Variables previstas, todavía sin uso en esta etapa:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

## Verificación

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Consulta [Arquitectura](docs/architecture.md), [Modelo de datos](docs/data-model.md) y [Seguridad](docs/security.md).

La guía de revisión y futura aplicación está en [Etapa 2A](docs/stage-2a-database.md). Consulta también [Flujos configurables](docs/approval-workflows.md), [Dashboard Ejecutivo](docs/executive-dashboard.md) y [KPI financieros](docs/financial-kpis.md).

La infraestructura de autenticación y administración de la Etapa 3 está descrita en [Etapa 3](docs/stage-3-auth-administration.md).
