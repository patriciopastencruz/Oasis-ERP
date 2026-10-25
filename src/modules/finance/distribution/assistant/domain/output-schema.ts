import { z } from "zod";

/** Respuesta final del asistente: solo el mensaje para el cliente y si hace falta una persona. */
export const distOutputSchema = z.object({
  reply: z.string().trim().min(1).max(1200),
  needs_human: z.boolean().default(false),
  reason: z.string().trim().max(300).nullable().default(null),
});
export type DistOutput = z.infer<typeof distOutputSchema>;

export const distRespondToolSchema = {
  type: "object" as const,
  properties: {
    reply: { type: "string", description: "Mensaje para el cliente, en español de Chile, breve." },
    needs_human: { type: "boolean", description: "true si una persona del equipo debe revisar esta conversación." },
    reason: { type: ["string", "null"], description: "Motivo breve si needs_human es true; si no, null." },
  },
  required: ["reply", "needs_human", "reason"],
};

const lineSchema = {
  type: "array" as const,
  description: "Productos del pedido con cantidades enteras.",
  items: {
    type: "object" as const,
    properties: {
      product_code: { type: "string", description: "Código del producto, por ejemplo ICE-2KG." },
      quantity: { type: "integer", description: "Cantidad de unidades, entero mayor que 0." },
    },
    required: ["product_code", "quantity"],
  },
};

const orderProperties = {
  delivery_date: { type: "string", description: "Fecha de entrega AAAA-MM-DD." },
  fecha_dicha_por_el_cliente: {
    type: "string",
    description:
      "Copia textual de las palabras, en esta conversación, donde el cliente dijo el día de entrega (por ejemplo «para mañana» o «el viernes»). Si tú le propusiste el día y él dijo que sí, copia tus palabras con esa fecha. Si nadie dijo el día, no uses la herramienta: pregúntalo.",
  },
  customer_id: {
    type: "string",
    description: "customer_id del cliente registrado que te indica el contexto del sistema.",
  },
  payment_method: { type: "string", enum: ["cash", "transfer", "credit"], description: "Forma de pago: efectivo, transferencia o crédito." },
  delivery_address: { type: "string", description: "Solo si el cliente pidió entregar en una dirección distinta a la registrada." },
  estimated_time: { type: "string", description: "Hora aproximada HH:MM, solo si el cliente la pidió." },
  notes: { type: "string", description: "Indicaciones del cliente para el reparto (opcional)." },
  lines: lineSchema,
};

export const distToolSchemas = {
  cotizar: {
    type: "object" as const,
    properties: {
      delivery_date: orderProperties.delivery_date,
      fecha_dicha_por_el_cliente: orderProperties.fecha_dicha_por_el_cliente,
      customer_id: orderProperties.customer_id,
      lines: orderProperties.lines,
    },
    required: ["delivery_date", "fecha_dicha_por_el_cliente", "customer_id", "lines"],
  },
  crear: {
    type: "object" as const,
    properties: {
      ...orderProperties,
      cliente_confirmo: {
        type: "boolean",
        description:
          "true solo si el cliente respondió que sí al resumen exacto con total que le mostraste en el mensaje anterior. Si no, no llames a esta herramienta.",
      },
    },
    required: ["delivery_date", "fecha_dicha_por_el_cliente", "customer_id", "payment_method", "lines", "cliente_confirmo"],
  },
  avisar: {
    type: "object" as const,
    properties: {
      motivo: { type: "string", description: "Por qué se necesita al encargado, en una frase." },
      resumen: {
        type: "string",
        description:
          "Todo lo que el encargado necesita: nombre, dirección, productos con cantidades, día y forma de pago que dijo el cliente, o el detalle del problema.",
      },
    },
    required: ["motivo", "resumen"],
  },
};
