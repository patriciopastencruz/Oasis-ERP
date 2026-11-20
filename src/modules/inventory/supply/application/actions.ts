"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dispatchApprovalEmails } from "@/lib/notifications/approval-email";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cleanRequestLines, parseQuantity, supplyErrorMessage, type DraftLineInput } from "../domain/supply";
import { SUPPLY_BUY, SUPPLY_CONSOLIDATE, SUPPLY_REQUEST, supplyContext } from "./queries";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function go(path: string, key: "success" | "error", message: string): never {
  const [base, hash] = path.split("#");
  const separator = base.includes("?") ? "&" : "?";
  redirect(`${base}${separator}${key}=${encodeURIComponent(message)}${hash ? `#${hash}` : ""}`);
}

function fail(path: string, error: { message: string }): never {
  console.error("[supply]", error.message);
  go(path, "error", supplyErrorMessage(error.message));
}

/** Maestro: envía su pedido a bodega, o corrige uno ya enviado que bodega aún no pasa a una lista. */
export async function saveRequestAction(form: FormData) {
  await supplyContext(SUPPLY_REQUEST);
  const requestId = uuid.safeParse(form.get("request_id"));
  const back = requestId.success ? `/supply/requests/${requestId.data}` : "/supply/requests/new";
  const parsed = z
    .object({
      project_id: uuid,
      cover_from: day,
      cover_to: day,
      urgent_reason: z.string().trim().max(300).default(""),
      notes: z.string().trim().max(1000).default(""),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) go(back, "error", "Elige el proyecto y los días que cubre el pedido.");

  let rows: DraftLineInput[] = [];
  try {
    const raw = JSON.parse(String(form.get("lines_json") ?? "[]"));
    if (Array.isArray(raw)) rows = raw as DraftLineInput[];
  } catch {
    go(back, "error", "No se pudo leer la lista de materiales. Intenta nuevamente.");
  }
  const cleaned = cleanRequestLines(rows);
  if ("error" in cleaned) go(back, "error", cleaned.error);

  const updating = form.get("mode") === "update";
  const urgent = form.get("urgent") === "on";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("om_supply_save_request", {
    p_request: requestId.success ? requestId.data : null,
    p_payload: {
      project_id: parsed.data.project_id,
      cover_from: parsed.data.cover_from,
      cover_to: parsed.data.cover_to,
      urgent,
      urgent_reason: parsed.data.urgent_reason,
      notes: parsed.data.notes,
      submit: true,
      lines: cleaned.lines,
    },
  });
  if (error) fail(back, error);
  revalidatePath("/supply", "layout");
  const id = String(data);
  // Un pedido urgente nuevo avisa por correo a bodega: se envía de inmediato además del cron de respaldo.
  if (urgent && !updating) await dispatchApprovalEmails().catch(() => {});
  go(`/supply/requests/${id}`, "success", updating ? "Cambios guardados. Bodega verá tu pedido actualizado." : "Pedido enviado a bodega.");
}

export async function cancelRequestAction(form: FormData) {
  await supplyContext(SUPPLY_REQUEST, SUPPLY_CONSOLIDATE);
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) go("/supply/requests", "error", "Pedido inválido.");
  const back = `/supply/requests/${id.data}`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("om_supply_cancel_request", {
    p_request: id.data,
    p_reason: String(form.get("reason") ?? "").slice(0, 500),
  });
  if (error) fail(back, error);
  revalidatePath("/supply", "layout");
  go(back, "success", "Pedido anulado.");
}

/** Bodega: envía a compras la lista consolidada, con las cantidades que ajustó. */
export async function sendToPurchasingAction(form: FormData) {
  await supplyContext(SUPPLY_CONSOLIDATE);
  const back = "/supply/consolidate";
  const requests = form.getAll("request_id").map(String).filter((v) => uuid.safeParse(v).success);
  if (!requests.length) go(back, "error", "No hay solicitudes para enviar.");
  const lines = form.getAll("line").map(String);
  const amounts = form.getAll("qty").map((v) => String(v).trim().replace(",", "."));
  if (lines.length !== amounts.length || lines.some((l) => !uuid.safeParse(l).success)) go(back, "error", "No se pudo leer la lista. Actualiza la página.");
  const quantities = amounts.map((text, i) => ({ line_id: lines[i], quantity: text === "" ? NaN : Number(text) }));
  if (quantities.some((q) => !Number.isFinite(q.quantity) || q.quantity < 0 || q.quantity >= 1_000_000)) go(back, "error", "Revisa las cantidades: usa números, 0 si no se compra.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("om_supply_send_to_purchasing", {
    p_requests: requests,
    p_quantities: quantities,
    p_notes: String(form.get("notes") ?? "").slice(0, 1000),
  });
  if (error) fail(back, error);
  revalidatePath("/supply", "layout");
  await dispatchApprovalEmails().catch(() => {});
  go(`/supply/lists/${String(data)}`, "success", "Lista enviada a compras. El encargado de compras ya fue avisado.");
}

