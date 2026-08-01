import type { WhatsAppAgentOutput } from "@/modules/whatsapp/agent/output-schema";
import type {
  WhatsAppTool,
  WhatsAppToolContext,
} from "@/modules/whatsapp/agent/tools/types";

export type AgentHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type WhatsAppAgentLeadSnapshot = {
  fullName: string | null;
  city: string | null;
  productInterest: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  surfaceM2: number | null;
  budgetClp: number | null;
  phoneE164: string;
};

export type WhatsAppAgentInput = {
  agentName: string;
  customerMessage: string;
  lead: WhatsAppAgentLeadSnapshot;
  history: AgentHistoryMessage[];
};

export class WhatsAppAgentNotConfiguredError extends Error {
  constructor(message = "El agente de WhatsApp no está configurado.") {
    super(message);
    this.name = "WhatsAppAgentNotConfiguredError";
  }
}

export class WhatsAppAgentRequestError extends Error {
  constructor(message = "El agente de WhatsApp no pudo responder.") {
    super(message);
    this.name = "WhatsAppAgentRequestError";
  }
}

/**
 * Interfaz intercambiable del motor de IA del agente comercial. Copia el
 * patrón de `src/modules/assistant/providers/ai-provider.ts` — a
 * diferencia del Asistente ERP (solo lectura), aquí las tools SÍ incluyen
 * escrituras acotadas (crear/actualizar lead, escalar, pausar), porque es
 * el propósito central de este agente.
 */
export interface WhatsAppAgentProvider {
  isConfigured(): boolean;
  generateReply(
    input: WhatsAppAgentInput,
    tools: WhatsAppTool[],
    toolContext: WhatsAppToolContext,
  ): Promise<WhatsAppAgentOutput>;
}
