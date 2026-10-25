import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clientSaidIt } from "@/modules/lucia/domain/history";
import { distMoney } from "../domain/prompt";
import { validateDeliveryDate } from "../domain/delivery-date";

export type ToolCustomer = { id: string; name: string; address: string; hasCredit: boolean; creditAvailable: boolean };

export type DistToolContext = {
  admin: SupabaseClient;
  unitId: string;
  conversationId: string;
  customers: ToolCustomer[];
  /** Lo que el cliente escribió o confirmó en esta consulta: la fecha debe salir de ahí. */
  customerText: string;
  todayIso: string;
  /** Simulador: se prueba todo el camino pero no queda ningún pedido. */
  simulate: boolean;
};

export type ToolResult = { content: string; isError: boolean };

export type DistToolState = {
  /** Resumen exacto de la última cotización de esta respuesta. */
  quote: { summary: string; total: number } | null;
  created: { orderNumber: string; total: number; deliveryDate: string; simulated: boolean } | null;
  flagged: boolean;
};

type OrderInput = {
  delivery_date?: string;
  fecha_dicha_por_el_cliente?: string;
  customer_id?: string;
  payment_method?: string;
  delivery_address?: string;
  estimated_time?: string;
  notes?: string;
  lines?: { product_code?: string; quantity?: number }[];
  cliente_confirmo?: boolean;
};

const fail = (content: string): ToolResult => ({ content, isError: true });
const ok = (data: unknown): ToolResult => ({ content: JSON.stringify(data), isError: false });

const PAYMENT_LABEL: Record<string, string> = { cash: "efectivo", transfer: "transferencia", credit: "crédito" };

