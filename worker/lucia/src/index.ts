import { createClient } from "@supabase/supabase-js";
import type { Boom } from "@hapi/boom";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  delay,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  generateMessageIDV2,
  getContentType,
  isJidBot,
  isJidBroadcast,
  isJidGroup,
  isJidMetaAI,
  isJidNewsletter,
  isJidStatusBroadcast,
  isLidUser,
  isPnUser,
  jidDecode,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  type WAMessage,
  type WASocket,
} from "baileys";
import { pino } from "pino";
import { loadSupabaseAuthState } from "./auth-state.js";

/**
 * Worker de Lucía: mantiene vinculado el WhatsApp central (Baileys), guarda
 * cada mensaje en el ERP, pide a Lucía el borrador y envía lo que el equipo
 * aprobó, con pausa "escribiendo…" y límite por minuto. No conoce la clave
 * de Claude: la IA corre en el ERP (/api/lucia/process).
 */

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

const SUPABASE_URL = env("SUPABASE_URL");
const SUPABASE_SECRET_KEY = env("SUPABASE_SECRET_KEY");
const ERP_URL = env("ERP_URL").replace(/\/$/, "");
const WORKER_SECRET = env("LUCIA_WORKER_SECRET");
// Espera tras el último mensaje del cliente antes de pedir respuesta: la
// gente escribe en varias burbujas seguidas.
const DEBOUNCE_MS = Number(process.env.LUCIA_DEBOUNCE_MS ?? 8000);

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let sock: WASocket | null = null;
let connected = false;
let reconnectAttempts = 0;
let sending = false;
// Ids de los mensajes que envía este worker: su eco "fromMe" no es del equipo.
const ownMessageIds = new Set<string>();
const pendingProcess = new Map<string, NodeJS.Timeout>();

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

async function logEvent(
  companyId: string,
  severity: "info" | "warning" | "error",
  eventType: string,
  message: string,
  context: Record<string, unknown> = {},
) {
  logger[severity === "error" ? "error" : severity === "warning" ? "warn" : "info"]({ eventType, ...context }, message);
  await admin
    .rpc("lucia_record_event", {
      payload: { company_id: companyId, severity, event_type: eventType, message, context },
    })
    .then(({ error }) => error && logger.error({ error }, "no se pudo registrar el evento"));
}

async function setStatus(companyId: string, payload: Record<string, unknown>) {
  await rpc("lucia_worker_status", { payload: { company_id: companyId, ...payload } }).catch((error) =>
    logger.error({ error: String(error) }, "no se pudo actualizar el estado"),
  );
}

function ignoredChat(jid: string) {
  return Boolean(
    isJidGroup(jid) ||
      isJidStatusBroadcast(jid) ||
      isJidBroadcast(jid) ||
      isJidNewsletter(jid) ||
      isJidBot(jid) ||
      isJidMetaAI(jid),
  );
}

type Extracted = { type: string; text: string | null } | null;

/** Tipo y texto del mensaje; null para mensajes técnicos (reacciones, protocolo…). */
function extractContent(message: WAMessage): Extracted {
  const content = normalizeMessageContent(message.message);
  const kind = getContentType(content);
  if (!content || !kind) return null;
  switch (kind) {
    case "conversation":
      return { type: "text", text: content.conversation ?? null };
    case "extendedTextMessage":
      return { type: "text", text: content.extendedTextMessage?.text ?? null };
    case "imageMessage":
      return { type: "image", text: content.imageMessage?.caption ?? null };
    case "videoMessage":
    case "ptvMessage":
      return { type: "video", text: content.videoMessage?.caption ?? null };
    case "audioMessage":
      return { type: "audio", text: null };
    case "documentMessage":
      return { type: "document", text: content.documentMessage?.fileName ?? null };
    case "stickerMessage":
      return { type: "sticker", text: null };
    case "locationMessage":
    case "liveLocationMessage":
      return { type: "location", text: null };
    case "contactMessage":
    case "contactsArrayMessage":
      return { type: "contact", text: null };
    case "protocolMessage":
    case "reactionMessage":
    case "senderKeyDistributionMessage":
    case "pollUpdateMessage":
    case "messageContextInfo":
    case "keepInChatMessage":
    case "pinInChatMessage":
    case "editedMessage":
      return null;
    default:
      return { type: "other", text: null };
  }
}

