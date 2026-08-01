import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  requirePermission,
  requireSession,
} from "@/modules/platform/auth/application/session";

export async function whatsappContext(permission: string) {
  const ctx = await requirePermission(permission);
  const unit = ctx.units.find((u) => u.code === "OM");
  if (!unit) redirect("/no-access");
  const company = ctx.companies.find((c) => c.id === unit.company_id);
  if (!company) redirect("/no-access");
  return { ctx, unit, company, supabase: await createSupabaseServerClient() };
}

/**
 * whatsapp_conversations_read también deja ver a un vendedor la
 * conversación que tiene asignada aunque no tenga whatsapp.inbox.view
 * (bandeja compartida) -- exigir el permiso de entrada aquí bloquearía
 * ese caso con un redirect antes de que RLS aplique su lógica más fina.
 * Mismo criterio que projectDetailContext en sales/projects.
 */
export async function conversationDetailContext() {
  const ctx = await requireSession();
  const unit = ctx.units.find((u) => u.code === "OM");
  if (!unit) redirect("/no-access");
  const company = ctx.companies.find((c) => c.id === unit.company_id);
  if (!company) redirect("/no-access");
  return { ctx, unit, company, supabase: await createSupabaseServerClient() };
}

type PersonRef = { id?: string; first_name?: string; last_name?: string } | null;

export type InboxFilterKey =
  | "nuevas"
  | "ia"
  | "requieren_humano"
  | "mias"
  | "cerradas";

export type InboxFilters = {
  status?: InboxFilterKey;
  search?: string;
};

export type InboxRow = {
  id: string;
  status: string;
  requires_human: boolean;
  last_message_at: string | null;
  message_count: number;
  lead: {
    id: string;
    full_name: string | null;
    phone_e164: string;
    city: string | null;
    product_interest: string | null;
  } | null;
  assigned: PersonRef;
};

const INBOX_SELECT =
  "id,status,requires_human,last_message_at,message_count," +
  "lead:crm_leads!whatsapp_conversations_lead_id_fkey(id,full_name,phone_e164,city,product_interest)," +
  "assigned:profiles!whatsapp_conversations_assigned_user_id_fkey(id,first_name,last_name)";

export async function loadInbox(
  supabase: SupabaseClient,
  companyId: string,
  unitId: string,
  userId: string,
  filters: InboxFilters,
): Promise<InboxRow[]> {
  let query = supabase
    .from("whatsapp_conversations")
    .select(INBOX_SELECT)
    .eq("company_id", companyId)
    .eq("business_unit_id", unitId);

  // "nuevas" y "ia" comparten status=ai_active -- "nuevas" además acota a
  // conversaciones con pocos mensajes, como aproximación simple de "recién
  // empezó a hablar con el bot" sin depender de un campo adicional.
  if (filters.status === "nuevas") {
    query = query.eq("status", "ai_active").lte("message_count", 2);
  } else if (filters.status === "ia") {
    query = query.eq("status", "ai_active");
  } else if (filters.status === "requieren_humano") {
    query = query.eq("status", "human_required");
  } else if (filters.status === "mias") {
    query = query.eq("assigned_user_id", userId);
  } else if (filters.status === "cerradas") {
    query = query.eq("status", "closed");
  } else {
    query = query.neq("status", "closed");
  }

  if (filters.search) {
    const term = filters.search.replace(/[,()]/g, " ").trim();
    if (term) {
      query = query.or(
        `lead.full_name.ilike.%${term}%,lead.phone_e164.ilike.%${term}%,lead.city.ilike.%${term}%`,
      );
    }
  }

  query = query.order("last_message_at", { ascending: false, nullsFirst: false });

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as unknown as InboxRow[];
}

export type ConversationDetail = {
  id: string;
  company_id: string;
  business_unit_id: string;
  status: string;
  requires_human: boolean;
  ai_paused_reason: string | null;
  ai_pending_since: string | null;
  last_message_at: string | null;
  message_count: number;
  close_reason: string | null;
  closed_at: string | null;
  lead_id: string;
  assigned: PersonRef;
  closer: PersonRef;
};

const CONVERSATION_DETAIL_SELECT =
  "id,company_id,business_unit_id,status,requires_human,ai_paused_reason,ai_pending_since,last_message_at,message_count,close_reason,closed_at,lead_id," +
  "assigned:profiles!whatsapp_conversations_assigned_user_id_fkey(id,first_name,last_name)," +
  "closer:profiles!whatsapp_conversations_closed_by_fkey(first_name,last_name)";

