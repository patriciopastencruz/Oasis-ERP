/** Estados y reglas puras del abastecimiento de Oasis Modulares (pedido → lista de compras). */

export type SupplyRequestStatus = "draft" | "submitted" | "in_list" | "cancelled";
export type SupplyListStatus = "draft" | "issued" | "completed" | "cancelled";
export type SupplyItemStatus = "pending" | "bought" | "received" | "not_found" | "covered";

export const requestStatusLabels: Record<SupplyRequestStatus, string> = {
  draft: "Borrador",
  submitted: "Enviado a bodega",
  in_list: "En lista de compras",
  cancelled: "Anulado",
};

export const listStatusLabels: Record<SupplyListStatus, string> = {
  draft: "Borrador de bodega",
  issued: "Por comprar",
  completed: "Terminada",
  cancelled: "Anulada",
};

export const itemStatusLabels: Record<SupplyItemStatus, string> = {
  pending: "Por comprar",
  bought: "Comprado",
  received: "Recibido en bodega",
  not_found: "No se encontró",
  covered: "Cubierto con stock",
};

export const statusTone: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-amber-100 text-amber-800",
  in_list: "bg-sky-100 text-sky-800",
  issued: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-800",
  bought: "bg-sky-100 text-sky-800",
  received: "bg-emerald-100 text-emerald-800",
  not_found: "bg-red-100 text-red-700",
  covered: "bg-slate-100 text-slate-600",
};

/** Un pedido se puede seguir editando solo mientras es borrador. */
export const isRequestEditable = (status: string) => status === "draft";

/** Se puede anular un pedido que todavía no pasó a una lista de compras. */
export const isRequestCancellable = (status: string) => status === "draft" || status === "submitted";

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Ventana por defecto del pedido: los 2 días siguientes a hoy (mañana y pasado mañana). */
export function defaultCoverWindow(today: string) {
  return { from: addDays(today, 1), to: addDays(today, 2) };
}

/** "1,5" o "1.5" → 1.5. Devuelve null si no es un número mayor que cero. */
export function parseQuantity(value: unknown) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 1000) / 1000 : null;
}

export type DraftLineInput = {
  material_id?: string;
  custom_name?: string;
  unit?: string;
  quantity?: unknown;
  note?: string;
};

export type CleanLine = {
  material_id?: string;
  custom_name?: string;
  unit?: string;
  quantity: number;
  note?: string;
};

/**
 * Limpia las filas del formulario: descarta las completamente vacías y exige cantidad y nombre al resto.
 * Devuelve `{ error }` con un mensaje para el maestro si alguna fila está incompleta.
 */
export function cleanRequestLines(rows: DraftLineInput[]): { lines: CleanLine[] } | { error: string } {
  const lines: CleanLine[] = [];
  for (const [index, row] of rows.entries()) {
    const material = String(row.material_id ?? "").trim();
    const custom = String(row.custom_name ?? "").trim();
    const quantityText = String(row.quantity ?? "").trim();
    if (!material && !custom && !quantityText) continue;
    const position = `Fila ${index + 1}`;
    if (!material && custom.length < 2) return { error: `${position}: elige un material o escribe su nombre.` };
    const quantity = parseQuantity(row.quantity);
    if (quantity === null) return { error: `${position}: indica una cantidad mayor que cero.` };
    const note = String(row.note ?? "").trim().slice(0, 300);
    lines.push({
      ...(material ? { material_id: material } : { custom_name: custom.slice(0, 160), unit: String(row.unit ?? "").trim().slice(0, 40) || "un" }),
      quantity,
      ...(note ? { note } : {}),
    });
  }
  if (!lines.length) return { error: "Agrega al menos un material con su cantidad." };
  if (lines.length > 80) return { error: "Un pedido admite como máximo 80 materiales." };
  return { lines };
}

/** Mensaje para el usuario a partir de lo que devuelve la base (los textos de las funciones son cortos y propios). */
const friendlyErrors: [RegExp, string][] = [
  [/no tienes asignado/i, "No tienes asignado ese proyecto. Pide a administración que te agregue al equipo."],
  [/proyecto no encontrado|proyecto no esta activo/i, "El proyecto no está disponible para pedir materiales."],
  [/dias que cubre/i, "Indica los días que cubre el pedido."],
  [/antes de hoy/i, "El pedido no puede empezar antes de hoy."],
  [/7 dias/i, "El pedido cubre como máximo 7 días."],
  [/entre 1 y 80/i, "Agrega entre 1 y 80 materiales."],
  [/por que es urgente/i, "Indica por qué es urgente."],
  [/ya fue enviado/i, "El pedido ya fue enviado y no se puede modificar."],
  [/pedido no encontrado/i, "No se encontró el pedido."],
  [/cantidad mayor que cero/i, "Cada material necesita una cantidad mayor que cero."],
  [/material no encontrado/i, "Un material ya no está en el catálogo. Vuelve a elegirlo."],
  [/nombre del material/i, "Escribe el nombre del material que no está en el catálogo."],
  [/motivo de la anulacion/i, "Indica el motivo de la anulación."],
  [/ya esta en una lista|anulado/i, "El pedido ya está en una lista de compras o fue anulado."],
  [/ya no estan disponibles/i, "Algunos pedidos ya no están disponibles. Actualiza la página."],
  [/elige al menos un pedido/i, "Elige al menos un pedido."],
  [/lista no encontrada/i, "No se encontró la lista."],
  [/producto no encontrado/i, "No se encontró el producto."],
  [/ya fue emitida/i, "La lista ya fue emitida y no se puede modificar."],
  [/no tiene productos/i, "La lista no tiene productos."],
  [/cantidad a comprar/i, "La cantidad a comprar no es válida."],
  [/proveedor no encontrado/i, "Proveedor no encontrado."],
  [/nombre del producto/i, "Escribe el nombre del producto."],
  [/cantidad no es valida|cantidad comprada/i, "La cantidad no es válida."],
  [/lista no esta activa/i, "La lista no está activa."],
  [/no se pudo comprar/i, "Indica por qué no se pudo comprar."],
  [/ya no esta pendiente|no se puede marcar|no se puede reabrir|solo se recibe|no esta recibido/i, "Ese producto ya cambió de estado. Actualiza la página."],
  [/ya tiene productos comprados/i, "La lista ya tiene productos comprados: no se puede anular."],
  [/ya no se puede anular/i, "Esta lista ya no se puede anular."],
  [/unidad no autorizada|sin autorizacion|42501/i, "No tienes autorización para esta acción."],
];

export function supplyErrorMessage(message: string) {
  return friendlyErrors.find(([pattern]) => pattern.test(message))?.[1] ?? "No fue posible completar la operación. Intenta nuevamente.";
}

export function formatCoverWindow(from: string, to: string) {
  const fmt = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
  return from === to ? fmt(from) : `${fmt(from)} al ${fmt(to)}`;
}

export const quantityFormat = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 }).format(Number(value ?? 0));
