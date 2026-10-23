import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { clientSaidIt, type ChatTurn } from "@/modules/lucia/domain/history";
import {
  luciaOutputSchema,
  luciaRespondToolSchema,
  repairLeakedParameters,
  repairUnsupportedPhotoPromise,
  type LuciaOutput,
} from "@/modules/lucia/domain/output-schema";
import { LUCIA_BASE_RULES } from "@/modules/lucia/domain/prompt";
import { validateStayAgainstCustomerText } from "@/modules/lucia/domain/stay-validation";
import { detectWalkInStatus } from "@/modules/lucia/domain/walk-in";
import type { ClaudeUsage } from "@/modules/lucia/domain/pricing";
import type { AvailabilityQuery } from "./availability-tool";

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
const MAX_CALLS = 4;
const FUTURE_AVAILABILITY_PROMISE =
  /\b(?:dejame|permiteme|voy a|vamos a|puedo)\s+(?:revisar|consultar|confirmar|verificar)|\b(?:consultare|revisare|confirmare|verificare)\b/;
const PRIVATE_BATH_PREFERENCE = /\b(?:bano|baño)\s+privado\b/;
const CONVERSATIONAL_FOLLOW_UP =
  /\b(?:pagar|pago|abono|transferencia|descuento|mas barata|más barata|me interesa|elijo|elegir|reservar|reserva)\b/;
const COMPLAINT =
  /\b(?:gracias por nada|reclamo|pesim[oa]|mal servicio|mala atencion|molest[oa]|enojad[oa]|quiero hablar con (?:alguien|una persona|un encargado)|no me ayudaste|perdida de tiempo)\b/;
const HUMAN_HANDOFF = /\b(?:persona|equipo|encargad[oa]|recepcion|revisar(?:a|an)?|contactar(?:a|an)?)\b/;

