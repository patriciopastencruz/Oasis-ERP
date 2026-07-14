export type ErpModuleStatus = "active" | "planned";

export interface ErpModuleDefinition {
  readonly key: string;
  readonly label: string;
  readonly status: ErpModuleStatus;
  readonly features: readonly string[];
}

/**
 * Catálogo de navegación y capacidades de alto nivel.
 * La autorización real será resuelta por permisos persistidos y RLS.
 */
export const erpModules: readonly ErpModuleDefinition[] = [
  {
    key: "executive-dashboard",
    label: "Dashboard Ejecutivo",
    status: "planned",
    features: [],
  },
  {
    key: "finance",
    label: "Finanzas",
    status: "active",
    features: ["Solicitud de Pagos", "Caja Chica", "Proveedores", "Tesorería"],
  },
  {
    key: "purchasing",
    label: "Compras",
    status: "planned",
    features: ["Solicitudes de Compra", "Órdenes de Compra", "Recepción"],
  },
  {
    key: "inventory",
    label: "Inventario",
    status: "active",
    features: [
      "Materiales",
      "Facturas",
      "Salidas",
      "Movimientos",
      "Aprobaciones",
      "Reportes",
    ],
  },
  {
    key: "production",
    label: "Producción",
    status: "planned",
    features: [
      "Producción de Modulares",
      "Órdenes de Producción",
      "Control de Avance",
      "Materiales",
      "Mano de Obra",
    ],
  },
  {
    key: "lodging",
    label: "Hostales",
    status: "active",
    features: [
      "Gestión de reservas",
      "Habitaciones",
      "Huéspedes",
      "Check-in / Check-out",
      "Sincronización iCal",
    ],
  },
  {
    key: "sales",
    label: "Ventas",
    status: "planned",
    features: ["Clientes", "Cotizaciones", "Contratos", "Facturación"],
  },
  {
    key: "reports",
    label: "Reportes",
    status: "planned",
    features: ["Indicadores", "Dashboard Ejecutivo", "Exportaciones"],
  },
  {
    key: "administration",
    label: "Administración",
    status: "planned",
    features: [
      "Usuarios",
      "Roles",
      "Unidades de Negocio",
      "Centros de Costo",
      "Categorías",
      "Límites de Aprobación",
      "Configuración General",
    ],
  },
  {
    key: "audit",
    label: "Auditoría",
    status: "planned",
    features: ["Historial", "Logs", "Seguridad"],
  },
] as const;
