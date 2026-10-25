import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";

/** Contexto de la distribuidora para el asistente: unidad DA del usuario y cliente con sesión (RLS). */
export async function distAssistantContext(permission: "distribution.assistant.view" | "distribution.assistant.settings" = "distribution.assistant.view") {
  const ctx = await requirePermission(permission);
  const unit = ctx.units.find((u) => u.code === "DA");
  if (!unit) redirect("/no-access");
  return { ctx, unit, supabase: await createSupabaseServerClient() };
}

export type DistAssistantSettings = {
  enabled: boolean;
  agent_name: string;
  general_instructions: string;
  model: string;
  daily_budget_usd: number;
  history_messages: number;
  same_day_cutoff: string;
  delivery_weekdays: number[];
  max_quantity_per_line: number;
  max_order_total: number;
  acting_user_id: string | null;
  notify_phones: string[];
};

export const DEFAULT_DIST_SETTINGS: DistAssistantSettings = {
  enabled: false,
  agent_name: "",
  general_instructions: "",
  model: "claude-haiku-4-5",
  daily_budget_usd: 5,
  history_messages: 20,
  same_day_cutoff: "12:00",
  delivery_weekdays: [1, 2, 3, 4, 5, 6],
  max_quantity_per_line: 300,
  max_order_total: 1_500_000,
  acting_user_id: null,
  notify_phones: [],
};

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function loadDistSettings(supabase: Supabase, unitId: string): Promise<{ settings: DistAssistantSettings; configured: boolean }> {
  const { data } = await supabase
    .from("dist_wa_settings")
    .select("enabled,agent_name,general_instructions,model,daily_budget_usd,history_messages,same_day_cutoff,delivery_weekdays,max_quantity_per_line,max_order_total,acting_user_id,notify_phones")
    .eq("business_unit_id", unitId)
    .maybeSingle();
  if (!data) return { settings: DEFAULT_DIST_SETTINGS, configured: false };
  return {
    configured: true,
    settings: {
      ...data,
      daily_budget_usd: Number(data.daily_budget_usd),
      max_order_total: Number(data.max_order_total),
      same_day_cutoff: String(data.same_day_cutoff).slice(0, 5),
      delivery_weekdays: (data.delivery_weekdays ?? []) as number[],
      notify_phones: (data.notify_phones ?? []) as string[],
    },
  };
}

/** Usuarios que pueden firmar los pedidos del asistente: activos, con acceso a la distribuidora y permiso de crear pedidos. */
export async function loadActingCandidates(unitId: string) {
  const admin = createSupabaseAdminClient();
  const [{ data: members }, { data: perm }] = await Promise.all([
    admin.from("user_business_units").select("user_id").eq("business_unit_id", unitId),
    admin.from("permissions").select("id").eq("key", "finance.distribution.orders.create").eq("active", true).maybeSingle(),
  ]);
  if (!perm || !members?.length) return [];
  const { data: roles } = await admin.from("role_permissions").select("role_id").eq("permission_id", perm.id);
  const roleIds = (roles ?? []).map((r) => r.role_id);
  if (!roleIds.length) return [];
  const { data: people } = await admin
    .from("profiles")
    .select("id,first_name,last_name,job_title")
    .in("id", members.map((m) => m.user_id))
    .in("role_id", roleIds)
    .eq("active", true)
    .is("deleted_at", null)
    .order("first_name");
  return (people ?? []).map((p) => ({ id: p.id as string, name: `${p.first_name} ${p.last_name}`.trim(), job: p.job_title as string }));
}

export async function loadAssistantOrders(supabase: Supabase, unitId: string) {
  const { data } = await supabase
    .from("dist_wa_order_links")
    .select("created_at,customer_created,dist_orders(id,order_number,delivery_date,total,status,dist_customers(name))")
    .eq("business_unit_id", unitId)
    .order("created_at", { ascending: false })
    .limit(15);
  return (data ?? []).map((l) => {
    const o = Array.isArray(l.dist_orders) ? l.dist_orders[0] : l.dist_orders;
    const c = o ? (Array.isArray(o.dist_customers) ? o.dist_customers[0] : o.dist_customers) : null;
    return { createdAt: l.created_at as string, customerCreated: l.customer_created as boolean, id: o?.id as string, number: o?.order_number as string, date: o?.delivery_date as string, total: Number(o?.total ?? 0), status: o?.status as string, customer: (c as { name?: string } | null)?.name ?? "—" };
  });
}

export async function loadAssistantEvents(supabase: Supabase, unitId: string) {
  const { data } = await supabase
    .from("dist_wa_events")
    .select("created_at,severity,event_type,message")
    .eq("business_unit_id", unitId)
    .neq("event_type", "order_created")
    .order("created_at", { ascending: false })
    .limit(10);
  return data ?? [];
}

export async function loadUsageToday(supabase: Supabase, unitId: string, today: string) {
  const { data } = await supabase.from("dist_wa_usage_daily").select("requests,cost_usd").eq("business_unit_id", unitId).eq("usage_date", today).maybeSingle();
  return { requests: data?.requests ?? 0, cost: Number(data?.cost_usd ?? 0) };
}

/** Conversación de prueba abierta del usuario, con sus mensajes. */
export async function loadSimulation(supabase: Supabase, unitId: string, userId: string) {
  const { data: conversation } = await supabase
    .from("dist_wa_conversations")
    .select("id,contact_phone,contact_name,needs_review,review_reason")
    .eq("business_unit_id", unitId)
    .eq("channel", "simulator")
    .eq("contact_jid", `simulator:${userId}`)
    .neq("status", "closed")
    .maybeSingle();
  if (!conversation) return { conversation: null, messages: [] as { id: string; direction: string; content: string | null; created_at: string }[] };
  const { data: messages } = await supabase
    .from("dist_wa_messages")
    .select("id,direction,content,created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at");
  return { conversation, messages: messages ?? [] };
}
