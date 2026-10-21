import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";

export async function luciaContext(permission: string) {
  const ctx = await requirePermission(permission);
  const supabase = await createSupabaseServerClient();
  const { data: settings } = await supabase
    .from("lucia_settings")
    .select(
      "id,company_id,business_unit_id,agent_name,general_instructions,model,daily_budget_usd,max_messages_per_minute,history_messages,budget_exceeded_on,connection_status,qr_updated_at,connected_phone,worker_heartbeat_at,last_connection_error",
    )
    .maybeSingle();
  if (!settings) redirect("/no-access");
  return { ctx, supabase, settings };
}

export type LuciaHostel = {
  business_unit_id: string;
  display_name: string;
  manual: string;
  manager_name: string | null;
  manager_phone: string | null;
  mode: "draft" | "auto";
  payment_instructions: string;
  deposit_percent: number;
  hold_minutes: number;
  enabled: boolean;
  code: string;
};

export async function loadHostels(supabase: SupabaseClient): Promise<LuciaHostel[]> {
  const { data } = await supabase
    .from("lucia_hostels")
    .select(
      "business_unit_id,display_name,manual,manager_name,manager_phone,mode,enabled,payment_instructions,deposit_percent,hold_minutes,business_units(code)",
    )
    .order("display_name");
  return (data ?? []).map((row) => {
    const unit = Array.isArray(row.business_units) ? row.business_units[0] : row.business_units;
    return { ...row, code: (unit as { code?: string } | null)?.code ?? "" } as LuciaHostel;
  });
}

export const prospectStatusLabels: Record<string, string> = {
  new: "Nuevo",
  quoted: "Cotizado",
  pre_reserved: "Pre-reserva",
  confirmed: "Confirmado",
  lost: "Perdido",
};

export const channelLabels: Record<string, string> = {
  whatsapp: "WhatsApp",
  simulator: "Simulador",
  instagram: "Instagram",
};

export type InboxRow = {
  id: string;
  channel: string;
  status: string;
  contact_name: string | null;
  contact_phone: string | null;
  guest_name: string | null;
  prospect_status: string;
  check_in: string | null;
  check_out: string | null;
  guests: number | null;
  hostel_assigned: boolean;
  business_unit_id: string;
  needs_review: boolean;
  review_reason: string | null;
  paused_until: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  unanswered_since: string | null;
  quoted_amount: number | null;
  booking_status: string;
  pending_drafts: { count: number }[];
};

export type InboxFilters = {
  prospect?: string;
  hostel?: string;
  channel?: string;
  view?: "activos" | "revision" | "seguimiento" | "cerrados";
};

export async function loadInbox(
  supabase: SupabaseClient,
  filters: InboxFilters,
): Promise<InboxRow[]> {
  let query = supabase
    .from("lucia_conversations")
    .select(
      "id,channel,status,contact_name,contact_phone,guest_name,prospect_status,check_in,check_out,guests,hostel_assigned,business_unit_id,needs_review,review_reason,paused_until,last_message_at,last_inbound_at,last_outbound_at,unanswered_since,quoted_amount,booking_status,pending_drafts:lucia_drafts(count)",
    )
    .eq("pending_drafts.status", "pending")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (filters.view === "cerrados") query = query.eq("status", "closed");
  else query = query.neq("status", "closed");
  if (filters.view === "revision") query = query.eq("needs_review", true);
  if (filters.view === "seguimiento") {
    // Cotizados que no respondieron en 24 h: lo último fue nuestro y hace más de un día.
    query = query
      .eq("prospect_status", "quoted")
      .lt("last_outbound_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  }
  if (filters.prospect) query = query.eq("prospect_status", filters.prospect);
  if (filters.channel) query = query.eq("channel", filters.channel);
  if (filters.hostel === "sin_asignar") query = query.eq("hostel_assigned", false);
  else if (filters.hostel) query = query.eq("business_unit_id", filters.hostel).eq("hostel_assigned", true);
  const { data } = await query;
  const rows = (data ?? []) as InboxRow[];
  if (filters.view !== "seguimiento") return rows;
  return rows.filter(
    (r) => !r.last_inbound_at || !r.last_outbound_at || r.last_outbound_at > r.last_inbound_at,
  );
}

export async function loadConversation(supabase: SupabaseClient, id: string) {
  const [{ data: conversation }, { data: messages }, { data: drafts }] = await Promise.all([
    supabase.from("lucia_conversations").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("lucia_messages")
      .select(
        "id,direction,sender_type,message_type,content,delivery_status,error_message,created_at,sent_at,sender:profiles!lucia_messages_sender_user_id_fkey(first_name,last_name)",
      )
      .eq("conversation_id", id)
      .order("created_at")
      .limit(500),
    supabase
      .from("lucia_drafts")
      .select(
        "id,content,intent,needs_human,reason,extracted,status,edited,auto_sent,model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd,created_at",
      )
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  return { conversation, messages: messages ?? [], drafts: drafts ?? [] };
}

export const bookingStatusLabels: Record<string, string> = {
  awaiting_reception: "Esperando confirmación de recepción",
  awaiting_payment: "Esperando pago",
  proof_received: "Comprobante recibido: verificar",
  confirmed: "Reserva confirmada",
  expired: "Venció el plazo de pago",
  rejected: "Sin disponibilidad",
};

/** Habitaciones de la hostal libres para la estadía que admiten a todas las personas. */
export async function loadFreeRooms(
  supabase: SupabaseClient,
  unitId: string,
  checkIn: string,
  checkOut: string,
  guests: number,
) {
  const [{ data: rooms }, { data: busy }] = await Promise.all([
    supabase
      .from("lodging_rooms")
      .select("id,name,room_type,capacity,display_order")
      .eq("business_unit_id", unitId)
      .eq("active", true)
      .gte("capacity", guests)
      .not("status", "in", '("maintenance","out_of_service")')
      .order("display_order"),
    supabase
      .from("lodging_reservations")
      .select("room_id")
      .eq("business_unit_id", unitId)
      .not("status", "in", '("cancelled","conflict")')
      .lt("check_in", checkOut)
      .gt("check_out", checkIn),
  ]);
  const taken = new Set((busy ?? []).map((b) => b.room_id));
  return (rooms ?? []).filter((r) => !taken.has(r.id));
}

export async function loadTodayUsage(supabase: SupabaseClient) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(
    new Date(),
  );
  const { data } = await supabase
    .from("lucia_usage_daily")
    .select("usage_date,requests,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd")
    .order("usage_date", { ascending: false })
    .limit(14);
  return { today, days: data ?? [] };
}