export async function loadConversation(
  supabase: SupabaseClient,
  id: string,
): Promise<ConversationDetail | null> {
  const { data } = await supabase
    .from("whatsapp_conversations")
    .select(CONVERSATION_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  return data as unknown as ConversationDetail | null;
}

export type MessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  sender_type: "customer" | "ai" | "human" | "system";
  message_type: string;
  content: string | null;
  delivery_status: string;
  ai_intent: string | null;
  created_at: string;
};

export async function loadMessages(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<MessageRow[]> {
  const { data } = await supabase
    .from("whatsapp_messages")
    .select(
      "id,direction,sender_type,message_type,content,delivery_status,ai_intent,created_at",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as MessageRow[];
}

export type LeadDetail = {
  id: string;
  company_id: string;
  business_unit_id: string;
  phone_e164: string;
  full_name: string | null;
  city: string | null;
  product_interest: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  surface_m2: number | null;
  budget_clp: number | null;
  requires_transport: boolean | null;
  requires_installation: boolean | null;
  estimated_date: string | null;
  status: string;
  assigned_user_id: string | null;
  source_notes: string | null;
  last_interaction_at: string | null;
  created_via: string;
};

export async function loadLead(
  supabase: SupabaseClient,
  id: string,
): Promise<LeadDetail | null> {
  const { data } = await supabase
    .from("crm_leads")
    .select(
      "id,company_id,business_unit_id,phone_e164,full_name,city,product_interest,bedrooms,bathrooms,surface_m2,budget_clp,requires_transport,requires_installation,estimated_date,status,assigned_user_id,source_notes,last_interaction_at,created_via",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data as unknown as LeadDetail | null;
}

export type LeadListFilters = {
  status?: string;
  city?: string;
  assigned?: string;
};

export type LeadListRow = {
  id: string;
  full_name: string | null;
  phone_e164: string;
  city: string | null;
  product_interest: string | null;
  status: string;
  last_interaction_at: string | null;
  assigned: PersonRef;
};

const LEAD_LIST_SELECT =
  "id,full_name,phone_e164,city,product_interest,status,last_interaction_at," +
  "assigned:profiles!crm_leads_assigned_user_id_fkey(id,first_name,last_name)";

export async function listLeads(
  supabase: SupabaseClient,
  companyId: string,
  unitId: string,
  filters: LeadListFilters,
): Promise<LeadListRow[]> {
  let query = supabase
    .from("crm_leads")
    .select(LEAD_LIST_SELECT)
    .eq("company_id", companyId)
    .eq("business_unit_id", unitId)
    .is("deleted_at", null);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.city) query = query.ilike("city", `%${filters.city}%`);
  if (filters.assigned) query = query.eq("assigned_user_id", filters.assigned);

  query = query.order("last_interaction_at", { ascending: false, nullsFirst: false });

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as unknown as LeadListRow[];
}

export type IntegrationRow = {
  id: string;
  provider: string;
  phone_number_e164: string;
  display_name: string | null;
  enabled: boolean;
  automation_enabled: boolean;
  agent_name: string;
  fallback_message: string;
  connection_status: string;
  last_webhook_at: string | null;
  last_connection_check_at: string | null;
  last_connection_error: string | null;
};

export async function loadIntegration(
  supabase: SupabaseClient,
  companyId: string,
  unitId: string,
): Promise<IntegrationRow | null> {
  const { data } = await supabase
    .from("whatsapp_integrations")
    .select(
      "id,provider,phone_number_e164,display_name,enabled,automation_enabled,agent_name,fallback_message,connection_status,last_webhook_at,last_connection_check_at,last_connection_error",
    )
    .eq("company_id", companyId)
    .eq("business_unit_id", unitId)
    .maybeSingle();
  return data as unknown as IntegrationRow | null;
}

export type IntegrationEventRow = {
  id: string;
  event_type: string;
  severity: string;
  message: string;
  created_at: string;
};

export async function loadRecentEvents(
  supabase: SupabaseClient,
  companyId: string,
): Promise<IntegrationEventRow[]> {
  const { data } = await supabase
    .from("whatsapp_integration_events")
    .select("id,event_type,severity,message,created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as unknown as IntegrationEventRow[];
}

export async function listUnitSellers(
  supabase: SupabaseClient,
  companyId: string,
  unitId: string,
) {
  const { data } = await supabase.rpc("om_list_unit_members", {
    target_company: companyId,
    target_unit: unitId,
  });
  return (data ?? []) as { id: string; first_name: string; last_name: string }[];
}
