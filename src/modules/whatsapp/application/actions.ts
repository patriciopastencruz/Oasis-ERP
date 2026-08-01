"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { whatsappContext } from "@/modules/whatsapp/application/queries";
import {
  leadEditSchema,
  manualReplySchema,
} from "@/modules/whatsapp/application/schemas";

const uuid = z.string().uuid();

function done(path: string, type: "success" | "error", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${type}=${encodeURIComponent(message)}`);
}
function errorMessage(error: { message?: string } | null) {
  const value = error?.message ?? "No fue posible completar la operación.";
  if (/autoriz|permission|row-level/i.test(value))
    return "No tienes autorización para esta acción.";
  return value;
}

export async function takeConversationAction(form: FormData) {
  const { supabase } = await whatsappContext("whatsapp.inbox.reply");
  const id = uuid.parse(form.get("conversation_id"));
  const returnPath = `/whatsapp/${id}`;
  const { error } = await supabase.rpc("whatsapp_take_conversation", {
    target_conversation: id,
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/whatsapp");
  revalidatePath(returnPath);
  done(returnPath, "success", "Tomaste la conversación.");
}

export async function releaseToAiAction(form: FormData) {
  const { supabase } = await whatsappContext("whatsapp.agent.control");
  const id = uuid.parse(form.get("conversation_id"));
  const returnPath = `/whatsapp/${id}`;
  const { error } = await supabase.rpc("whatsapp_release_to_ai", {
    target_conversation: id,
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/whatsapp");
  revalidatePath(returnPath);
  done(returnPath, "success", "La conversación vuelve a manos de la IA.");
}

export async function pauseAgentAction(form: FormData) {
  const { supabase } = await whatsappContext("whatsapp.agent.control");
  const id = uuid.parse(form.get("conversation_id"));
  const returnPath = `/whatsapp/${id}`;
  const { error } = await supabase.rpc("whatsapp_pause_agent", {
    target_conversation: id,
    reason: String(form.get("reason") ?? ""),
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/whatsapp");
  revalidatePath(returnPath);
  done(returnPath, "success", "Se pausó la automatización.");
}

export async function assignConversationAction(form: FormData) {
  const { supabase } = await whatsappContext("whatsapp.conversations.assign");
  const id = uuid.parse(form.get("conversation_id"));
  const returnPath = `/whatsapp/${id}`;
  const { error } = await supabase.rpc("whatsapp_assign_conversation", {
    target_conversation: id,
    new_assignee: String(form.get("assignee_id") ?? ""),
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/whatsapp");
  revalidatePath(returnPath);
  done(returnPath, "success", "Conversación asignada.");
}

export async function sendManualReplyAction(form: FormData) {
  const { supabase } = await whatsappContext("whatsapp.inbox.reply");
  const parsed = manualReplySchema.safeParse({
    conversation_id: form.get("conversation_id"),
    content: form.get("content"),
  });
  const returnPath = `/whatsapp/${String(form.get("conversation_id") ?? "")}`;
  if (!parsed.success) {
    done(returnPath, "error", parsed.error.issues[0]?.message ?? "Mensaje inválido.");
  }
  const { data: messageId, error } = await supabase.rpc(
    "whatsapp_record_outbound_reply",
    {
      payload: {
        conversation_id: parsed.data.conversation_id,
        content: parsed.data.content,
      },
    },
  );
  if (error) done(returnPath, "error", errorMessage(error));

  const { getWhatsAppProvider } = await import(
    "@/modules/whatsapp/providers"
  );
  const { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .select(
      "provider,lead:crm_leads!whatsapp_conversations_lead_id_fkey(phone_e164),integration:whatsapp_integrations!whatsapp_conversations_integration_id_fkey(phone_number_e164)",
    )
    .eq("id", parsed.data.conversation_id)
    .maybeSingle();
  const lead = Array.isArray(conversation?.lead)
    ? conversation?.lead[0]
    : conversation?.lead;
  const integration = Array.isArray(conversation?.integration)
    ? conversation?.integration[0]
    : conversation?.integration;
  if (lead?.phone_e164 && integration?.phone_number_e164) {
    try {
      const provider = getWhatsAppProvider();
      const sent = await provider.sendTextMessage({
        to: lead.phone_e164,
        from: integration.phone_number_e164,
        body: parsed.data.content,
      });
      await supabase
        .from("whatsapp_messages")
        .update({ external_message_id: sent.externalMessageId, delivery_status: "sent" })
        .eq("id", messageId);
    } catch (sendError) {
      await supabase
        .from("whatsapp_messages")
        .update({
          delivery_status: "failed",
          error_message:
            sendError instanceof Error ? sendError.message : "Error al enviar.",
        })
        .eq("id", messageId);
      revalidatePath(returnPath);
      done(
        returnPath,
        "error",
        "El mensaje se guardó pero no se pudo enviar por WhatsApp. Revisa la configuración del proveedor.",
      );
    }
  }
  revalidatePath(returnPath);
  done(returnPath, "success", "Mensaje enviado.");
}

export async function closeConversationAction(form: FormData) {
  const { supabase } = await whatsappContext("whatsapp.inbox.reply");
  const id = uuid.parse(form.get("conversation_id"));
  const returnPath = `/whatsapp/${id}`;
  const { error } = await supabase.rpc("whatsapp_close_conversation", {
    target_conversation: id,
    reason: String(form.get("reason") ?? ""),
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/whatsapp");
  revalidatePath(returnPath);
  done(returnPath, "success", "Conversación cerrada.");
}

export async function requestQuotationAction(form: FormData) {
  const { supabase } = await whatsappContext("whatsapp.inbox.reply");
  const id = uuid.parse(form.get("conversation_id"));
  const returnPath = `/whatsapp/${id}`;
  const { error } = await supabase.rpc("whatsapp_request_quotation", {
    target_conversation: id,
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath(returnPath);
  done(
    returnPath,
    "success",
    "Lead marcado para cotización. Genera la cotización formal desde Ventas.",
  );
}

export async function updateLeadAction(form: FormData) {
  const { supabase } = await whatsappContext("whatsapp.leads.manage");
  const leadId = uuid.parse(form.get("lead_id"));
  const conversationId = String(form.get("conversation_id") ?? "");
  const returnPath = conversationId
    ? `/whatsapp/${conversationId}?tab=lead`
    : `/whatsapp/leads`;
  const parsed = leadEditSchema.safeParse({
    full_name: form.get("full_name"),
    city: form.get("city"),
    product_interest: form.get("product_interest") || null,
    bedrooms: form.get("bedrooms") || null,
    bathrooms: form.get("bathrooms") || null,
    surface_m2: form.get("surface_m2") || null,
    budget_clp: form.get("budget_clp") || null,
    assigned_user_id: form.get("assigned_user_id") || null,
    status: form.get("status") || null,
    source_notes: form.get("source_notes"),
  });
  if (!parsed.success) {
    done(returnPath, "error", parsed.error.issues[0]?.message ?? "Datos inválidos.");
  }
  const { error } = await supabase.rpc("whatsapp_update_lead", {
    target_lead: leadId,
    payload: parsed.data,
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/whatsapp");
  revalidatePath(returnPath);
  done(returnPath, "success", "Lead actualizado.");
}
