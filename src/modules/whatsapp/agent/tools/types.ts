import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Contexto inyectado por el orquestador (inbound-service.ts), nunca por
 * el modelo. company_id/business_unit_id/lead_id/conversation_id ya
 * fueron resueltos por whatsapp_ingest_inbound_message a partir del
 * número receptor del webhook — ninguna tool puede sobrescribirlos.
 */
export type WhatsAppToolContext = {
  admin: SupabaseClient;
  companyId: string;
  businessUnitId: string;
  integrationId: string;
  leadId: string;
  conversationId: string;
};

export type WhatsAppTool<Input = unknown, Output = unknown> = {
  name: string;
  description: string;
  mode: "read" | "write";
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute(input: Input, context: WhatsAppToolContext): Promise<Output>;
};
