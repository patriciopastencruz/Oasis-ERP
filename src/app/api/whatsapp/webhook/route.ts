import { after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/modules/whatsapp/providers";
import { AnthropicWhatsAppAgent } from "@/modules/whatsapp/agent/anthropic-agent";
import { SupabaseWindowRateLimiter } from "@/modules/whatsapp/application/rate-limit";
import { handleInboundMessage } from "@/modules/whatsapp/application/inbound-service";
import { recordIntegrationEvent } from "@/modules/whatsapp/application/events";

export const runtime = "nodejs";
export const maxDuration = 60;

function acknowledge(providerName: "twilio" | "meta") {
  if (providerName === "twilio") {
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { "Content-Type": "text/xml" } },
    );
  }
  return Response.json({ ok: true });
}

/**
 * Handshake de suscripción del webhook (solo lo usa Meta WhatsApp Cloud
 * API: GET con hub.mode/hub.verify_token/hub.challenge). Twilio no tiene
 * este mecanismo -- verifyChallenge() siempre devuelve null para Twilio.
 */
export async function GET(request: Request) {
  const provider = getWhatsAppProvider();
  const { searchParams } = new URL(request.url);
  const challenge = provider.verifyChallenge(searchParams);
  if (challenge === null) {
    return new Response("No autorizado", { status: 403 });
  }
  return new Response(challenge, { status: 200 });
}

/**
 * Webhook público de WhatsApp, sin sesión de usuario -- misma familia de
 * rutas que api/cron/lodging-ical (secreto) y api/ical/rooms/[...parts]
 * (admin client sin RLS). La "autenticación" es la firma del proveedor
 * (HMAC-SHA1 de Twilio o HMAC-SHA256 de Meta), verificada antes de tocar
 * cualquier dato. Responde de inmediato y procesa el mensaje con la IA en
 * `after()`, para no bloquear la respuesta (ambos proveedores reintentan
 * si no responden rápido).
 */
export async function POST(request: Request) {
  const provider = getWhatsAppProvider();
  const rawBody = await request.text();

  const signatureHeader = request.headers.get(provider.signatureHeaderName);
  // La URL usada para firmar debe ser la URL pública exacta configurada
  // en la consola del proveedor -- request.url puede diferir en
  // protocolo/host detrás del proxy de Vercel y romper la firma en todos
  // los casos (solo relevante para Twilio; Meta firma sobre el body).
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL || request.url;
  const validSignature = provider.verifyWebhookSignature({
    url: webhookUrl,
    rawBody,
    signatureHeader,
  });

  const admin = createSupabaseAdminClient();

  if (!validSignature) {
    await recordIntegrationEvent(admin, {
      eventType: "invalid_signature",
      severity: "error",
      message: "Firma de webhook inválida.",
      context: { url: webhookUrl, provider: provider.name },
    });
    return new Response("Firma inválida", { status: 403 });
  }

  const parsed = provider.parseWebhook(rawBody);
  if (!parsed) {
    // Meta envía también webhooks de "statuses" (confirmaciones de
    // entrega) sin mensaje entrante -- parseWebhook devuelve null para
    // esos casos sin que sea un error real, así que no se registra evento.
    return acknowledge(provider.name);
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

  return acknowledge(provider.name);
}