// Comprobantes y archivos de clientes: bucket privado, solo la clave de servicio lee.
const MEDIA_BUCKET = "lucia-media";
const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const MEDIA_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/**
 * Guarda la imagen o PDF que mandó un cliente, para adjuntarla al aviso del
 * comprobante. Si falla, el mensaje igual se registra (el aviso va sin archivo).
 */
async function saveCustomerMedia(companyId: string, message: WAMessage) {
  const content = normalizeMessageContent(message.message);
  const media = content?.imageMessage ?? content?.documentMessage;
  const mime = media?.mimetype?.split(";")[0].trim() ?? "";
  const extension = MEDIA_EXTENSIONS[mime];
  if (!media || !extension || Number(media.fileLength ?? 0) > MEDIA_MAX_BYTES) return null;
  try {
    const buffer = await downloadMediaMessage(
      message,
      "buffer",
      {},
      { logger, reuploadRequest: (m) => sock!.updateMediaMessage(m) },
    );
    if (buffer.length > MEDIA_MAX_BYTES) return null;
    const month = new Date().toISOString().slice(0, 7);
    const path = `${companyId}/${month}/${message.key.id ?? generateMessageIDV2()}.${extension}`;
    const { error } = await admin.storage.from(MEDIA_BUCKET).upload(path, buffer, { contentType: mime, upsert: true });
    if (error) throw new Error(error.message);
    return { path, name: content?.documentMessage?.fileName ?? null };
  } catch (error) {
    logger.warn({ error: String(error) }, "no se pudo guardar el archivo del cliente");
    return null;
  }
}

/**
 * Identidad del chat. WhatsApp puede entregar un LID (id anónimo) en vez del
 * número; si Baileys trae el número alternativo se usa ese, para que el
 * filtro de contactos excluidos y la ficha tengan teléfono.
 */
function chatIdentity(message: WAMessage) {
  const remote = jidNormalizedUser(message.key.remoteJid ?? "");
  const alt = message.key.remoteJidAlt ? jidNormalizedUser(message.key.remoteJidAlt) : undefined;
  const pnJid = isPnUser(remote) ? remote : alt && isPnUser(alt) ? alt : undefined;
  const jid = pnJid ?? remote;
  const user = pnJid ? jidDecode(pnJid)?.user : undefined;
  return { jid, phone: user ? `+${user}` : null, isLid: !pnJid && Boolean(isLidUser(remote)) };
}

