export const IVA_RATE = 0.19;

export const projectStatuses = [
  "pending",
  "manufacturing",
  "installation",
  "done",
  "cancelled",
] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const allowedProjectStatusTransitions: Readonly<
  Record<ProjectStatus, readonly ProjectStatus[]>
> = {
  pending: ["manufacturing"],
  manufacturing: ["installation", "done"],
  installation: ["done"],
  done: [],
  cancelled: [],
};

export function canTransitionProjectStatus(
  from: ProjectStatus,
  to: ProjectStatus,
): boolean {
  return allowedProjectStatusTransitions[from].includes(to);
}

export const projectExpenseCategories = [
  "materiales",
  "mano_de_obra",
  "transporte",
  "instalacion",
  "alimentacion",
  "alojamiento",
  "subcontratos",
  "herramientas",
  "combustible",
  "otros",
] as const;
export type ProjectExpenseCategory = (typeof projectExpenseCategories)[number];

export const projectExpenseDocumentTypes = [
  "boleta",
  "factura",
  "boleta_honorarios",
  "guia_despacho",
  "factura_exenta",
  "sin_documento",
  "otro",
] as const;
export type ProjectExpenseDocumentType =
  (typeof projectExpenseDocumentTypes)[number];

export const projectDocumentTypes = [
  "contrato",
  "orden_compra_cliente",
  "factura",
  "recepcion_conforme",
  "fotografia",
  "plano",
  "otro",
] as const;
export type ProjectDocumentType = (typeof projectDocumentTypes)[number];

export const projectMemberRoles = [
  "jefe_proyecto",
  "vendedor",
  "supervisor",
  "instalador",
  "trabajador",
  "colaborador_externo",
] as const;
export type ProjectMemberRole = (typeof projectMemberRoles)[number];

export const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * Refleja el trigger `om_project_expenses_calc_totals`: el cálculo real
 * ocurre en la base de datos, esta función solo sirve para mostrar un
 * total en vivo en el formulario antes de enviarlo.
 */
export function calcExpenseTotals(netAmount: number, isExempt: boolean) {
  const iva = isExempt ? 0 : Math.round(netAmount * IVA_RATE * 100) / 100;
  const total = netAmount + iva;
  return { iva, total };
}

export type ProjectResults = {
  netIncome: number;
  netExpenses: number;
  result: number;
  marginPercent: number | null;
  ivaOnIncome: number;
  ivaOnExpenses: number;
};

/**
 * Estado de resultados: ingreso neto - gastos netos = resultado. El
 * margen nunca mezcla IVA (ni el de la venta ni el de los gastos), y es
 * `null` ("No disponible") cuando el ingreso neto es cero para evitar
 * dividir por cero.
 */
export function calcProjectResults(input: {
  netIncome: number;
  netExpenses: number;
  ivaOnIncome: number;
  ivaOnExpenses: number;
}): ProjectResults {
  const result = input.netIncome - input.netExpenses;
  const marginPercent =
    input.netIncome === 0 ? null : (result / input.netIncome) * 100;
  return {
    netIncome: input.netIncome,
    netExpenses: input.netExpenses,
    result,
    marginPercent,
    ivaOnIncome: input.ivaOnIncome,
    ivaOnExpenses: input.ivaOnExpenses,
  };
}

export function formatMargin(marginPercent: number | null): string {
  if (marginPercent === null) return "No disponible";
  return `${marginPercent.toFixed(2).replace(".", ",")} %`;
}
