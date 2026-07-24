import type {
  AssistantInput,
  AssistantProviderResult,
} from "@/modules/assistant/domain/types";
import type {
  AssistantTool,
  ToolContext,
} from "@/modules/assistant/tools/types";

export class AIProviderNotConfiguredError extends Error {
  constructor(message = "El proveedor de IA no está configurado.") {
    super(message);
    this.name = "AIProviderNotConfiguredError";
  }
}

export class AIProviderRequestError extends Error {
  constructor(message = "El proveedor de IA no pudo responder.") {
    super(message);
    this.name = "AIProviderRequestError";
  }
}

/**
 * Interfaz intercambiable para el motor de IA del asistente. Permite
 * cambiar de proveedor (Anthropic, otro) sin tocar el resto del sistema.
 */
export interface AIProvider {
  generateResponse(
    input: AssistantInput,
    tools: AssistantTool[],
    toolContext?: ToolContext,
  ): Promise<AssistantProviderResult>;
}
