import { createClient } from "@supabase/supabase-js";

if (!process.argv.includes("--confirm-production-simulations")) {
  throw new Error("Falta --confirm-production-simulations");
}

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}`);
  return value;
};
const db = createClient(required("SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const erpUrl = required("ERP_URL").replace(/\/$/, "");
const workerSecret = required("LUCIA_WORKER_SECRET");
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const casesArgument = process.argv.find((argument) => argument.startsWith("--cases="));
const selectedCases = casesArgument
  ? new Set(casesArgument.slice("--cases=".length).split(",").map((value) => Number(value.trim())))
  : null;

const scenarios = [
  ["pareja baño privado", ["Hola, somos 2 y necesitamos una habitación con baño privado para mañana, una noche", "Sí, llegamos el 23 de octubre y salimos el 24", "La opción de Hostal Oasis Centro con baño privado me interesa. Soy Daniela Rojas, ¿cómo reservo?"]],
  ["persona sola central", ["Buenas, busco algo central para una persona del 26 al 28 de octubre", "¿Cuál es la opción más económica de las que me indicaste?", "Perfecto, ¿me puedes mandar fotos de esa habitación?"]],
  ["grupo cinco", ["Hola, somos 5 personas, llegamos el 30 de octubre y salimos el 1 de noviembre. ¿Tienen alojamiento?", "Nos sirve dividirnos en una pieza para 3 y otra para 2", "Queremos reservar esa combinación, ¿qué necesitan?"]],
  ["familia cuatro", ["Somos una familia de 4, dos adultos y dos niños. Buscamos desde el 2 al 4 de noviembre", "Preferimos baño privado y estacionamiento", "¿Cuál hostal nos recomiendas?"]],
  ["precio sin fechas", ["Hola, ¿cuánto sale una habitación para dos?", "Sería del 5 al 7 de noviembre", "Con baño privado por favor"]],
  ["fechas relativas", ["Necesito pieza para mañana por dos noches, somos 2", "Sí, correcto: entramos el 23 y salimos el 25 de octubre", "Muéstrame todas las alternativas por favor"]],
  ["fechas contradictorias", ["Quiero reservar del viernes 23 al sábado 24 por dos noches para una persona", "Perdón, son dos noches: entro el viernes 23 y salgo el domingo 25", "Sí, revisa disponibilidad"]],
  ["cambio de fechas", ["Somos dos, del 27 al 29 de octubre", "En realidad cambia la salida al 30 de octubre", "Queremos baño privado"]],
  ["cambio de personas", ["Busco habitación del 3 al 5 de noviembre para 2 personas", "Se suma otra persona, finalmente somos 3", "¿Qué opciones hay entonces?"]],
  ["preferencia estricta", ["Hola, necesito alojamiento para una persona del 8 al 10 de noviembre, solo con baño privado", "No quiero baño compartido", "¿Hay alguna alternativa en las otras hostales?"]],
  ["solicitud de fotos", ["¿Me puedes mostrar fotos de las habitaciones de Hostal Oasis Cobija?", "Me interesan las fotos del mini departamento", "¿Para cuántas personas sirve?"]],
  ["cliente en camino", ["Quiero ir a conocer Hostal Oasis Centro para ver una pieza", "Ah ya perfecto, pasaré a verlo altiro"]],
  ["cliente en la entrada", ["Voy a Hostal Oasis Centro a consultar por una pieza", "Ya llegué, estoy afuera y nadie me abre"]],
  ["pago al llegar", ["Necesito habitación para dos del 10 al 11 de noviembre", "Me interesa la opción más barata", "¿Puedo pagar cuando llegue sin hacer abono?"]],
  ["reserva con nombre", ["Hola, soy Carlos Muñoz. Quiero reservar para mí del 12 al 14 de noviembre", "Elijo la opción más económica de Hostal Uruguay", "Sí, quiero reservar esa opción"]],
  ["mensajes separados", ["Hola", "Necesito una pieza", "Para 2 personas", "Llegamos el 15 de noviembre", "Nos vamos el 17", "Con baño privado"]],
  ["escritura informal", ["ola nesesito piesa pa 2", "pal 18 asta el 20 de noviembre", "ojala con baño pribado y serca del centro"]],
  ["cliente molesto", ["Me dieron información distinta antes y estoy molesto, siento que perdí el tiempo", "Quiero que una persona revise mi caso"]],
  ["descuento", ["Somos 2 del 20 al 23 de noviembre, ¿tienen disponibilidad?", "Si me quedo tres noches, ¿me hacen descuento especial?", "¿Puedes confirmarme el descuento ahora?"]],
  ["estadía larga parking", ["Hola, necesito alojamiento para una persona del 24 de noviembre al 1 de diciembre", "Viajo en auto, necesito estacionamiento", "También quisiera desayuno, ¿qué me recomiendas?"]],
];

const { data: settings, error: settingsError } = await db
  .from("lucia_settings")
  .select("company_id,business_unit_id")
  .single();
if (settingsError) throw settingsError;

async function sendCustomerMessage(conversationId, content) {
  const { data: conversation, error: conversationError } = await db
    .from("lucia_conversations")
    .select("company_id,business_unit_id")
    .eq("id", conversationId)
    .single();
  if (conversationError) throw conversationError;
  const { error: messageError } = await db.from("lucia_messages").insert({
    company_id: conversation.company_id,
    business_unit_id: conversation.business_unit_id,
    conversation_id: conversationId,
    direction: "inbound",
    sender_type: "customer",
    message_type: "text",
    content,
    delivery_status: "received",
  });
  if (messageError) throw messageError;

  const response = await fetch(`${erpUrl}/api/lucia/process`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${workerSecret}`,
    },
    body: JSON.stringify({ conversation_id: conversationId }),
    signal: AbortSignal.timeout(90_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.status === "error") {
    throw new Error(`ERP ${response.status}: ${JSON.stringify(result)}`);
  }
}

console.log(`QA_RUN=${runId}`);
for (let index = 0; index < scenarios.length; index += 1) {
  if (selectedCases && !selectedCases.has(index + 1)) continue;
  const [label, messages] = scenarios[index];
  const number = String(index + 1).padStart(2, "0");
  const { data: conversation, error } = await db
    .from("lucia_conversations")
    .insert({
      company_id: settings.company_id,
      business_unit_id: settings.business_unit_id,
      channel: "simulator",
      contact_jid: `sim:qa20:${runId}:${number}`,
      contact_name: `QA20 ${runId} ${number} ${label}`,
    })
    .select("id")
    .single();
  if (error) throw error;

  let failure = null;
  for (const message of messages) {
    try {
      await sendCustomerMessage(conversation.id, message);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      break;
    }
  }
  console.log(`${number}/${selectedCases ? selectedCases.size : scenarios.length} ${label}: ${failure ? `ERROR ${failure}` : "OK"}`);
}
console.log(`QA_COMPLETE=${runId}`);