export async function updateItemAction(form: FormData) {
  await supplyContext(SUPPLY_CONSOLIDATE);
  const list = uuid.safeParse(form.get("list_id"));
  const item = uuid.safeParse(form.get("item_id"));
  if (!list.success || !item.success) go("/supply/lists", "error", "Producto inválido.");
  const back = `/supply/lists/${list.data}`;
  const quantity = String(form.get("quantity_to_buy") ?? "").trim().replace(",", ".");
  const payload: Record<string, unknown> = {
    note: String(form.get("note") ?? "").slice(0, 300),
  };
  if (quantity !== "") {
    const n = Number(quantity);
    if (!Number.isFinite(n) || n < 0 || n >= 1_000_000) go(back, "error", "La cantidad a comprar no es válida.");
    payload.quantity_to_buy = n;
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("om_supply_update_item", { p_item: item.data, p_payload: payload });
  if (error) fail(back, error);
  revalidatePath(back);
  go(back, "success", "Producto actualizado.");
}

export async function addItemAction(form: FormData) {
  await supplyContext(SUPPLY_CONSOLIDATE);
  const list = uuid.safeParse(form.get("list_id"));
  if (!list.success) go("/supply/lists", "error", "Lista inválida.");
  const back = `/supply/lists/${list.data}`;
  const quantity = parseQuantity(form.get("quantity"));
  if (quantity === null) go(back, "error", "Indica una cantidad mayor que cero.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("om_supply_add_item", {
    p_list: list.data,
    p_payload: {
      material_id: String(form.get("material_id") ?? ""),
      name: String(form.get("name") ?? ""),
      unit: String(form.get("unit") ?? ""),
      quantity,
    },
  });
  if (error) fail(back, error);
  revalidatePath(back);
  go(back, "success", "Producto agregado a la lista.");
}

export async function issueListAction(form: FormData) {
  await supplyContext(SUPPLY_CONSOLIDATE);
  const list = uuid.safeParse(form.get("list_id"));
  if (!list.success) go("/supply/lists", "error", "Lista inválida.");
  const back = `/supply/lists/${list.data}`;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("om_supply_issue_list", { p_list: list.data });
  if (error) fail(back, error);
  revalidatePath("/supply", "layout");
  if (data === "completed") go(back, "success", "Todo estaba cubierto con stock: no hay nada que comprar.");
  await dispatchApprovalEmails().catch(() => {});
  go(back, "success", "Lista emitida. El encargado de compras ya fue avisado en la app y por correo.");
}

/** Comprador (comprado / no se encontró / reabrir) y bodega (recibido). */
export async function markItemAction(form: FormData) {
  await supplyContext(SUPPLY_BUY, SUPPLY_CONSOLIDATE);
  const list = uuid.safeParse(form.get("list_id"));
  const item = uuid.safeParse(form.get("item_id"));
  const action = z.enum(["bought", "not_found", "reopen", "received", "unreceive"]).safeParse(form.get("action"));
  if (!list.success || !item.success || !action.success) go("/supply/lists", "error", "Acción inválida.");
  const back = `/supply/lists/${list.data}#item-${item.data}`;
  const quantity = String(form.get("quantity") ?? "").trim().replace(",", ".");
  const payload: Record<string, unknown> = { note: String(form.get("note") ?? "").slice(0, 300) };
  if (action.data === "bought" && quantity !== "") {
    const n = Number(quantity);
    if (!Number.isFinite(n) || n <= 0 || n >= 1_000_000) go(back, "error", "La cantidad no es válida.");
    payload.quantity = n;
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("om_supply_mark_item", { p_item: item.data, p_action: action.data, p_payload: payload });
  if (error) fail(back, error);
  revalidatePath("/supply", "layout");
  go(back, "success", "Listo.");
}

export async function cancelListAction(form: FormData) {
  await supplyContext(SUPPLY_CONSOLIDATE);
  const list = uuid.safeParse(form.get("list_id"));
  if (!list.success) go("/supply/lists", "error", "Lista inválida.");
  const back = `/supply/lists/${list.data}`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("om_supply_cancel_list", {
    p_list: list.data,
    p_reason: String(form.get("reason") ?? "").slice(0, 500),
  });
  if (error) fail(back, error);
  revalidatePath("/supply", "layout");
  go(back, "success", "Lista anulada. Sus pedidos volvieron a la cola de bodega.");
}
