import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ToolUnion,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  WhatsAppTool,
  WhatsAppToolContext,
} from "@/modules/whatsapp/agent/tools/types";
import {
  whatsappAgentOutputSchema,
  type WhatsAppAgentOutput,
} from "@/modules/whatsapp/agent/output-schema";
import {
  WhatsAppAgentNotConfiguredError,
  WhatsAppAgentRequestError,
  type WhatsAppAgentInput,
  type WhatsAppAgentProvider,
} from "@/modules/whatsapp/agent/agent-provider";
import { WHATSAPP_AGENT_SYSTEM_PROMPT } from "@/modules/whatsapp/agent/system-prompt";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOOL_ITERATIONS = 4;
const RESPOND_TOOL_NAME = "responder";

const RESPOND_TOOL: Tool = {
  name: RESPOND_TOOL_NAME,
  description:
    "Entrega la respuesta final estructurada para el cliente. Invócala exactamente una vez, al final.",
  input_schema: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description: "Mensaje en español para enviar al cliente por WhatsApp (1 a 3 frases).",
      },
      intent: {
        type: "string",
        enum: ["faq", "qualification", "quote_request", "human_handoff", "unknown"],
      },
      leadUpdates: {
        type: "object",
        description: "Datos nuevos del lead detectados en este mensaje. Usa null en lo que no cambió.",
        properties: {
          full_name: { type: ["string", "null"] },
          city: { type: ["string", "null"] },
          product_interest: {
            type: ["string", "null"],
            enum: ["casa", "oficina", "bano", "otro", null],
          },
          bedrooms: { type: ["number", "null"] },
          bathrooms: { type: ["number", "null"] },
          surface_m2: { type: ["number", "null"] },
          budget_clp: { type: ["number", "null"] },
        },
        required: [
          "full_name",
          "city",
          "product_interest",
          "bedrooms",
          "bathrooms",
          "surface_m2",
          "budget_clp",
        ],
      },
      requiresHuman: {
        type: "boolean",
        description: "true si esta conversación debe pasar a un vendedor humano.",
      },
      reason: {
        type: ["string", "null"],
        description: "Motivo del escalamiento, o null si requiresHuman es false.",
      },
    },
    required: ["reply", "intent", "leadUpdates", "requiresHuman", "reason"],
  },
};

function toAnthropicTool(tool: WhatsAppTool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Tool["input_schema"],
  };
}

function buildContextBlock(input: WhatsAppAgentInput): string {
  return JSON.stringify({
    nombre_agente: input.agentName,
    lead: input.lead,
  });
}

export class AnthropicWhatsAppAgent implements WhatsAppAgentProvider {
  private client: Anthropic | null = null;
  private model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    this.model =
      process.env.WHATSAPP_AI_MODEL ||
      process.env.ASSISTANT_AI_MODEL ||
      DEFAULT_MODEL;
    if (apiKey) this.client = new Anthropic({ apiKey });
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async generateReply(
    input: WhatsAppAgentInput,
    tools: WhatsAppTool[],
    toolContext: WhatsAppToolContext,
  ): Promise<WhatsAppAgentOutput> {
    if (!this.client) throw new WhatsAppAgentNotConfiguredError();

    const anthropicTools: ToolUnion[] = [
      RESPOND_TOOL,
      ...tools.map(toAnthropicTool),
    ];

    const messages: MessageParam[] = [
      ...input.history.map((m): MessageParam => ({
        role: m.role,
        content: m.content,
      })),
      {
        role: "user",
        content: `Contexto (JSON, no lo repitas al cliente):\n${buildContextBlock(input)}\n\nMensaje del cliente: ${input.customerMessage}`,
      },
    ];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let response;
      try {
        response = await this.client.messages.create({
          model: this.model,
          max_tokens: 1000,
          system: WHATSAPP_AGENT_SYSTEM_PROMPT,
          messages,
          tools: anthropicTools,
          tool_choice:
            iteration === MAX_TOOL_ITERATIONS - 1
              ? { type: "tool", name: RESPOND_TOOL_NAME }
              : { type: "auto" },
        });
      } catch (error) {
        throw new WhatsAppAgentRequestError(
          error instanceof Error
            ? error.message
            : "Error al contactar al proveedor de IA.",
        );
      }

      const respondBlock = response.content.find(
        (b) => b.type === "tool_use" && b.name === RESPOND_TOOL_NAME,
      );
      if (respondBlock && respondBlock.type === "tool_use") {
        const parsed = whatsappAgentOutputSchema.safeParse(respondBlock.input);
        if (!parsed.success) {
          throw new WhatsAppAgentRequestError(
            "El proveedor de IA no devolvió una respuesta estructurada válida.",
          );
        }
        return parsed.data;
      }

      const toolUseBlocks = response.content.filter(
        (b) => b.type === "tool_use",
      );
      if (toolUseBlocks.length === 0) {
        throw new WhatsAppAgentRequestError(
          "El proveedor de IA no devolvió una respuesta estructurada.",
        );
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          if (block.type !== "tool_use") return null;
          const tool = tools.find((t) => t.name === block.name);
          if (!tool) {
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

    throw new WhatsAppAgentRequestError(
      "El proveedor de IA no devolvió una respuesta estructurada.",
    );
  }
}
