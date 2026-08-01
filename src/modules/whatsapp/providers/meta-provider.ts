import "server-only";
import { normalizePhoneNumber } from "@/modules/whatsapp/domain/phone";
import {
  WhatsAppProviderNotConfiguredError,
  type ConnectionCheckResult,
  type NormalizedInboundMessage,
  type SendMessageResult,
  type SendTemplateMessageInput,
  type SendTextMessageInput,
  type WhatsAppProvider,
} from "./whatsapp-provider";

/**
 * Estructura preparada para Meta WhatsApp Cloud API, aun no funcional.
 * Deja explícito el mapeo de campos que tendría cada método cuando se
 * implemente, para que la migración desde Twilio no requiera rediseñar el
 * resto del agente (webhook, inbound-service, tools) -- solo esta clase.
 *
 * Mapeo de referencia (Cloud API -> NormalizedInboundMessage):
 *  - entry[0].changes[0].value.metadata.display_phone_number -> toNumber
 *  - entry[0].changes[0].value.messages[0].from               -> fromNumber
 *  - entry[0].changes[0].value.messages[0].id                 -> externalMessageId
 *  - entry[0].changes[0].value.messages[0].type                -> messageType
 *  - entry[0].changes[0].value.messages[0].text.body            -> content
 *  - entry[0].changes[0].value.contacts[0].profile.name          -> profileName
 * Firma del webhook: X-Hub-Signature-256, HMAC-SHA256 sobre el body crudo
 * usando META_APP_SECRET (no META_WHATSAPP_ACCESS_TOKEN).
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta" as const;

  isConfigured(): boolean {
    return false;
  }

  normalizePhoneNumber(raw: string): string | null {
    return normalizePhoneNumber(raw);
  }

  verifyWebhookSignature(): boolean {
    return false;
  }

  parseWebhook(): NormalizedInboundMessage | null {
    return null;
  }

  async sendTextMessage(
    _input: SendTextMessageInput,
  ): Promise<SendMessageResult> {
    throw new WhatsAppProviderNotConfiguredError(
      "El proveedor Meta WhatsApp Cloud API aún no está implementado.",
    );
  }

  async sendTemplateMessage(
    _input: SendTemplateMessageInput,
  ): Promise<SendMessageResult> {
    throw new WhatsAppProviderNotConfiguredError(
      "El proveedor Meta WhatsApp Cloud API aún no está implementado.",
    );
  }

  async checkConnection(): Promise<ConnectionCheckResult> {
    return {
      ok: false,
      error: "El proveedor Meta WhatsApp Cloud API aún no está implementado.",
    };
  }
}