export function longDate(iso: string) {
  return new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${iso}T12:00:00Z`));
}

/** El mensaje de PostgreSQL ya viene en español; solo se limpia. */
const dbMessage = (message: string) => message.trim();

function validateOrder(ctx: DistToolContext, input: OrderInput): { error: ToolResult } | { customer: ToolCustomer; lines: { product_code: string; quantity: number }[] } {
  if (!ctx.customers.length) return { error: fail("Cliente no registrado: no se pueden cotizar ni crear pedidos. Sigue la regla 7 y usa avisar_encargado.") };
  const customer = ctx.customers.find((c) => c.id === input.customer_id) ?? (ctx.customers.length === 1 ? ctx.customers[0] : undefined);
  if (!customer) return { error: fail("Falta saber para cuál cliente es el pedido: pregúntalo y usa su customer_id.") };
  const date = input.delivery_date ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: fail("Indica la fecha de entrega en formato AAAA-MM-DD.") };
  if (!clientSaidIt(input.fecha_dicha_por_el_cliente, ctx.customerText))
    return {
      error: fail(
        "No cotizado: esas palabras no aparecen en lo que el cliente escribió o confirmó. Copia exactamente sus palabras sobre el día de entrega; si él confirmó con un «sí» el día que tú le propusiste, copia tu frase con esa fecha. Si nadie dijo el día, no lo supongas: pregúntalo.",
      ),
    };
  const mismatch = validateDeliveryDate(date, input.fecha_dicha_por_el_cliente ?? "", ctx.todayIso);
  if (mismatch) return { error: fail(`No cotizado: ${mismatch}.`) };
  const lines = (input.lines ?? []).filter((l) => l.product_code && Number.isInteger(l.quantity) && (l.quantity as number) > 0).map((l) => ({ product_code: l.product_code as string, quantity: l.quantity as number }));
  if (!lines.length || lines.length !== (input.lines ?? []).length) return { error: fail("Cada producto necesita su código y una cantidad entera mayor que 0.") };
  return { customer, lines };
}

type Quote = { lines: { name: string; quantity: number; unit_price: number; line_total: number }[]; total: number; rule_error: string | null };

async function quote(ctx: DistToolContext, customer: ToolCustomer, input: OrderInput, lines: { product_code: string; quantity: number }[]): Promise<{ error: ToolResult } | { quote: Quote }> {
  const { data, error } = await ctx.admin.rpc("dist_wa_quote_order", {
    target_unit: ctx.unitId,
    payload: { customer_id: customer.id, delivery_date: input.delivery_date, lines },
  });
  if (error) return { error: fail(dbMessage(error.message)) };
  const q = data as Quote;
  if (q.rule_error) return { error: fail(q.rule_error) };
  return { quote: q };
}

function summaryText(input: OrderInput, customer: ToolCustomer, q: { lines: { name: string; quantity: number; unit_price: number; line_total: number }[]; total: number }) {
  const address = input.delivery_address?.trim() || customer.address;
  const payment = PAYMENT_LABEL[input.payment_method ?? ""] ?? null;
  return [
    `🧾 Resumen de tu pedido para el ${longDate(input.delivery_date as string)}:`,
    ...q.lines.map((l) => `• ${l.quantity} × ${l.name} — ${distMoney(l.unit_price)} c/u = ${distMoney(l.line_total)}`),
    `Total: ${distMoney(q.total)}`,
    `Dirección: ${address}`,
    ...(payment ? [`Pago: ${payment}`] : []),
  ].join("\n");
}

export async function runCotizar(ctx: DistToolContext, state: DistToolState, input: OrderInput): Promise<ToolResult> {
  const checked = validateOrder(ctx, input);
  if ("error" in checked) return checked.error;
  const result = await quote(ctx, checked.customer, input, checked.lines);
  if ("error" in result) return result.error;
  const summary = summaryText(input, checked.customer, result.quote);
  state.quote = { summary, total: result.quote.total };
  return ok({ ok: true, total: result.quote.total, resumen_whatsapp: summary, instruccion: "Responde copiando COMPLETO y sin cambios resumen_whatsapp y termina preguntando «¿Confirmas el pedido?»." });
}

export async function runCrear(ctx: DistToolContext, state: DistToolState, input: OrderInput): Promise<ToolResult> {
  if (input.cliente_confirmo !== true) return fail("No creado: el cliente todavía no confirmó el resumen. Muéstrale el resumen con cotizar_pedido y espera su «sí».");
  const checked = validateOrder(ctx, input);
  if ("error" in checked) return checked.error;
  const method = input.payment_method ?? "";
  if (!PAYMENT_LABEL[method]) return fail("Indica la forma de pago: efectivo, transferencia o crédito.");
  if (method === "credit" && !(checked.customer.hasCredit && checked.customer.creditAvailable)) return fail("Este cliente no tiene crédito disponible: ofrécele efectivo o transferencia.");
  const priced = await quote(ctx, checked.customer, input, checked.lines);
  if ("error" in priced) return priced.error;

  // Un segundo «sí» o un reintento no debe duplicar el pedido: si en los últimos 15 minutos ya se creó uno igual, se devuelve ese.
  if (!ctx.simulate) {
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: recent } = await ctx.admin
      .from("dist_wa_order_links")
      .select("order_id,dist_orders(order_number,total,delivery_date)")
      .eq("conversation_id", ctx.conversationId)
      .gte("created_at", since);
    const same = (recent ?? [])
      .map((r) => (Array.isArray(r.dist_orders) ? r.dist_orders[0] : r.dist_orders))
      .find((o) => o && Number(o.total) === priced.quote.total && o.delivery_date === input.delivery_date);
    if (same) {
      state.created = { orderNumber: same.order_number, total: Number(same.total), deliveryDate: same.delivery_date, simulated: false };
      return ok({ ok: true, ya_creado: true, numero_pedido: same.order_number, total: Number(same.total), dia: longDate(same.delivery_date) });
    }
  }

  const { data, error } = await ctx.admin.rpc("dist_wa_create_order", {
    target_conversation: ctx.conversationId,
    payload: {
      customer_id: checked.customer.id,
      delivery_date: input.delivery_date,
      estimated_time: input.estimated_time ?? null,
      delivery_address: input.delivery_address ?? null,
      payment_method: method,
      notes: input.notes ?? "",
      lines: checked.lines,
      simulate: ctx.simulate,
    },
  });
  if (error) {
    const simulated = /SIMULACION_OK\|([^|]+)\|([^|]+)\|/.exec(error.message);
    if (simulated) {
      state.created = { orderNumber: simulated[1], total: Number(simulated[2]), deliveryDate: input.delivery_date as string, simulated: true };
      return ok({ ok: true, simulacion: true, numero_pedido: simulated[1], total: Number(simulated[2]), dia: longDate(input.delivery_date as string), nota: "Simulación: el pedido NO se guardó en el ERP." });
    }
    return fail(dbMessage(error.message));
  }
  const created = data as { order_number: string; total: number };
  state.created = { orderNumber: created.order_number, total: Number(created.total), deliveryDate: input.delivery_date as string, simulated: false };
  return ok({ ok: true, numero_pedido: created.order_number, total: Number(created.total), dia: longDate(input.delivery_date as string) });
}

export async function runAvisar(ctx: DistToolContext, state: DistToolState, input: { motivo?: string; resumen?: string }): Promise<ToolResult> {
  const { error } = await ctx.admin.rpc("dist_wa_flag_conversation", {
    target_conversation: ctx.conversationId,
    reason: input.motivo ?? "",
    summary: input.resumen ?? "",
    simulated: ctx.simulate,
  });
  if (error) return fail("No se pudo avisar al encargado.");
  state.flagged = true;
  return ok({ ok: true, nota: "El encargado fue avisado dentro del ERP. Dile al cliente que lo contactarán." });
}
