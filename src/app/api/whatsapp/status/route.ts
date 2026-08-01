import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/modules/whatsapp/providers";
import { recordIntegrationEvent } from "@/modules/whatsapp/application/events";

export const runtime = "nodejs";

function mapTwilioStatus(status: string | undefined): string {
  switch (status) {
    case "queued":
    case "sent":
    case "delivered":
    case "read":
      return status;
    case "failed":
    case "undelivered":
      return "failed";
    default:
      return "sent";
  }
}

/**
 * Callback de estado de entrega de Twilio (StatusCallback). Meta no usa
 * esta ruta: sus confirmaciones de entrega llegan como webhooks de
 * "statuses" al mismo endpoint que los mensajes (/api/whatsapp/webhook),
 * donde se ignoran de forma segura por ahora (ver comentario en esa ruta).
 */
export async function POST(request: Request) {
  const provider = getWhatsAppProvider();
  const rawBody = await request.text();
  const signatureHeader = request.headers.get(provider.signatureHeaderName);
  const webhookUrl =
    process.env.WHATSAPP_STATUS_CALLBACK_URL ||
    process.env.WHATSAPP_WEBHOOK_URL ||
    request.url;

  const admin = createSupabaseAdminClient();
  const validSignature = provider.verifyWebhookSignature({
    url: webhookUrl,
    rawBody,
    signatureHeader,
  });
  if (!validSignature) {
    await recordIntegrationEvent(admin, {
      eventType: "invalid_signature",
      severity: "error",
      message: "Firma inválida en el callback de estado de entrega.",
      context: { url: webhookUrl },
    });
    return new Response("Firma inválida", { status: 403 });
  }

  const params = Object.fromEntries(new URLSearchParams(rawBody));
  const messageSid = params.MessageSid;
  if (messageSid) {
    await admin.rpc("whatsapp_record_delivery_status", {
      payload: {
        provider: "twilio",
        external_message_id: messageSid,
        delivery_status: mapTwilioStatus(params.MessageStatus),
        error_message: params.ErrorMessage || null,
      },
    });
  }

  return new Response(null, { status: 200 });
}
