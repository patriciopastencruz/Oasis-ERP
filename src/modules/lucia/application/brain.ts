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

/**
 * Una sola llamada a Claude que devuelve la respuesta sugerida y la ficha.
 * Reglas + instrucciones + manuales van en el system con cache_control:
 * son el prefijo estable que se reutiliza entre conversaciones. La fecha de
 * hoy va al final del último turno para no romper ese prefijo.
 */
export async function generateLuciaReply(input: {
  model: string;
  knowledge: string;
  turns: ChatTurn[];
  today: string;
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
              text: `[Contexto del sistema, no lo cites: hoy es ${input.today} (hora de Chile).]`,
            },
          ],
        }
      : { role: turn.role, content: turn.content },
  );

  let response: Anthropic.Message;
  try {
    response = await anthropic().messages.create({
      model: input.model,
      max_tokens: 1024,
      system: [
        { type: "text", text: LUCIA_BASE_RULES },
        { type: "text", text: input.knowledge, cache_control: { type: "ephemeral" } },
      ],
      tools: [
        {
          name: RESPOND_TOOL,
          description: "Entrega la respuesta para el cliente y la ficha del prospecto.",
          input_schema: luciaRespondToolSchema,
        },
      ],
      tool_choice: { type: "tool", name: RESPOND_TOOL },
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

  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === RESPOND_TOOL,
  );
  const parsed = block ? luciaOutputSchema.safeParse(block.input) : null;
  if (!parsed?.success) {
    throw new LuciaBrainError(
      `Claude no devolvió una respuesta válida (stop_reason: ${response.stop_reason}).`,
    );
  }
  return { output: parsed.data, usage: response.usage, model: response.model };
}
