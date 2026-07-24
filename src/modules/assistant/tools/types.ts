import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantContext } from "@/modules/assistant/domain/types";

export type ToolContext = {
  assistantContext: AssistantContext;
  supabase: SupabaseClient;
};

/**
 * Herramienta que el asistente puede invocar. Las de modo "write" existen
 * solo como extensión futura (segunda etapa, con confirmación) — el
 * registry de esta version no incluye ninguna implementacion "write".
 */
export type AssistantTool<Input = unknown, Output = unknown> = {
  name: string;
  description: string;
  requiredPermission?: string;
  requiresConfirmation: boolean;
  mode: "read" | "write";
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute(input: Input, context: ToolContext): Promise<Output>;
};
