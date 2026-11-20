import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";

export const SUPPLY_REQUEST = "inventory.supply.request";
export const SUPPLY_CONSOLIDATE = "inventory.supply.consolidate";
export const SUPPLY_BUY = "inventory.supply.buy";

/** Sesión de Oasis Modulares con al menos uno de los permisos de abastecimiento. */
export async function supplyContext(...anyOf: string[]) {
  const ctx = await requireSession();
  if (!anyOf.some((p) => ctx.permissions.has(p))) redirect("/no-access");
  const unit = ctx.units.find((u) => u.code === "OM");
  if (!unit) redirect("/no-access");
  return {
    ctx,
    unit,
    supabase: await createSupabaseServerClient(),
    canRequest: ctx.permissions.has(SUPPLY_REQUEST),
    canConsolidate: ctx.permissions.has(SUPPLY_CONSOLIDATE),
    canBuy: ctx.permissions.has(SUPPLY_BUY),
  };
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type CatalogItem = { id: string; code: string; name: string; category: string; unit: string };
export type SupplyProject = { id: string; project_number: string | null; name: string; place: string | null; status: string };

export type RequestLine = {
  id: string;
  material_id: string | null;
  name: string;
  unit: string;
  quantity: number;
  note: string | null;
};

export type SupplyRequest = {
  id: string;
  project_id: string;
  status: "draft" | "submitted" | "in_list" | "cancelled";
  cover_from: string;
  cover_to: string;
  urgent: boolean;
  urgent_reason: string | null;
  notes: string | null;
  requested_by: string;
  submitted_at: string | null;
  purchase_list_id: string | null;
  cancel_reason: string | null;
  created_at: string;
  project: { project_number: string | null; name: string };
  requester_name: string | null;
  lines?: RequestLine[];
};

const REQUEST_SELECT =
  "id,project_id,project_number,project_name,requester_name,status,cover_from,cover_to,urgent,urgent_reason,notes,requested_by,submitted_at,purchase_list_id,cancel_reason,created_at";

const normalizeRequest = (row: unknown) => {
  const r = row as Record<string, unknown> & { project_number: string | null; project_name: string };
  return { ...r, project: { project_number: r.project_number, name: r.project_name } } as unknown as SupplyRequest;
};

export async function loadCatalog(supabase: Supabase) {
  const { data, error } = await supabase.rpc("om_supply_catalog");
  if (error) throw error;
  return (data ?? []) as CatalogItem[];
}

export async function loadMyProjects(supabase: Supabase) {
  const { data, error } = await supabase.rpc("om_supply_my_projects");
  if (error) throw error;
  return (data ?? []) as SupplyProject[];
}

export async function loadSuppliers(supabase: Supabase) {
  const { data, error } = await supabase.rpc("om_supply_suppliers");
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}

export async function listRequests(supabase: Supabase, status?: string) {
  let query = supabase.from("om_supply_requests").select(REQUEST_SELECT).order("created_at", { ascending: false }).limit(150);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(normalizeRequest);
}

export async function getRequest(supabase: Supabase, id: string) {
  const { data, error } = await supabase.from("om_supply_requests").select(REQUEST_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: lines, error: linesError } = await supabase
    .from("om_supply_request_lines")
    .select("id,material_id,name,unit,quantity,note")
    .eq("request_id", id)
    .order("created_at");
  if (linesError) throw linesError;
  return { ...normalizeRequest(data), lines: (lines ?? []).map((l) => ({ ...l, quantity: Number(l.quantity) })) as RequestLine[] };
}

/** Pedidos enviados que aún no están en una lista de compras, con sus líneas. */
export async function listPendingRequests(supabase: Supabase) {
  const requests = await listRequests(supabase, "submitted");
  if (!requests.length) return [];
  const { data, error } = await supabase
    .from("om_supply_request_lines")
    .select("id,request_id,material_id,name,unit,quantity,note")
    .in("request_id", requests.map((r) => r.id))
    .order("created_at");
  if (error) throw error;
  return requests
    .map((r) => ({
      ...r,
      lines: (data ?? []).filter((l) => l.request_id === r.id).map((l) => ({ ...l, quantity: Number(l.quantity) })) as RequestLine[],
    }))
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.created_at.localeCompare(b.created_at));
}

export type PurchaseList = {
  id: string;
  list_number: string;
  status: "draft" | "issued" | "completed" | "cancelled";
  cover_from: string;
  cover_to: string;
  notes: string | null;
  issued_at: string | null;
  completed_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  counts?: { total: number; pending: number; done: number; missing: number };
};

export type PurchaseItem = {
  id: string;
  material_id: string | null;
  name: string;
  unit: string;
  requested_quantity: number;
  stock_quantity: number;
  in_transit_quantity: number;
  quantity_to_buy: number;
  supplier_id: string | null;
  supplier_name: string | null;
  reference_price: number | null;
  note: string | null;
  status: "pending" | "bought" | "received" | "not_found" | "covered";
  bought_quantity: number | null;
  resolution_note: string | null;
};

const LIST_SELECT = "id,list_number,status,cover_from,cover_to,notes,issued_at,completed_at,cancel_reason,created_at";
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function listPurchaseLists(supabase: Supabase) {
  const { data, error } = await supabase.from("om_supply_purchase_lists").select(LIST_SELECT).order("created_at", { ascending: false }).limit(60);
  if (error) throw error;
  const lists = (data ?? []) as PurchaseList[];
  if (!lists.length) return lists;
  const { data: items, error: itemsError } = await supabase
    .from("om_supply_purchase_items")
    .select("list_id,status")
    .in("list_id", lists.map((l) => l.id));
  if (itemsError) throw itemsError;
  return lists.map((l) => {
    const own = (items ?? []).filter((i) => i.list_id === l.id);
    return {
      ...l,
      counts: {
        total: own.length,
        pending: own.filter((i) => i.status === "pending").length,
        done: own.filter((i) => ["bought", "received"].includes(i.status)).length,
        missing: own.filter((i) => i.status === "not_found").length,
      },
    };
  });
}

export async function getPurchaseList(supabase: Supabase, id: string) {
  const { data, error } = await supabase.from("om_supply_purchase_lists").select(LIST_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: items, error: itemsError } = await supabase
    .from("om_supply_purchase_items")
    .select("id,material_id,name,unit,requested_quantity,stock_quantity,in_transit_quantity,quantity_to_buy,supplier_id,supplier_name,reference_price,note,status,bought_quantity,resolution_note")
    .eq("list_id", id)
    .order("supplier_name", { nullsFirst: false })
    .order("name");
  if (itemsError) throw itemsError;
  const normalized = (items ?? []).map((i) => ({
    ...i,
    requested_quantity: Number(i.requested_quantity),
    stock_quantity: Number(i.stock_quantity),
    in_transit_quantity: Number(i.in_transit_quantity),
    quantity_to_buy: Number(i.quantity_to_buy),
    reference_price: num(i.reference_price),
    bought_quantity: num(i.bought_quantity),
  })) as PurchaseItem[];
  return { list: data as PurchaseList, items: normalized };
}

/** Proyectos y maestros de cada pedido incluido en la lista (solo bodega puede leer los pedidos). */
export async function requestsInList(supabase: Supabase, listId: string) {
  const { data, error } = await supabase.from("om_supply_requests").select(REQUEST_SELECT).eq("purchase_list_id", listId).order("created_at");
  if (error) throw error;
  return (data ?? []).map(normalizeRequest);
}

export const personName = (name: string | null | undefined) => name?.trim() || "—";
