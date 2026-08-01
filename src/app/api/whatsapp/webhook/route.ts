import { after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/modules/whatsapp/providers";
import { AnthropicWhatsAppAgent } from "@/modules/whatsapp/agent/anthropic-agent";
import { SupabaseWindowRateLimiter } from "@/modules/whatsapp/application/rate-limit";
import { handleInboundMessage } from "@/modules/whatsapp/application/inbound-service";
import { recordIntegrationEvent } from "@/modules/whatsapp/application/events";

export const runtime = "nodejs";
export const maxDuration = 60;

function emptyTwiml() {
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { status: 200, headers: { "Content-Type": "text/xml" } },
  );
}

/**
 * Webhook público de WhatsApp (Twilio), sin sesión de usuario -- misma
 * familia de rutas que api/cron/lodging-ical (secreto) y
 * api/ical/rooms/[...parts] (admin client sin RLS). Aquí la
 * "autenticación" es la firma HMAC de Twilio, verificada antes de tocar
 * cualquier dato. Responde 200 de inmediato y procesa el mensaje con la
 * IA en `after()`, para no bloquear la respuesta a Twilio (que reintenta
 * si no responde rápido).
 */
export async function POST(request: Request) {
  const provider = getWhatsAppProvider();
  const bodyText = await request.text();
  const params = Object.fromEntries(new URLSearchParams(bodyText));

  const signatureHeader = request.headers.get("x-twilio-signature");
  // La URL usada para firmar debe ser la URL pública exacta configurada
  // en Twilio -- request.url puede diferir en protocolo/host detrás del
  // proxy de Vercel y romper la firma en todos los casos.
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL || request.url;
  const validSignature = provider.verifyWebhookSignature({
    url: webhookUrl,
    params,
    signatureHeader,
  });

  const admin = createSupabaseAdminClient();

  if (!validSignature) {
    await recordIntegrationEvent(admin, {
      eventType: "invalid_signature",
      severity: "error",
      message: "Firma de webhook inválida.",
      context: { url: webhookUrl },
    });
    return new Response("Firma inválida", { status: 403 });
  }

  const parsed = provider.parseWebhook(params);
  if (!parsed) {
    await recordIntegrationEvent(admin, {
      eventType: "parse_error",
      severity: "warning",
      message: "No fue posible interpretar el payload del webhook.",
    });
    return emptyTwiml();
  }

  after(async () => {
    try {
      const agent = new AnthropicWhatsAppAgent();
      const rateLimiter = new SupabaseWindowRateLimiter();
      await handleInboundMessage({ admin, provider, agent, rateLimiter }, parsed);
    } catch (error) {
      await recordIntegrationEvent(admin, {
        eventType: "ai_error",
        severity: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error inesperado procesando el mensaje entrante.",
      });
    }
  });

  return emptyTwiml();
}
