import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatTurn } from "@/modules/lucia/domain/history";
import type { ClaudeUsage } from "@/modules/lucia/domain/pricing";
import { distOutputSchema, distRespondToolSchema, distToolSchemas, type DistOutput } from "../domain/output-schema";
import { DIST_BASE_RULES } from "../domain/prompt";
import { runAvisar, runCotizar, runCrear, type DistToolContext, type DistToolState } from "./tools";

const RESPOND_TOOL = "responder";
const MAX_CALLS = 6;

export class DistBrainError extends Error {}

export type DistBrainResult = { output: DistOutput; usage: ClaudeUsage; model: string; state: DistToolState };

let client: Anthropic | null = null;
function anthropic() {
  // La clave vive solo en el servidor (variable de entorno), nunca en la base.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new DistBrainError("Falta ANTHROPIC_API_KEY en el servidor.");
  client ??= new Anthropic({ apiKey });
  return client;
}

/** Un punto de caché en el último bloque: la vuelta siguiente relee todo lo anterior al 10%. */
function withLoopCache(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const last = messages.at(-1);
  if (!last || typeof last.content === "string" || !last.content.length) return messages;
  const blocks = [...last.content];
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } } as Anthropic.ContentBlockParam;
  return [...messages.slice(0, -1), { ...last, content: blocks }];
}

/**
 * Pide a Claude la respuesta para el cliente. Antes puede cotizar, crear el pedido o avisar al encargado
 * (herramientas con reglas del ERP); termina siempre con la herramienta "responder". El texto final de
 * un resumen o de un pedido creado lo arma el sistema con los datos reales, para que precios, totales y
 * número de pedido nunca dependan de cómo los redacte el modelo.
 */
export async function generateDistReply(input: {
  model: string;
  knowledge: string;
  turns: ChatTurn[];
  contextNote: string;
  tools: DistToolContext;
}): Promise<DistBrainResult> {
  if (input.turns.length === 0 || input.turns.at(-1)?.role !== "user") throw new DistBrainError("No hay un mensaje del cliente que responder.");
  const messages: Anthropic.MessageParam[] = input.turns.map((turn, index) =>
    index === input.turns.length - 1
      ? {
          role: "user",
          content: [
            { type: "text", text: turn.content, cache_control: { type: "ephemeral" } },
            { type: "text", text: `[Contexto del sistema, no lo cites]\n${input.contextNote}` },
          ],
        }
      : { role: turn.role, content: turn.content },
  );
  const tools: Anthropic.Tool[] = [
    {
      name: "cotizar_pedido",
      description: "Calcula con los precios del sistema el total de un pedido y valida el día de entrega, sin crear nada. Úsala antes de pedir la confirmación al cliente.",
      input_schema: distToolSchemas.cotizar,
    },
    {
      name: "crear_pedido",
      description: "Carga el pedido en el ERP. Solo después de que el cliente confirmó el resumen exacto de cotizar_pedido.",
      input_schema: distToolSchemas.crear,
    },
    {
      name: "avisar_encargado",
      description: "Avisa al encargado de la distribuidora (cliente no registrado, pedido que supera los topes, reclamo o consulta que no puedes resolver).",
      input_schema: distToolSchemas.avisar,
    },
    { name: RESPOND_TOOL, description: "Entrega la respuesta para el cliente. Siempre termina con esta herramienta.", input_schema: distRespondToolSchema },
  ];
  const state: DistToolState = { quote: null, created: null, flagged: false };
  const usage: ClaudeUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let model = input.model;

  for (let call = 0; call < MAX_CALLS; call++) {
    let response: Anthropic.Message;
    try {
      response = await anthropic().messages.create({
        model: input.model,
        max_tokens: 1024,
        system: [
          { type: "text", text: DIST_BASE_RULES },
          { type: "text", text: input.knowledge, cache_control: { type: "ephemeral" } },
        ],
        tools,
        tool_choice: call === MAX_CALLS - 1 ? { type: "tool", name: RESPOND_TOOL } : { type: "any" },
        messages: call === 0 ? messages : withLoopCache(messages),
      });
    } catch (error) {
      if (error instanceof Anthropic.APIError) throw new DistBrainError(`Claude respondió ${error.status ?? "sin estado"}: ${error.message}`);
      throw new DistBrainError(error instanceof Error ? error.message : "No se pudo contactar a Claude.");
    }
    model = response.model;
    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;
    usage.cache_read_input_tokens! += response.usage.cache_read_input_tokens ?? 0;
    usage.cache_creation_input_tokens! += response.usage.cache_creation_input_tokens ?? 0;

    const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const others = toolBlocks.filter((b) => b.name !== RESPOND_TOOL);
    const respond = toolBlocks.find((b) => b.name === RESPOND_TOOL);

    if (respond && !others.length) {
      const parsed = distOutputSchema.safeParse(respond.input);
      if (!parsed.success) {
        const detail = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ");
        throw new DistBrainError(`Claude no devolvió una respuesta válida (${detail}).`);
      }
      let output = parsed.data;
      // El sistema escribe el mensaje cuando hubo una cotización o un pedido creado en esta respuesta.
      if (state.created) {
        const when = state.created.simulated ? " (simulación: no se guardó)" : "";
        output = {
          ...output,
          reply: `✅ Listo, tu pedido quedó registrado${when}.\nN.º de pedido: ${state.created.orderNumber}\nTotal: $${Math.round(state.created.total).toLocaleString("es-CL")}\nLa distribuidora coordina el reparto y te avisará cualquier cambio. 🧊💧`,
        };
      } else if (state.quote && !output.reply.includes(`$${Math.round(state.quote.total).toLocaleString("es-CL")}`)) {
        output = { ...output, reply: `${state.quote.summary}\n\n¿Confirmas el pedido?` };
      }
      if (state.flagged) output = { ...output, needs_human: true };
      return { output, usage, model, state };
    }
    if (!toolBlocks.length) continue;

    messages.push({ role: "assistant", content: response.content });
    const results = await Promise.all(
      toolBlocks.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
        if (block.name === RESPOND_TOOL) {
          return { type: "tool_result", tool_use_id: block.id, content: "Primero revisa los resultados de las otras herramientas y luego responde.", is_error: true };
        }
        try {
          const result =
            block.name === "cotizar_pedido"
              ? await runCotizar(input.tools, state, block.input as Record<string, never>)
              : block.name === "crear_pedido"
                ? await runCrear(input.tools, state, block.input as Record<string, never>)
                : block.name === "avisar_encargado"
                  ? await runAvisar(input.tools, state, block.input as { motivo?: string; resumen?: string })
                  : { content: "Herramienta desconocida.", isError: true };
          return { type: "tool_result", tool_use_id: block.id, content: result.content, is_error: result.isError };
        } catch (error) {
          return { type: "tool_result", tool_use_id: block.id, content: error instanceof Error ? `Error: ${error.message}` : "Error al ejecutar la herramienta.", is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  throw new DistBrainError("Claude no entregó una respuesta.");
}
