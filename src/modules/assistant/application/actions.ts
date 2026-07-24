"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";

export async function listAssistantConversations() {
  const ctx = await requireSession();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("assistant_conversations")
    .select("id,title,current_module,current_route,updated_at,closed_at")
    .eq("user_id", ctx.user.id)
    .order("updated_at", { ascending: false })
    .limit(30);
  return data ?? [];
}

export async function listAssistantMessages(conversationId: string) {
  const ctx = await requireSession();
  const supabase = await createSupabaseServerClient();
  const { data: conversation } = await supabase
    .from("assistant_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!conversation) return [];
  const { data } = await supabase
    .from("assistant_messages")
    .select("id,role,content,metadata,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function getAssistantWelcomeMessage(): Promise<{
  enabled: boolean;
  welcomeMessage: string | null;
}> {
  const ctx = await requireSession();
  const companyId = ctx.companies[0]?.id;
  if (!companyId) return { enabled: false, welcomeMessage: null };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("assistant_settings")
    .select("enabled,welcome_message")
    .eq("company_id", companyId)
    .maybeSingle();
  return {
    enabled: data?.enabled ?? false,
    welcomeMessage: data?.welcome_message ?? null,
  };
}
