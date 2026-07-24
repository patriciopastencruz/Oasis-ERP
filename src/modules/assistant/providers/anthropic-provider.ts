import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ToolUnion,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  AssistantInput,
  AssistantProviderResult,
} from "@/modules/assistant/domain/types";
import type {
  AssistantTool,
  ToolContext,
} from "@/modules/assistant/tools/types";
import {
  AIProviderNotConfiguredError,
  AIProviderRequestError,
  type AIProvider,
} from "@/modules/assistant/providers/ai-provider";
import { ASSISTANT_SYSTEM_PROMPT } from "@/modules/assistant/providers/system-prompt";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOOL_ITERATIONS = 4;

const RESPOND_TOOL_NAME = "respond";

const RESPOND_TOOL: Tool = {
  name: RESPOND_TOOL_NAME,
  description:
    "Entrega la respuesta final estructurada al usuario. Debes invocar esta herramienta exactamente una vez, al final, con tu respuesta completa.",
  input_schema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "Respuesta en español para el usuario.",
      },
      actions: {
        type: "array",
        description:
          "Acciones sugeridas (navegar, resaltar un campo, abrir un modal, o sugerir una pregunta). Deja vacío si no aplica.",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["navigate", "highlight", "open_modal", "suggestion"],
            },
            label: { type: "string" },
            route: { type: "string" },
            elementId: { type: "string" },
            modalKey: { type: "string" },
            prompt: { type: "string" },
          },
          required: ["type", "label"],
        },
      },
      suggestions: {
        type: "array",
        items: { type: "string" },
        description: "Preguntas de seguimiento sugeridas (texto corto).",
      },
      missingFields: {
        type: "array",
        items: { type: "string" },
        description:
          "Campos obligatorios que detectaste como faltantes en la pantalla actual del usuario, si aplica.",
      },
      resolved: {
        type: "boolean",
        description:
          "true si respondiste con información suficiente y verificada; false si la pregunta debe registrarse como no resuelta.",
      },
      usedArticleIds: {
        type: "array",
        items: { type: "string" },
        description:
          "IDs de los artículos de conocimiento que usaste para responder.",
      },
    },
    required: [
      "message",
      "actions",
      "suggestions",
      "missingFields",
      "resolved",
      "usedArticleIds",
    ],
  },
};

function toAnthropicTool(tool: AssistantTool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Tool["input_schema"],
  };
}

function buildContextBlock(input: AssistantInput): string {
  const { context, articles } = input;
  return JSON.stringify({
    usuario: {
      nombre: context.userName,
      rol: context.roleName,
      permisos: context.permissions,
    },
    pantalla_actual: context.currentScreen,
    contexto_ui: context.uiContext,
    articulos_de_conocimiento: articles.map((a) => ({
      id: a.id,
      titulo: a.title,
      modulo: a.moduleKey,
      contenido: a.content,
      pasos: a.steps,
      rutas_relacionadas: a.relatedRoutes,
      estado_validacion: a.validationStatus,
    })),
  });
}

export class AnthropicAssistantProvider implements AIProvider {
  private client: Anthropic | null = null;
  private model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    this.model = process.env.ASSISTANT_AI_MODEL || DEFAULT_MODEL;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async generateResponse(
    input: AssistantInput,
    tools: AssistantTool[],
    toolContext?: ToolContext,
  ): Promise<AssistantProviderResult> {
    if (!this.client) {
      throw new AIProviderNotConfiguredError();
    }

    const readTools = toolContext ? tools.filter((t) => t.mode === "read") : [];
    const anthropicTools: ToolUnion[] = [
      RESPOND_TOOL,
      ...readTools.map(toAnthropicTool),
    ];

    const messages: MessageParam[] = [
      ...input.history.map((m): MessageParam => ({
        role: m.role,
        content: m.content,
      })),
      {
        role: "user",
        content: `Contexto (JSON, no lo repitas al usuario):\n${buildContextBlock(input)}\n\nPregunta del usuario: ${input.message}`,
      },
    ];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let response;
      try {
        response = await this.client.messages.create({
          model: this.model,
          max_tokens: 1500,
          system: ASSISTANT_SYSTEM_PROMPT,
          messages,
          tools: anthropicTools,
          tool_choice:
            iteration === MAX_TOOL_ITERATIONS - 1
              ? { type: "tool", name: RESPOND_TOOL_NAME }
              : { type: "auto" },
        });
      } catch (error) {
        throw new AIProviderRequestError(
          error instanceof Error
            ? error.message
            : "Error al contactar al proveedor de IA.",
        );
      }

      const respondBlock = response.content.find(
        (b) => b.type === "tool_use" && b.name === RESPOND_TOOL_NAME,
      );
      if (respondBlock && respondBlock.type === "tool_use") {
        const raw = respondBlock.input as Record<string, unknown>;
        return {
          message: typeof raw.message === "string" ? raw.message : "",
          actions: Array.isArray(raw.actions)
            ? (raw.actions as AssistantProviderResult["actions"])
            : [],
          suggestions: Array.isArray(raw.suggestions)
            ? (raw.suggestions as string[])
            : [],
          missingFields: Array.isArray(raw.missingFields)
            ? (raw.missingFields as string[])
            : [],
          resolved: raw.resolved === true,
          usedArticleIds: Array.isArray(raw.usedArticleIds)
            ? (raw.usedArticleIds as string[])
            : [],
        };
      }

      const toolUseBlocks = response.content.filter(
        (b) => b.type === "tool_use",
      );
      if (toolUseBlocks.length === 0) {
        throw new AIProviderRequestError(
          "El proveedor de IA no devolvió una respuesta estructurada.",
        );
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          if (block.type !== "tool_use") return null;
          const tool = readTools.find((t) => t.name === block.name);
          if (!tool || !toolContext) {
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: "Herramienta no disponible.",
              is_error: true,
            };
          }
          try {
            const output = await tool.execute(block.input, toolContext);
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify(output),
            };
          } catch (error) {
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content:
                error instanceof Error
                  ? error.message
                  : "Error al ejecutar la herramienta.",
              is_error: true,
            };
          }
        }),
      );

      messages.push({
        role: "user",
        content: toolResults.filter(
          (r): r is NonNullable<typeof r> => r !== null,
        ),
      });
    }

    throw new AIProviderRequestError(
      "El proveedor de IA no devolvió una respuesta estructurada.",
    );
  }
}