function scheduleProcessing(companyId: string, conversationId: string) {
  clearTimeout(pendingProcess.get(conversationId));
  pendingProcess.set(
    conversationId,
    setTimeout(async () => {
      pendingProcess.delete(conversationId);
      try {
        const response = await fetch(`${ERP_URL}/api/lucia/process`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${WORKER_SECRET}` },
          body: JSON.stringify({ conversation_id: conversationId }),
          signal: AbortSignal.timeout(90_000),
        });
        if (!response.ok) {
          await logEvent(companyId, "error", "process_failed", `El ERP respondió ${response.status} al pedir el borrador.`, {
            conversation_id: conversationId,
            body: (await response.text()).slice(0, 500),
          });
        }
      } catch (error) {
        await logEvent(companyId, "error", "process_failed", `No se pudo contactar al ERP: ${String(error)}`, {
          conversation_id: conversationId,
        });
      }
    }, DEBOUNCE_MS),
  );
}

async function handleIncoming(companyId: string, message: WAMessage) {
  const remote = message.key.remoteJid;
  if (!remote || ignoredChat(remote) || !message.message) return;
  const id = message.key.id ?? undefined;
  if (message.key.fromMe && id && ownMessageIds.has(id)) return;
  const content = extractContent(message);
  if (!content) return;
  const { jid, phone, isLid } = chatIdentity(message);
  const media =
    !message.key.fromMe && (content.type === "image" || content.type === "document")
      ? await saveCustomerMedia(companyId, message)
      : null;
  const result = await rpc<{ status: string; conversation_id?: string; process?: boolean }>("lucia_ingest_message", {
    payload: {
      company_id: companyId,
      jid,
      phone,
      external_id: id,
      message_type: content.type,
      content: content.text,
      push_name: message.key.fromMe ? null : message.pushName,
      from_me: Boolean(message.key.fromMe),
      app_url: ERP_URL,
      media_path: media?.path ?? null,
      media_name: media?.name ?? null,
    },
  });
  if (isLid && result.status === "ok") {
    logger.warn({ jid }, "chat sin número visible (LID): no se puede aplicar el filtro de excluidos por teléfono");
  }
  if (result.process && result.conversation_id) scheduleProcessing(companyId, result.conversation_id);
}

/** Envía de a un mensaje en cola, simulando que alguien escribe. */
async function drainOutbox(companyId: string) {
  if (!sock || !connected || sending) return;
  sending = true;
  try {
    for (;;) {
      // kind: "customer" (cliente) o "staff" (aviso a un encargado).
      const job = await rpc<{
        kind: string;
        id: string;
        jid: string;
        content: string;
        message_type?: string;
        media_path?: string | null;
        media_name?: string | null;
      } | null>("lucia_claim_outbound", {
        target_company: companyId,
      });
      if (!job) break;
      const messageId = generateMessageIDV2(sock.user?.id);
      ownMessageIds.add(messageId);
      try {
        await sock.presenceSubscribe(job.jid).catch(() => undefined);
        await sock.sendPresenceUpdate("composing", job.jid);
        const isImage = job.message_type === "image" && Boolean(job.media_path);
        const isDocument = job.message_type === "document" && Boolean(job.media_path);
        const typingMs = isImage || isDocument
          ? 1_000 + Math.floor(Math.random() * 1_000)
          : Math.min(6_000, 900 + job.content.length * 25) + Math.floor(Math.random() * 800);
        await delay(typingMs);
        await sock.sendPresenceUpdate("paused", job.jid);
        if (job.kind === "customer") {
          const { data: queued } = await admin
            .from("lucia_messages")
            .select("conversation_id,created_at,sender_type,message_type")
            .eq("id", job.id)
            .maybeSingle();
          if (queued?.sender_type === "lucia" && queued.message_type === "text") {
            const { data: newerInbound } = await admin
              .from("lucia_messages")
              .select("id")
              .eq("conversation_id", queued.conversation_id)
              .eq("direction", "inbound")
              .gt("created_at", queued.created_at)
              .limit(1);
            if (newerInbound?.length) {
              const { error: omitError } = await admin
                .from("lucia_messages")
                .update({ delivery_status: "failed", error_message: "Respuesta omitida: llegó un mensaje más reciente del cliente." })
                .eq("id", job.id)
                .eq("delivery_status", "sending");
              if (!omitError) continue;
            }
          }
        }
        if (isImage || isDocument) {
          // Fotos de habitaciones (a clientes) o comprobantes (avisos al equipo):
          // buckets privados del ERP, se leen con la clave de servicio.
          const bucket = job.kind === "staff" ? MEDIA_BUCKET : "lucia-photos";
          const { data: file, error: downloadError } = await admin.storage.from(bucket).download(job.media_path!);
          if (downloadError || !file) throw new Error(`No se pudo leer el archivo: ${downloadError?.message ?? "sin archivo"}`);
          const buffer = Buffer.from(await file.arrayBuffer());
          if (isImage) {
            await sock.sendMessage(job.jid, { image: buffer, caption: job.content }, { messageId });
          } else {
            await sock.sendMessage(
              job.jid,
              {
                document: buffer,
                mimetype: file.type || "application/pdf",
                fileName: job.media_name ?? "comprobante.pdf",
                caption: job.content,
              },
              { messageId },
            );
          }
        } else {
          await sock.sendMessage(job.jid, { text: job.content }, { messageId });
        }
        await rpc("lucia_mark_outbound", { payload: { kind: job.kind, id: job.id, ok: true, external_id: messageId } });
      } catch (error) {
        ownMessageIds.delete(messageId);
        await rpc("lucia_mark_outbound", { payload: { kind: job.kind, id: job.id, ok: false, error: String(error) } });
      }
      if (ownMessageIds.size > 5_000) ownMessageIds.clear();
      // Pausa entre mensajes para no enviar ráfagas.
      await delay(1_000 + Math.floor(Math.random() * 1_000));
    }
  } catch (error) {
    logger.error({ error: String(error) }, "error en la cola de envío");
  } finally {
    sending = false;
  }
}

/**
 * Guarda los grupos de WhatsApp en los que está el número de Lucía, para que
 * en Configuración se elija el grupo del equipo (avisos de chats sin respuesta).
 */
async function syncGroups(companyId: string) {
  try {
    if (!sock) return;
    const groups = Object.values(await sock.groupFetchAllParticipating());
    const { data: settings } = await admin.from("lucia_settings").select("business_unit_id").eq("company_id", companyId).single();
    if (!settings) return;
    const rows = groups.map((g) => ({
      company_id: companyId,
      business_unit_id: settings.business_unit_id,
      jid: g.id,
      subject: (g.subject ?? "").slice(0, 200),
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error } = await admin.from("lucia_wa_groups").upsert(rows, { onConflict: "company_id,jid" });
      if (error) throw new Error(error.message);
    }
    const ids = rows.map((r) => r.jid);
    // Los grupos de los que el número salió dejan de ofrecerse.
    let stale = admin.from("lucia_wa_groups").delete().eq("company_id", companyId);
    if (ids.length) stale = stale.not("jid", "in", `(${ids.map((id) => `"${id}"`).join(",")})`);
    await stale;
  } catch (error) {
    logger.warn({ error: String(error) }, "no se pudieron leer los grupos de WhatsApp");
  }
}

async function connect(companyId: string) {
  const auth = await loadSupabaseAuthState(admin, companyId);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  sock = makeWASocket({
    ...(version ? { version } : {}),
    logger: logger.child({ module: "baileys" }, { level: "warn" }),
    auth: { creds: auth.state.creds, keys: makeCacheableSignalKeyStore(auth.state.keys, logger) },
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", () => {
    auth.saveCreds().catch((error) => logger.error({ error: String(error) }, "no se pudo guardar la sesión"));
  });

  sock.ev.on("connection.update", async (update) => {
    if (update.qr) await setStatus(companyId, { status: "qr_pending", qr: update.qr });
    if (update.connection === "connecting") await setStatus(companyId, { status: "connecting" });
    if (update.connection === "open") {
      connected = true;
      reconnectAttempts = 0;
      const phone = sock?.user?.id ? `+${jidDecode(sock.user.id)?.user ?? ""}` : null;
      await setStatus(companyId, { status: "connected", phone });
      await logEvent(companyId, "info", "connected", `WhatsApp conectado${phone ? ` (${phone})` : ""}.`);
      void syncGroups(companyId);
    }
    if (update.connection === "close") {
      connected = false;
      const code = (update.lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        await logEvent(companyId, "warning", "logged_out", "Se cerró la sesión desde el teléfono. Hay que escanear un QR nuevo.");
        await auth.clear();
        await setStatus(companyId, { status: "disconnected" });
        setTimeout(() => void connect(companyId), 3_000);
        return;
      }
      if (code === DisconnectReason.connectionReplaced) {
        // Otra instancia tomó la sesión (por ejemplo, un redeploy): esta se retira.
        await logEvent(companyId, "warning", "connection_replaced", "Otra instancia del worker tomó la conexión; esta se detiene.");
        process.exit(0);
      }
      reconnectAttempts += 1;
      const wait = Math.min(60_000, 2_000 * 2 ** Math.min(reconnectAttempts, 5));
      await setStatus(companyId, { status: "error", error: `Conexión cerrada (código ${code ?? "?"}); reintento en ${wait / 1000} s` });
      setTimeout(() => void connect(companyId), wait);
    }
  });

  // Cuando agregan al número de Lucía a un grupo (o le cambian el nombre), se actualiza la lista.
  sock.ev.on("groups.upsert", () => void syncGroups(companyId));
  sock.ev.on("groups.update", () => void syncGroups(companyId));

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const message of messages) {
      // "append" también trae mensajes recientes escritos desde el teléfono;
      // se ignora lo antiguo para no reprocesar historial.
      const sentAt = Number(message.messageTimestamp ?? 0) * 1000;
      if (type !== "notify" && Date.now() - sentAt > 5 * 60_000) continue;
      try {
        await handleIncoming(companyId, message);
      } catch (error) {
        await logEvent(companyId, "error", "ingest_failed", `No se pudo registrar un mensaje: ${String(error)}`);
      }
    }
  });
}

async function main() {
  const { data: settings, error } = await admin.from("lucia_settings").select("company_id").limit(2);
  if (error) throw new Error(`No se pudo leer lucia_settings: ${error.message}`);
  const companyId = process.env.LUCIA_COMPANY_ID ?? settings?.[0]?.company_id;
  if (!companyId) throw new Error("No hay configuración de Lucía en la base (lucia_settings).");
  if (!process.env.LUCIA_COMPANY_ID && (settings?.length ?? 0) > 1)
    throw new Error("Hay más de una empresa con Lucía: define LUCIA_COMPANY_ID.");

  await connect(companyId);
  setInterval(() => void drainOutbox(companyId), 4_000);
  setInterval(() => void setStatus(companyId, {}), 60_000);
  // Cada minuto: anula reservas pendientes cuyo plazo venció y recontacta a
  // quien no respondió en 20 minutos (la base decide a quién y qué decir).
  setInterval(() => {
    rpc<number>("lucia_expire_holds", { target_company: companyId }).catch((error) =>
      logger.error({ error: String(error) }, "no se pudieron vencer las reservas pendientes"),
    );
    rpc<number>("lucia_send_followups", { target_company: companyId }).catch((error) =>
      logger.error({ error: String(error) }, "no se pudieron enviar los recontactos"),
    );
    // Chats cuya pausa terminó con un mensaje del cliente sin responder: Lucía retoma.
    rpc<string[] | null>("lucia_resume_after_pause", { target_company: companyId })
      .then((ids) => (ids ?? []).forEach((id) => scheduleProcessing(companyId, id)))
      .catch((error) => logger.error({ error: String(error) }, "no se pudieron retomar los chats en pausa"));
    // Casos sin respuesta del equipo hace 30 minutos: aviso al grupo del equipo.
    rpc<number>("lucia_escalate_unanswered", { target_company: companyId }).catch((error) =>
      logger.error({ error: String(error) }, "no se pudieron avisar los chats sin respuesta"),
    );
  }, 60_000);
  // Los grupos cambian poco: se vuelven a leer cada 6 horas.
  setInterval(() => void syncGroups(companyId), 6 * 60 * 60_000);

  const shutdown = async () => {
    logger.info("deteniendo worker");
    await setStatus(companyId, { status: "connecting" });
    sock?.end(undefined);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  logger.fatal({ error: String(error) }, "el worker no pudo iniciar");
  process.exit(1);
});
