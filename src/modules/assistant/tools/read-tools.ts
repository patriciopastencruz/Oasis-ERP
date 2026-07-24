import type { AssistantTool } from "@/modules/assistant/tools/types";

/**
 * Herramientas de solo lectura (Nivel 2). Todas usan el cliente de
 * Supabase con sesión del propio usuario (`ToolContext.supabase`), así
 * que RLS ya limita los resultados a lo que el usuario puede ver por
 * sus propios permisos — estas herramientas no agregan una capa de
 * autorización adicional, solo consultan.
 */

/**
 * `,`, `(` y `)` son caracteres estructurales en la sintaxis de filtros
 * de PostgREST (`.or(...)`): separan condiciones y agrupan lógica. El
 * `query` que arma el modelo se interpola directo en un `.or()`, así
 * que hay que quitarlos antes — de lo contrario el texto de búsqueda
 * podría inyectar condiciones de filtro no previstas.
 */
function sanitizeSearchTerm(input: string): string {
  return input.replace(/[,()]/g, " ").trim().slice(0, 200);
}

const searchPaymentRequest: AssistantTool<{ query: string }> = {
  name: "search_payment_request",
  description:
    "Busca solicitudes de pago por número de correlativo o descripción. Devuelve estado, monto y prioridad.",
  requiredPermission: "finance.payment_requests.create",
  requiresConfirmation: false,
  mode: "read",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Número de solicitud o texto a buscar",
      },
    },
    required: ["query"],
  },
  async execute(input, { supabase }) {
    const term = sanitizeSearchTerm(input.query);
    const { data, error } = await supabase
      .from("payment_requests")
      .select("id,request_number,status,amount,priority,description")
      .or(`request_number.ilike.%${term}%,description.ilike.%${term}%`)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (error)
      return {
        results: [],
        error: "No fue posible consultar solicitudes de pago.",
      };
    return { results: data ?? [] };
  },
};

const checkMaterialStock: AssistantTool<{ query: string }> = {
  name: "check_material_stock",
  description:
    "Busca materiales del inventario por código, nombre o categoría. Devuelve stock actual, precio promedio y estado.",
  requiredPermission: "inventory.materials.view",
  requiresConfirmation: false,
  mode: "read",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Código, nombre o categoría del material",
      },
    },
    required: ["query"],
  },
  async execute(input, { supabase }) {
    const term = sanitizeSearchTerm(input.query);
    const { data, error } = await supabase
      .from("inventory_materials")
      .select(
        "id,code,name,category,unit_of_measure,current_stock,average_price,status",
      )
      .or(`code.ilike.%${term}%,name.ilike.%${term}%,category.ilike.%${term}%`)
      .order("name")
      .limit(5);
    if (error)
      return { results: [], error: "No fue posible consultar el inventario." };
    return { results: data ?? [] };
  },
};

const checkPettyCashReport: AssistantTool<{ query: string }> = {
  name: "check_petty_cash_report",
  description:
    "Busca rendiciones de Caja Chica por correlativo o motivo. Devuelve estado y total.",
  requiresConfirmation: false,
  mode: "read",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Correlativo (ej. RC-...) o motivo a buscar",
      },
    },
    required: ["query"],
  },
  async execute(input, { supabase }) {
    const term = sanitizeSearchTerm(input.query);
    const { data, error } = await supabase
      .from("petty_cash_reports")
      .select(
        "id,report_number,status,total_registered,week_start,week_end,general_reason",
      )
      .or(`report_number.ilike.%${term}%,general_reason.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error)
      return {
        results: [],
        error: "No fue posible consultar rendiciones de Caja Chica.",
      };
    return { results: data ?? [] };
  },
};

const checkDistributionOrder: AssistantTool<{ query: string }> = {
  name: "check_distribution_order",
  description:
    "Busca pedidos de la Distribuidora Altiplánica por dirección de entrega o notas. Devuelve estado, fecha de entrega y total.",
  requiredPermission: "finance.distribution.view",
  requiresConfirmation: false,
  mode: "read",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Texto a buscar en dirección de entrega o notas",
      },
    },
    required: ["query"],
  },
  async execute(input, { supabase }) {
    const term = sanitizeSearchTerm(input.query);
    const { data, error } = await supabase
      .from("dist_orders")
      .select("id,status,delivery_date,delivery_address,total,payment_status")
      .or(`delivery_address.ilike.%${term}%,notes.ilike.%${term}%`)
      .order("delivery_date", { ascending: false })
      .limit(5);
    if (error)
      return {
        results: [],
        error: "No fue posible consultar pedidos de Distribuidora.",
      };
    return { results: data ?? [] };
  },
};

const checkQuotationStatus: AssistantTool<{ query: string }> = {
  name: "check_quotation_status",
  description:
    "Busca cotizaciones por correlativo o empresa cliente. Devuelve estado y total.",
  requiredPermission: "sales.quotations.create",
  requiresConfirmation: false,
  mode: "read",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Correlativo o nombre de la empresa cliente",
      },
    },
    required: ["query"],
  },
  async execute(input, { supabase }) {
    const term = sanitizeSearchTerm(input.query);
    const { data, error } = await supabase
      .from("om_quotations")
      .select("id,quotation_number,client_company,status,total")
      .or(`quotation_number.ilike.%${term}%,client_company.ilike.%${term}%`)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (error)
      return { results: [], error: "No fue posible consultar cotizaciones." };
    return { results: data ?? [] };
  },
};

export const READ_TOOLS: AssistantTool[] = [
  searchPaymentRequest,
  checkMaterialStock,
  checkPettyCashReport,
  checkDistributionOrder,
  checkQuotationStatus,
];
