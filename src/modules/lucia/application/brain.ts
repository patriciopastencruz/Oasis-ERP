import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatTurn } from "@/modules/lucia/domain/history";
import {
  luciaOutputSchema,
  luciaRespondToolSchema,
  type LuciaOutput,
} from "@/modules/lucia/domain/output-schema";
import { LUCIA_BASE_RULES } from "@/modules/lucia/domain/prompt";
import type { ClaudeUsage } from "@/modules/lucia/domain/pricing";

const RESPOND_TOOL = "responder";

export class LuciaBrainError extends Error {}

export type LuciaBrainResult = {
  output: LuciaOutput;
  usage: ClaudeUsage;
  model: string;
};

let client: Anthropic | null = null;
function anthropic() {
  // La clave vive solo en el servidor (variable de entorno), nunca en la base.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new LuciaBrainError("Falta ANTHROPIC_API_KEY en el servidor.");
  client ??= new Anthropic({ apiKey });
  return client;
}

const AVAILABILITY_TOOL = "consultar_disponibilidad";
const MAX_CALLS = 3;

export type AvailabilityChecker = (query: { check_in: string; check_out: string; guests: number }) => Promise<unknown>;

/**
 * Pide a Claude la respuesta y la ficha. Antes de responder puede consultar
 * la disponibilidad real del ERP (solo lectura); la última vuelta fuerza la
 * herramienta "responder". Reglas + instrucciones + manuales van en el system
 * con cache_control: son el prefijo estable entre conversaciones (las
 * herramientas, que van antes, también quedan en caché). La fecha de hoy va al
 * final del último turno para no romper ese prefijo.
 */
export async function generateLuciaReply(input: {
  model: string;
  knowledge: string;
  turns: ChatTurn[];
  today: string;
  todayIso: string;
  /** Estado de la conversación (p. ej. de la reserva), fuera del prefijo en caché. */
  stateNote?: string | null;
  checkAvailability: AvailabilityChecker;
}): Promise<LuciaBrainResult> {
  if (input.turns.length === 0 || input.turns.at(-1)?.role !== "user") {
    throw new LuciaBrainError("No hay un mensaje del cliente que responder.");
  }
  const messages: Anthropic.MessageParam[] = input.turns.map((turn, index) =>
    index === input.turns.length - 1
      ? {
          role: "user",
          content: [
            { type: "text", text: turn.content },
            {
              type: "text",
              text: `[Contexto del sistema, no lo cites: hoy es ${input.today} (${input.todayIso}, hora de Chile).${input.stateNote ? ` ${input.stateNote}` : ""}]`,
            },
          ],
        }
      : { role: turn.role, content: turn.content },
  );
  const tools: Anthropic.Tool[] = [
    {
      name: AVAILABILITY_TOOL,
      description:
        "Consulta en el ERP las habitaciones libres de las hostales para TODAS las noches de una estadía y su precio según la cantidad de personas. Úsala cuando el cliente pregunte por disponibilidad o precios y ya sepas llegada, salida y personas.",
      input_schema: {
        type: "object",
        properties: {
          check_in: { type: "string", description: "Fecha de llegada AAAA-MM-DD" },
          check_out: { type: "string", description: "Fecha de salida AAAA-MM-DD (el día que se va)" },
          guests: { type: "integer", description: "Cantidad total de personas" },
        },
        required: ["check_in", "check_out", "guests"],
      },
    },
    {
      name: RESPOND_TOOL,
      description: "Entrega la respuesta para el cliente y la ficha del prospecto. Siempre termina con esta herramienta.",
      input_schema: luciaRespondToolSchema,
    },
  ];
  const usage: ClaudeUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let model = input.model;

  for (let call = 0; call < MAX_CALLS; call++) {
    let response: Anthropic.Message;
    try {
      response = await anthropic().messages.create({
        model: input.model,
        max_tokens: 1024,
        system: [
          { type: "text", text: LUCIA_BASE_RULES },
          { type: "text", text: input.knowledge, cache_control: { type: "ephemeral" } },
        ],
        tools,
        tool_choice: call === MAX_CALLS - 1 ? { type: "tool", name: RESPOND_TOOL } : { type: "any" },
        messages,
      });
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new LuciaBrainError(`Claude respondió ${error.status ?? "sin estado"}: ${error.message}`);
      }
      throw new LuciaBrainError(
        error instanceof Error ? error.message : "No se pudo contactar a Claude.",
      );
    }
    model = response.model;
    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;
    usage.cache_read_input_tokens! += response.usage.cache_read_input_tokens ?? 0;
    usage.cache_creation_input_tokens! += response.usage.cache_creation_input_tokens ?? 0;

    const respond = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === RESPOND_TOOL,
    );
    if (respond) {
      const parsed = luciaOutputSchema.safeParse(respond.input);
      if (!parsed.success) {
        // Solo campo y motivo: nunca el contenido de la conversación.
        const detail = parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`)
          .join("; ");
        throw new LuciaBrainError(`Claude no devolvió una respuesta válida (${detail}).`);
      }
      return { output: parsed.data, usage, model };
    }

    const lookups = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === AVAILABILITY_TOOL,
    );
    if (!lookups.length) continue;
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: await Promise.all(
        lookups.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
          try {
            const result = await input.checkAvailability(block.input as { check_in: string; check_out: string; guests: number });
            return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) };
          } catch {
            return { type: "tool_result", tool_use_id: block.id, content: "No se pudo consultar la disponibilidad.", is_error: true };
          }
        }),
      ),
    });
  }
  throw new LuciaBrainError("Claude no entregó una respuesta.");
}