const plain = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export type AvailabilityChecker = (query: AvailabilityQuery) => Promise<unknown>;

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
  /** Lo que escribió el cliente en esta consulta: las fechas deben salir de ahí. */
  customerText: string;
  /** Ya existe una hostal asignada aunque el modelo no repita su código. */
  hostelAssigned?: boolean;
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
          fechas_del_cliente: {
            type: "string",
            description:
              "Copia textual de las palabras, en esta consulta, donde el cliente dice cuándo llega y se va o cuántas noches (por ejemplo «del 25 al 27 de noviembre»). Si tú le propusiste las fechas y él respondió que sí, copia tus propias palabras con esas fechas (por ejemplo «llegas mañana 22 de octubre y te vas el 23 de octubre»). Si nadie las dijo, no uses esta herramienta: pregúntale.",
          },
          solo_bano_privado: {
            type: "boolean",
            description: "true si el cliente pidió baño privado: se muestran solo esas opciones.",
          },
        },
        required: ["check_in", "check_out", "guests", "fechas_del_cliente"],
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
  let availabilityWasChecked = false;
  let availabilityWasAttempted = false;
  let availabilitySummary: string | null = null;
  let availabilityHasOptions = false;

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
      const parsed = luciaOutputSchema.safeParse(repairLeakedParameters(respond.input));
      if (!parsed.success) {
        // Solo campo y motivo: nunca el contenido de la conversación.
        const detail = parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`)
          .join("; ");
        throw new LuciaBrainError(`Claude no devolvió una respuesta válida (${detail}).`);
      }
      let output = repairUnsupportedPhotoPromise(parsed.data);
      const hasStay = Boolean(output.prospect.check_in && output.prospect.check_out && output.prospect.guests);
      const latestCustomerMessage = input.turns.at(-1)?.content ?? "";
      const changedAvailabilityPreference =
        hasStay && PRIVATE_BATH_PREFERENCE.test(latestCustomerMessage.toLowerCase());
      const postponedAvailability =
        (output.intent === "availability" || output.intent === "price" || changedAvailabilityPreference) &&
        hasStay &&
        ((!availabilityWasChecked && !availabilityWasAttempted) ||
          FUTURE_AVAILABILITY_PROMISE.test(plain(output.reply)));
      if (postponedAvailability && call < MAX_CALLS - 1) {
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: respond.id,
            content:
              "Respuesta rechazada: ya tienes llegada, salida y personas. No prometas consultar después ni afirmes disponibilidad sin comprobarla. Usa consultar_disponibilidad ahora y responde con su resultado en este mismo mensaje.",
            is_error: true,
          }],
        });
        continue;
      }
      // Claude recibe el resumen exacto desde la herramienta, pero a veces lo
      // abrevia, omite líneas o incluso altera un total al redactarlo. Cuando
      // hubo una consulta real, el sistema arma el mensaje final y conserva el
      // resumen literalmente para que precios y disponibilidad sean fiables.
      const shouldUseExactAvailabilitySummary =
        !availabilityHasOptions ||
        (!CONVERSATIONAL_FOLLOW_UP.test(latestCustomerMessage.toLowerCase()) &&
          (output.intent === "availability" ||
            output.intent === "price" ||
            changedAvailabilityPreference));
      if (availabilityWasChecked && availabilitySummary && shouldUseExactAvailabilitySummary) {
        output = {
          ...output,
          reply: availabilityHasOptions
            ? `Estas son las opciones que encontré para tu estadía 😊\n\n${availabilitySummary}\n\n¿Cuál opción te acomoda?`
            : `${availabilitySummary}\n\nSi quieres, puedo revisar otras fechas.`,
        };
      }
      const detectedWalkIn = detectWalkInStatus(latestCustomerMessage);
      // Una alerta operacional nunca se basa solo en la interpretación del
      // modelo: frases como «pagar cuando llegue» pueden parecer una llegada
      // actual aunque hablen de una fecha futura. Solo alertamos cuando el
      // mensaje más reciente contiene una señal inmediata verificable.
      const walkInStatus = detectedWalkIn;
      if (walkInStatus && (input.hostelAssigned || output.prospect.hostel_code)) {
        const atEntrance = walkInStatus === "at_entrance";
        return {
          output: {
            ...output,
            reply: atEntrance
              ? "Ya avisé a recepción y administración que estás en la entrada para que puedan atenderte lo antes posible. 🙏"
              : "Perfecto, ya avisé a recepción y administración que vas en camino para que puedan recibirte. 📍",
            needs_human: atEntrance || output.needs_human,
            reason: atEntrance
              ? "Cliente esperando en la entrada: atención inmediata"
              : output.reason,
            walk_in_alert: { status: walkInStatus },
          },
          usage,
          model,
        };
      }
      if (COMPLAINT.test(plain(latestCustomerMessage))) {
        const reply = HUMAN_HANDOFF.test(plain(output.reply))
          ? output.reply
          : "Entiendo tu molestia y lamento la confusión con la información entregada. Voy a dejar este caso para que una persona del equipo lo revise.";
        return {
          output: {
            ...output,
            reply,
            intent: "complaint",
            needs_human: true,
            reason: output.reason ?? "Cliente molesto: requiere revisión humana",
          },
          usage,
          model,
        };
      }
      return { output, usage, model };
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
          // Las fechas nunca se suponen (p. ej. «hoy» o las de una consulta
          // anterior): deben estar escritas por el cliente en esta consulta.
          if (!clientSaidIt((block.input as { fechas_del_cliente?: unknown }).fechas_del_cliente, input.customerText)) {
            return {
              type: "tool_result",
              tool_use_id: block.id,
              content:
                "No consultado: esas palabras no aparecen en lo que el cliente escribió o confirmó en esta consulta. Si el cliente escribió sus fechas, copia sus palabras exactas en fechas_del_cliente; si confirmó con un «sí» las fechas que tú le propusiste, copia exactamente tu frase con esas fechas. Si nadie las dijo, no supongas: pregúntale qué día llega y qué día se va.",
              is_error: true,
            };
          }
          try {
            const query = block.input as AvailabilityQuery;
            availabilityWasAttempted = true;
            const inconsistency = validateStayAgainstCustomerText(query, input.customerText, input.todayIso);
            if (inconsistency) {
              return { type: "tool_result", tool_use_id: block.id, content: `No consultado: ${inconsistency}`, is_error: true };
            }
            const result = await input.checkAvailability(query);
            availabilityWasChecked = true;
            if (result && typeof result === "object") {
              const record = result as {
                ok?: unknown;
                resumen_whatsapp?: unknown;
                hostales?: unknown;
              };
              if (record.ok === true && typeof record.resumen_whatsapp === "string") {
                availabilitySummary = record.resumen_whatsapp;
                availabilityHasOptions = Array.isArray(record.hostales) && record.hostales.length > 0;
              }
            }
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
